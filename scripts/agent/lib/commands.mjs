// board.mjs subcommands. Each returns a JSON-serializable result ({ ok, ... }).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { parsePlan } from './plan.mjs';
import { readyTasks, blockedTasks } from './graph.mjs';
import { formatCheckpoint, parseLastCheckpoint } from './checkpoint.mjs';
import { acquireLock, heartbeat, releaseLock } from './lock.mjs';
import { planToIssues, issueBody, issueTitle, taskIdOf } from './issues.mjs';
import { runPreflight } from './preflight.mjs';
import * as gh from './github.mjs';

const PLAN_DIR = 'docs/superpowers/plans';
const LOCK_FILE = '.agent-lock';
const now = () => new Date().toISOString();

const sh = (cmd, args, cwd) => {
  try {
    return { ok: true, stdout: execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) {
    return { ok: false, stdout: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
};

const defaultPlans = () => readdirSync(PLAN_DIR).filter((f) => f.endsWith('.md')).map((f) => join(PLAN_DIR, f));
const loadTasks = (files) => files.flatMap((f) => parsePlan(readFileSync(f, 'utf8')));

const CLOSED_AS = { COMPLETED: 'completed', NOT_PLANNED: 'not_planned' };

// Joins plan tasks, issues and project items into one view.
async function boardState(p) {
  const [tasks, issues, items] = [loadTasks(defaultPlans()), await gh.listIssues(p), await gh.listItems(p)];
  const issueByTask = new Map(issues.map((i) => [taskIdOf(i.body), i]).filter(([id]) => id));
  const itemByNumber = new Map(items.map((i) => [i.content.number, i]));
  const states = tasks.map((t) => {
    const issue = issueByTask.get(t.id);
    const item = issue && itemByNumber.get(issue.number);
    return {
      ...t,
      number: issue?.number,
      itemId: item?.id,
      status: item?.status ?? 'Todo',
      closedAs: issue?.state === 'CLOSED' ? CLOSED_AS[issue.stateReason] ?? 'completed' : undefined,
      labels: (issue?.labels ?? []).map((l) => l.name),
      attempt: item?.attempt ?? 0,
      assignedAgent: item?.agent,
      assignedModel: item?.model,
    };
  });
  return { tasks: states, issues, items, itemByNumber };
}

async function itemFor(p, number) {
  const items = await gh.listItems(p);
  const item = items.find((i) => i.content.number === Number(number));
  if (!item) throw new Error(`Issue #${number} is not on the project board`);
  return item;
}

export const commands = {
  async preflight() {
    const exec = async (cmd, args) => sh(cmd, args);
    return runPreflight({
      exec,
      nodeVersion: process.versions.node,
      envVars: process.env,
      dotenv: existsSync('.env') ? readFileSync('.env', 'utf8') : '',
    });
  },

  async setup() {
    const p = await gh.setup();
    return { ok: true, project: `https://github.com/users/${p.owner}/projects/${p.projectNumber}`, repo: `https://github.com/${p.fullRepo}` };
  },

  async import({ args }) {
    const p = gh.loadProject();
    const tasks = loadTasks(args.length ? args : defaultPlans());
    let issues = await gh.listIssues(p);
    const numbers = new Map(issues.map((i) => [taskIdOf(i.body), i.number]).filter(([id]) => id));

    const first = planToIssues(tasks, issues, numbers);
    for (const t of first.create) {
      const labels = [`phase:${t.wave}`, `area:${t.area}`, ...(t.heavy ? ['heavy'] : [])];
      const { number } = await gh.createIssue(p, { title: issueTitle(t), body: issueBody(t, numbers), labels });
      numbers.set(t.id, number);
    }

    issues = await gh.listIssues(p);
    const second = planToIssues(tasks, issues, numbers);
    for (const u of second.update) await gh.editIssue(p, u.number, u);

    const itemByNumber = new Map((await gh.listItems(p)).map((i) => [i.content.number, i]));
    const issueByNumber = new Map(issues.map((i) => [i.number, i]));
    let added = 0;
    for (const t of tasks) {
      const number = numbers.get(t.id);
      let item = itemByNumber.get(number);
      if (!item) {
        const id = await gh.addItem(p, issueByNumber.get(number).url);
        await gh.setField(p, id, 'status', 'Todo');
        await gh.setField(p, id, 'attempt', 0);
        item = { id };
        added += 1;
      }
      if (item.wave !== t.wave) await gh.setField(p, item.id, 'wave', t.wave);
      if (item.agent !== t.agent) await gh.setField(p, item.id, 'agent', t.agent);
      if (item.model !== t.model) await gh.setField(p, item.id, 'model', t.model);
    }
    return { ok: true, tasks: tasks.length, created: first.create.length, updated: second.update.length, addedToBoard: added };
  },

  async ready() {
    const p = gh.loadProject();
    const { tasks } = await boardState(p);
    const byId = new Map(tasks.map((t) => [t.id, t]));
    return {
      ok: true,
      ready: readyTasks(tasks).map((id) => {
        const t = byId.get(id);
        return { id, number: t.number, title: t.title, agent: t.agent, model: t.model, heavy: t.heavy };
      }),
      running: tasks.filter((t) => ['In Progress', 'Review'].includes(t.status)).map((t) => ({ id: t.id, number: t.number, status: t.status })),
      blocked: blockedTasks(tasks),
    };
  },

  async claim({ args, opts }) {
    const p = gh.loadProject();
    const [number] = args;
    if (!number || !opts.agent || !opts.model) throw new Error('usage: claim <issue> --agent <a> --model <m>');
    const item = await itemFor(p, number);
    const attempt = (item.attempt ?? 0) + (item.status === 'In Progress' ? 0 : 1);
    await gh.setField(p, item.id, 'status', 'In Progress');
    await gh.setField(p, item.id, 'agent', opts.agent);
    await gh.setField(p, item.id, 'model', opts.model);
    await gh.setField(p, item.id, 'attempt', attempt);
    await gh.setField(p, item.id, 'heartbeat', now());
    if (item.status !== 'In Progress') {
      await gh.comment(p, number, `🤖 **Assigned** to \`${opts.agent}\` (model \`${opts.model}\`) · attempt ${attempt} · ${now()}`);
    }
    return { ok: true, number: Number(number), attempt };
  },

  async checkpoint({ args, opts }) {
    const p = gh.loadProject();
    const [number] = args;
    if (!number || !opts.done || !opts.next) throw new Error('usage: checkpoint <issue> --done <text> --next <text>');
    const item = await itemFor(p, number);
    const cp = {
      agent: item.agent ?? 'unknown', model: item.model ?? 'unknown', attempt: item.attempt ?? 1,
      done: opts.done, next: opts.next,
      branch: sh('git', ['branch', '--show-current']).stdout.trim(),
      sha: sh('git', ['rev-parse', '--short', 'HEAD']).stdout.trim(),
    };
    await gh.comment(p, number, formatCheckpoint(cp));
    await gh.setField(p, item.id, 'heartbeat', now());
    return { ok: true, number: Number(number), checkpoint: cp };
  },

  async move({ args }) {
    const p = gh.loadProject();
    const [number, ...statusParts] = args;
    const status = statusParts.join(' ');
    if (!gh.STATUSES.includes(status)) throw new Error(`status must be one of: ${gh.STATUSES.join(', ')}`);
    const item = await itemFor(p, number);
    await gh.setField(p, item.id, 'status', status);
    await gh.setField(p, item.id, 'heartbeat', now());
    const issue = (await gh.listIssues(p)).find((i) => i.number === Number(number));
    if (status === 'Done' && issue.state === 'OPEN') await gh.closeIssue(p, number, 'completed');
    if (status !== 'Done' && issue.state === 'CLOSED') await gh.reopenIssue(p, number);
    return { ok: true, number: Number(number), status };
  },

  async fail({ args, opts }) {
    const p = gh.loadProject();
    const [number] = args;
    await gh.addLabel(p, number, 'needs-human');
    await gh.comment(p, number, `⛔ **Needs a human** · ${now()}\n\n${opts.reason ?? 'Too many failed attempts.'}\n\nOther tasks continue; dependents of this task are blocked.`);
    return { ok: true, number: Number(number) };
  },

  async resume() {
    const p = gh.loadProject();
    const { tasks } = await boardState(p);
    const active = tasks.filter((t) => ['In Progress', 'Review'].includes(t.status) && t.number);
    const out = [];
    for (const t of active) {
      const checkpoint = parseLastCheckpoint(await gh.issueComments(p, t.number));
      const worktree = `.worktrees/task-${t.number}`;
      const hasWorktree = existsSync(worktree);
      const dirty = hasWorktree ? sh('git', ['status', '--porcelain'], worktree).stdout.split('\n').filter(Boolean) : [];
      const branch = checkpoint?.branch || (hasWorktree ? sh('git', ['branch', '--show-current'], worktree).stdout.trim() : null);
      const pr = branch ? await gh.prForBranch(p, branch) : null;
      out.push({ id: t.id, number: t.number, status: t.status, agent: t.assignedAgent ?? t.agent, model: t.assignedModel ?? t.model, attempt: t.attempt, checkpoint, worktree: hasWorktree ? worktree : null, dirty, pr });
    }
    return { ok: true, active: out };
  },

  async pause({ opts }) {
    const p = gh.loadProject();
    const reason = opts.reason ?? 'unspecified';
    const { tasks } = await boardState(p);
    const running = tasks.filter((t) => t.status === 'In Progress' && t.number);
    for (const t of running) {
      await gh.comment(p, t.number, `⏸️ **Paused** (${reason}) · ${now()} — the next \`/run\` resumes from the last checkpoint.`);
    }
    await gh.comment(p, p.runStatusIssue, `⏸️ **Run paused** (${reason}) · ${now()}\n\nIn progress: ${running.map((t) => `#${t.number} ${t.id}`).join(', ') || 'none'}`);
    return { ok: true, paused: running.map((t) => t.number) };
  },

  async status() {
    const p = gh.loadProject();
    const { tasks } = await boardState(p);
    const counts = Object.fromEntries(gh.STATUSES.map((s) => [s, tasks.filter((t) => t.status === s).length]));
    return { ok: true, counts, needsHuman: tasks.filter((t) => t.labels.includes('needs-human')).map((t) => t.id), blocked: blockedTasks(tasks) };
  },

  async lock() {
    const r = acquireLock(LOCK_FILE);
    return r.ok ? { ok: true } : { ok: false, error: 'Another orchestrator holds the lock', holder: r.holder };
  },

  async heartbeat() {
    heartbeat(LOCK_FILE);
    return { ok: true };
  },

  async unlock() {
    releaseLock(LOCK_FILE);
    return { ok: true };
  },
};
