// board.mjs subcommands. Each returns a JSON-serializable result ({ ok, ... }).
// Dependencies are injected (makeCommands) so the logic is testable without
// GitHub; `commands` is the real-world instance.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { parsePlan } from './plan.mjs';
import { readyTasks, blockedTasks } from './graph.mjs';
import { formatCheckpoint, parseLastCheckpoint } from './checkpoint.mjs';
import { acquireLock, heartbeat, releaseLock } from './lock.mjs';
import { planToIssues, issueBody, issueTitle, taskIdOf } from './issues.mjs';
import { runPreflight } from './preflight.mjs';
import * as github from './github.mjs';

const CLOSED_AS = { COMPLETED: 'completed', NOT_PLANNED: 'not_planned' };

export function makeCommands({ gh, sh, root, loadTasks, exists, now }) {
  const worktreeOf = (number) => join(root, '.worktrees', `task-${number}`).replace(/\\/g, '/');
  const lockFile = join(root, '.agent-lock');
  const needsHuman = (t) => t.labels.includes('needs-human');

  // Joins plan tasks, issues and project items into one view. A closed issue
  // is Done for scheduling whatever its (possibly archived) card says.
  async function boardState(p) {
    const [tasks, issues, items] = [loadTasks(), await gh.listIssues(p), await gh.listItems(p)];
    const issueByTask = new Map(issues.map((i) => [taskIdOf(i.body), i]).filter(([id]) => id));
    const itemByNumber = new Map(items.map((i) => [i.content.number, i]));
    return tasks.map((t) => {
      const issue = issueByTask.get(t.id);
      const item = issue && itemByNumber.get(issue.number);
      const closed = issue?.state === 'CLOSED';
      return {
        ...t,
        number: issue?.number,
        status: closed ? 'Done' : item?.status ?? 'Todo',
        closedAs: closed ? CLOSED_AS[issue.stateReason] ?? 'completed' : undefined,
        labels: (issue?.labels ?? []).map((l) => l.name),
        attempt: item?.attempt ?? 0,
        assignedAgent: item?.agent,
        assignedModel: item?.model,
      };
    });
  }

  async function itemFor(p, number) {
    if (!number || Number.isNaN(Number(number))) throw new Error('usage: an issue number is required');
    const item = (await gh.listItems(p)).find((i) => i.content.number === Number(number));
    if (!item) throw new Error(`Issue #${number} is not on the project board`);
    return item;
  }

  // Git state of a task's worktree; null fields when there is none.
  function worktreeGit(number) {
    const cwd = worktreeOf(number);
    if (!exists(cwd)) return { cwd: null, branch: null, sha: null };
    const branch = sh('git', ['branch', '--show-current'], cwd);
    const sha = sh('git', ['rev-parse', '--short', 'HEAD'], cwd);
    return { cwd, branch: branch.ok ? branch.stdout.trim() : null, sha: sha.ok ? sha.stdout.trim() : null };
  }

  // Only checkpoints written by the board owner are trusted (public repo).
  const ownerCheckpoint = (p, comments) =>
    parseLastCheckpoint(comments.filter((c) => c.author === p.owner).map((c) => c.body));

  return {
    async preflight() {
      return runPreflight({
        exec: async (cmd, args) => sh(cmd, args, root),
        nodeVersion: process.versions.node,
        envVars: process.env,
        dotenv: exists(join(root, '.env')) ? readFileSync(join(root, '.env'), 'utf8') : '',
      });
    },

    async setup() {
      const p = await gh.setup();
      return { ok: true, project: `https://github.com/users/${p.owner}/projects/${p.projectNumber}`, repo: `https://github.com/${p.fullRepo}` };
    },

    async import({ args }) {
      const p = gh.loadProject();
      const tasks = args.length ? args.flatMap((f) => parsePlan(readFileSync(f, 'utf8'))) : loadTasks();
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
        const issue = issueByNumber.get(number);
        let item = itemByNumber.get(number);
        if (!item) {
          // item-add returns the existing card for archived items: never reset closed work
          const id = await gh.addItem(p, issue.url);
          item = { id };
          added += 1;
          if (issue.state === 'CLOSED') continue;
          await gh.setField(p, id, 'status', 'Todo');
          await gh.setField(p, id, 'attempt', 0);
        }
        if (item.wave !== t.wave) await gh.setField(p, item.id, 'wave', t.wave);
        // Agent/Model record who actually worked on a claimed task: only plan values for Todo
        if ((item.status ?? 'Todo') === 'Todo' && issue.state !== 'CLOSED') {
          if (item.agent !== t.agent) await gh.setField(p, item.id, 'agent', t.agent);
          if (item.model !== t.model) await gh.setField(p, item.id, 'model', t.model);
        }
      }
      return { ok: true, tasks: tasks.length, created: first.create.length, updated: second.update.length, addedToBoard: added };
    },

    async ready() {
      const p = gh.loadProject();
      const tasks = await boardState(p);
      const byId = new Map(tasks.map((t) => [t.id, t]));
      return {
        ok: true,
        ready: readyTasks(tasks).map((id) => {
          const t = byId.get(id);
          return { id, number: t.number, title: t.title, agent: t.agent, model: t.model, heavy: t.heavy };
        }).filter((t) => t.number),
        running: tasks.filter((t) => ['In Progress', 'Review'].includes(t.status) && !needsHuman(t)).map((t) => ({ id: t.id, number: t.number, status: t.status })),
        blocked: blockedTasks(tasks),
      };
    },

    // A claim on a task already In Progress is a resume: same attempt, no new
    // assignment record. Status is written last so a retry after a partial
    // failure redoes the whole claim.
    async claim({ args, opts }) {
      const p = gh.loadProject();
      const [number] = args;
      if (!opts.agent || !opts.model) throw new Error('usage: claim <issue> --agent <a> --model <m>');
      const item = await itemFor(p, number);
      const resuming = item.status === 'In Progress';
      const attempt = (item.attempt ?? 0) + (resuming ? 0 : 1);
      await gh.setField(p, item.id, 'agent', opts.agent);
      await gh.setField(p, item.id, 'model', opts.model);
      await gh.setField(p, item.id, 'heartbeat', now());
      if (!resuming) {
        await gh.comment(p, number, `🤖 **Assigned** to \`${opts.agent}\` (model \`${opts.model}\`) · attempt ${attempt} · ${now()}`);
        await gh.setField(p, item.id, 'attempt', attempt);
        await gh.setField(p, item.id, 'status', 'In Progress');
      }
      return { ok: true, number: Number(number), attempt, resumed: resuming };
    },

    async checkpoint({ args, opts }) {
      const p = gh.loadProject();
      const [number] = args;
      if (!opts.done || !opts.next) throw new Error('usage: checkpoint <issue> --done <text> --next <text>');
      const item = await itemFor(p, number);
      const { branch, sha } = worktreeGit(number);
      const cp = {
        agent: item.agent ?? 'unknown', model: item.model ?? 'unknown', attempt: item.attempt ?? 1,
        done: opts.done, next: opts.next, branch, sha,
      };
      await gh.comment(p, number, formatCheckpoint(cp));
      await gh.setField(p, item.id, 'heartbeat', now());
      return { ok: true, number: Number(number), checkpoint: cp };
    },

    // Review → In Progress is a rework round and counts as a new attempt.
    async move({ args }) {
      const p = gh.loadProject();
      const [number, ...statusParts] = args;
      const status = statusParts.join(' ');
      if (!gh.STATUSES.includes(status)) throw new Error(`status must be one of: ${gh.STATUSES.join(', ')}`);
      const item = await itemFor(p, number);
      if (item.status === 'Review' && status === 'In Progress') {
        await gh.setField(p, item.id, 'attempt', (item.attempt ?? 0) + 1);
      }
      await gh.setField(p, item.id, 'heartbeat', now());
      await gh.setField(p, item.id, 'status', status);
      const issue = (await gh.listIssues(p)).find((i) => i.number === Number(number));
      if (status === 'Done' && issue?.state === 'OPEN') await gh.closeIssue(p, Number(number), 'completed');
      if (status !== 'Done' && issue?.state === 'CLOSED') await gh.reopenIssue(p, Number(number));
      return { ok: true, number: Number(number), status };
    },

    // Frees the task's slot (back to Todo); needs-human keeps it from being picked again.
    async fail({ args, opts }) {
      const p = gh.loadProject();
      const [number] = args;
      if (!number) throw new Error('usage: fail <issue> --reason <text>');
      const item = await itemFor(p, number);
      await gh.addLabel(p, Number(number), 'needs-human');
      await gh.comment(p, Number(number), `⛔ **Needs a human** · ${now()}\n\n${opts.reason ?? 'Too many failed attempts.'}\n\nOther tasks continue; dependents of this task are blocked.`);
      await gh.setField(p, item.id, 'status', 'Todo');
      return { ok: true, number: Number(number) };
    },

    async resume() {
      const p = gh.loadProject();
      const tasks = await boardState(p);
      const active = tasks.filter((t) => ['In Progress', 'Review'].includes(t.status) && t.number && !needsHuman(t));
      const out = [];
      for (const t of active) {
        const checkpoint = ownerCheckpoint(p, await gh.issueComments(p, t.number));
        const wt = worktreeGit(t.number);
        const dirty = wt.cwd ? sh('git', ['status', '--porcelain'], wt.cwd).stdout.split('\n').filter(Boolean) : [];
        const branch = checkpoint?.branch || wt.branch;
        const pr = branch ? await gh.prForBranch(p, branch) : null;
        out.push({ id: t.id, number: t.number, status: t.status, agent: t.assignedAgent ?? t.agent, model: t.assignedModel ?? t.model, attempt: t.attempt, checkpoint, worktree: wt.cwd, branch, dirty, pr });
      }
      return { ok: true, active: out };
    },

    async pause({ opts }) {
      const p = gh.loadProject();
      const reason = opts.reason ?? 'unspecified';
      const running = (await boardState(p)).filter((t) => t.status === 'In Progress' && t.number && !needsHuman(t));
      for (const t of running) {
        await gh.comment(p, t.number, `⏸️ **Paused** (${reason}) · ${now()} — the next \`/run\` resumes from the last checkpoint.`);
      }
      await gh.comment(p, p.runStatusIssue, `⏸️ **Run paused** (${reason}) · ${now()}\n\nIn progress: ${running.map((t) => `#${t.number} ${t.id}`).join(', ') || 'none'}`);
      return { ok: true, paused: running.map((t) => t.number) };
    },

    async status() {
      const p = gh.loadProject();
      const tasks = await boardState(p);
      const counts = Object.fromEntries(gh.STATUSES.map((s) => [s, tasks.filter((t) => t.status === s).length]));
      return { ok: true, counts, needsHuman: tasks.filter(needsHuman).map((t) => t.id), blocked: blockedTasks(tasks) };
    },

    async lock() {
      const r = acquireLock(lockFile);
      return r.ok ? { ok: true } : { ok: false, error: 'Another orchestrator holds the lock', holder: r.holder };
    },

    async heartbeat() {
      heartbeat(lockFile);
      return { ok: true };
    },

    async unlock() {
      releaseLock(lockFile);
      return { ok: true };
    },
  };
}

// ---- real-world wiring ----

const sh = (cmd, args, cwd) => {
  try {
    return { ok: true, stdout: execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) {
    return { ok: false, stdout: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
};

// Main worktree root, so paths are the same when run from inside .worktrees/task-<n>.
function repoRoot() {
  const r = sh('git', ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  return r.ok ? dirname(r.stdout.trim()) : process.cwd();
}

const root = repoRoot();
const planDir = join(root, 'docs/superpowers/plans');

export const commands = makeCommands({
  gh: { ...github, loadProject: () => github.loadProject(root) },
  sh,
  root,
  loadTasks: () => readdirSync(planDir).filter((f) => f.endsWith('.md')).flatMap((f) => parsePlan(readFileSync(join(planDir, f), 'utf8'))),
  exists: existsSync,
  now: () => new Date().toISOString(),
});
