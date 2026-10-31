// GitHub side of the board: repo, Project v2, fields, labels, issues, items.
// All functions are idempotent.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { ghGraphql, ghJson, ghText } from './gh.mjs';

export const PROJECT_FILE = '.agent/project.json';
export const PROJECT_TITLE = 'T-rex — Dinosaur Explorer';
export const STATUSES = ['Todo', 'In Progress', 'Review', 'Done'];
const STATUS_COLORS = { Todo: 'GRAY', 'In Progress': 'YELLOW', Review: 'PURPLE', Done: 'GREEN' };
const MODELS = ['haiku', 'sonnet', 'opus'];
const AREAS = ['scene', 'dino', 'ui', 'i18n', 'audio', 'assets', 'perf', 'content', 'build', 'agent', 'docs'];

export const LABELS = [
  ...[0, 1, 2, 3, 4, 5].map((p) => ({ name: `phase:${p}`, color: '0e8a16', description: `Plan phase/wave ${p}` })),
  ...AREAS.map((a) => ({ name: `area:${a}`, color: '1d76db', description: `Area: ${a}` })),
  { name: 'needs-human', color: 'd93f0b', description: 'Failed 3 attempts; a person should look' },
  { name: 'known-issue', color: 'fbca04', description: 'Recorded in docs/known-issues.md' },
  { name: 'blocked', color: 'b60205', description: 'A dependency was dropped or needs a human' },
  { name: 'heavy', color: '5319e7', description: 'Blender/Playwright perf: never runs alongside another heavy task' },
  { name: 'run-status', color: 'c5def5', description: 'Run status log' },
];

export function loadProject(root = '.') {
  const file = join(root, PROJECT_FILE);
  if (!existsSync(file)) throw new Error(`${PROJECT_FILE} missing — run: node scripts/agent/board.mjs setup`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

function saveProject(p) {
  mkdirSync('.agent', { recursive: true });
  writeFileSync(PROJECT_FILE, `${JSON.stringify(p, null, 2)}\n`);
}

const git = (...args) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
};

async function ensureRepo(repoName) {
  const login = await ghText(['api', 'user', '--jq', '.login']);
  const origin = git('remote', 'get-url', 'origin');
  if (!origin) {
    await ghText(['repo', 'create', repoName, '--public', '--source', '.', '--push',
      '--description', 'Interactive 3D late-Cretaceous dinosaur explorer (three.js WebGPU) built by Claude Code agents']);
    return { owner: login, repo: repoName };
  }
  const m = /github\.com[/:]([^/]+)\/(.+?)(?:\.git)?$/.exec(origin);
  if (!m) throw new Error(`origin is not a GitHub repo: ${origin}`);
  // First publish only: once main is protected, all changes arrive through PRs.
  if (!git('ls-remote', '--heads', 'origin', 'main') && git('push', '-u', 'origin', 'main') === null) {
    throw new Error('git push -u origin main failed');
  }
  return { owner: m[1], repo: m[2] };
}

async function ensureProject(owner) {
  const list = await ghJson(['project', 'list', '--owner', owner, '--format', 'json', '--limit', '100']);
  const found = list.projects.find((p) => p.title === PROJECT_TITLE);
  if (found) return { number: found.number, id: found.id };
  const created = await ghJson(['project', 'create', '--owner', owner, '--title', PROJECT_TITLE, '--format', 'json']);
  return { number: created.number, id: created.id };
}

async function ensureFields(owner, number) {
  const list = async () => (await ghJson(['project', 'field-list', String(number), '--owner', owner, '--format', 'json', '--limit', '50'])).fields;
  let fields = await list();
  const want = [
    { name: 'Agent', type: 'TEXT' },
    { name: 'Model', type: 'SINGLE_SELECT', options: MODELS },
    { name: 'Wave', type: 'NUMBER' },
    { name: 'Attempt', type: 'NUMBER' },
    { name: 'Heartbeat', type: 'TEXT' },
  ];
  for (const f of want) {
    if (fields.some((x) => x.name === f.name)) continue;
    const args = ['project', 'field-create', String(number), '--owner', owner, '--name', f.name, '--data-type', f.type];
    if (f.options) args.push('--single-select-options', f.options.join(','));
    await ghText(args);
  }
  fields = await list();

  const status = fields.find((x) => x.name === 'Status');
  const names = (status.options ?? []).map((o) => o.name);
  if (STATUSES.some((s) => !names.includes(s)) || names.length !== STATUSES.length) {
    await ghGraphql(
      `mutation($id: ID!, $opts: [ProjectV2SingleSelectFieldOptionInput!]) {
        updateProjectV2Field(input: { fieldId: $id, singleSelectOptions: $opts }) { clientMutationId }
      }`,
      { id: status.id, opts: STATUSES.map((s) => ({ name: s, color: STATUS_COLORS[s], description: '' })) },
    );
    fields = await list();
  }
  const byName = Object.fromEntries(fields.map((f) => [f.name, f]));
  const optionIds = (f) => Object.fromEntries((byName[f].options ?? []).map((o) => [o.name, o.id]));
  return {
    fieldIds: {
      status: byName.Status.id, agent: byName.Agent.id, model: byName.Model.id,
      wave: byName.Wave.id, attempt: byName.Attempt.id, heartbeat: byName.Heartbeat.id,
    },
    statusOptionIds: optionIds('Status'),
    modelOptionIds: optionIds('Model'),
  };
}

async function ensureLabels(fullRepo) {
  for (const l of LABELS) {
    await ghText(['label', 'create', l.name, '--repo', fullRepo, '--color', l.color, '--description', l.description, '--force']);
  }
}

// Every change reaches main through a PR. No approvals required: all agents
// share the owner's account and GitHub forbids approving your own PR.
async function ensureBranchProtection(fullRepo) {
  const body = JSON.stringify({
    required_status_checks: null,
    enforce_admins: true,
    required_pull_request_reviews: { required_approving_review_count: 0 },
    restrictions: null,
    allow_force_pushes: false,
    allow_deletions: false,
  });
  await ghText(['api', '-X', 'PUT', `repos/${fullRepo}/branches/main/protection`, '--input', '-'], body);
}

async function ensureRunStatusIssue(fullRepo) {
  const found = await ghJson(['issue', 'list', '--repo', fullRepo, '--state', 'all', '--label', 'run-status', '--json', 'number']);
  if (found.length) return found[0].number;
  const url = await ghText(['issue', 'create', '--repo', fullRepo, '--title', 'Run status', '--label', 'run-status',
    '--body', 'Orchestrator run log: starts, pauses (usage limit), resumes and final summaries are posted here as comments.']);
  const number = Number(url.split('/').pop());
  await ghText(['issue', 'pin', String(number), '--repo', fullRepo]).catch(() => {});
  return number;
}

export async function setup(repoName = 't-rex') {
  const { owner, repo } = await ensureRepo(repoName);
  const fullRepo = `${owner}/${repo}`;
  const project = await ensureProject(owner);
  await ghText(['project', 'link', String(project.number), '--owner', owner, '--repo', fullRepo]).catch(() => {});
  const fields = await ensureFields(owner, project.number);
  await ensureLabels(fullRepo);
  await ensureBranchProtection(fullRepo);
  const runStatusIssue = await ensureRunStatusIssue(fullRepo);
  const p = { owner, repo, fullRepo, projectNumber: project.number, projectId: project.id, runStatusIssue, ...fields };
  saveProject(p);
  return p;
}

// ---- issues and project items ----

export async function listIssues(p) {
  return ghJson(['issue', 'list', '--repo', p.fullRepo, '--state', 'all', '--limit', '500',
    '--json', 'number,title,body,state,stateReason,labels,url']);
}

export async function listItems(p) {
  const res = await ghJson(['project', 'item-list', String(p.projectNumber), '--owner', p.owner, '--format', 'json', '--limit', '500']);
  return res.items.filter((i) => i.content?.type === 'Issue');
}

export async function createIssue(p, { title, body, labels }) {
  const url = await ghText(['issue', 'create', '--repo', p.fullRepo, '--title', title, '--body-file', '-',
    ...labels.flatMap((l) => ['--label', l])], body);
  return { number: Number(url.split('/').pop()), url };
}

export async function editIssue(p, number, { title, body }) {
  await ghText(['issue', 'edit', String(number), '--repo', p.fullRepo, '--title', title, '--body-file', '-'], body);
}

export async function addItem(p, url) {
  const res = await ghJson(['project', 'item-add', String(p.projectNumber), '--owner', p.owner, '--url', url, '--format', 'json']);
  return res.id;
}

export async function setField(p, itemId, field, value) {
  const args = ['project', 'item-edit', '--id', itemId, '--project-id', p.projectId, '--field-id', p.fieldIds[field]];
  if (field === 'status') args.push('--single-select-option-id', p.statusOptionIds[value]);
  else if (field === 'model') args.push('--single-select-option-id', p.modelOptionIds[value]);
  else if (field === 'wave' || field === 'attempt') args.push('--number', String(value));
  else args.push('--text', String(value));
  await ghText(args);
}

export async function comment(p, number, body) {
  await ghText(['issue', 'comment', String(number), '--repo', p.fullRepo, '--body-file', '-'], body);
}

export async function issueComments(p, number) {
  const res = await ghJson(['issue', 'view', String(number), '--repo', p.fullRepo, '--json', 'comments']);
  return res.comments.map((c) => ({ author: c.author?.login ?? null, body: c.body }));
}

export async function closeIssue(p, number, reason = 'completed') {
  await ghText(['issue', 'close', String(number), '--repo', p.fullRepo, '--reason', reason === 'not_planned' ? 'not planned' : 'completed']);
}

export async function reopenIssue(p, number) {
  await ghText(['issue', 'reopen', String(number), '--repo', p.fullRepo]);
}

export async function addLabel(p, number, label) {
  await ghText(['issue', 'edit', String(number), '--repo', p.fullRepo, '--add-label', label]);
}

export async function prForBranch(p, branch) {
  const prs = await ghJson(['pr', 'list', '--repo', p.fullRepo, '--head', branch, '--state', 'all', '--json', 'number,state,url']);
  return prs[0] ?? null;
}
