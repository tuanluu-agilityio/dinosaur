// Mapping between plan tasks and GitHub issues. Pure functions.

const MARKER = (id) => `<!-- task-id: ${id} -->`;

export const taskIdOf = (body) => /<!-- task-id: ([A-Z0-9]+-T\d+) -->/.exec(body ?? '')?.[1] ?? null;

export const issueTitle = (task) => `[${task.id}] ${task.title}`;

export function issueBody(task, numbers) {
  const deps = task.depends.length
    ? task.depends.map((d) => `Blocked by ${numbers.has(d) ? `#${numbers.get(d)}` : d}`).join('\n')
    : 'No dependencies';
  return [
    MARKER(task.id),
    `**Agent:** \`${task.agent}\` · **Model:** \`${task.model}\` · **Wave:** ${task.wave} · **Area:** \`${task.area}\`${task.heavy ? ' · **Heavy**' : ''}`,
    '',
    deps,
    '',
    `**Files this task may change:** ${task.files.map((f) => `\`${f}\``).join(', ')}`,
    '',
    '---',
    '',
    task.body,
  ].join('\n');
}

const norm = (s) => (s ?? '').replace(/\r\n/g, '\n').trim();

export function planToIssues(tasks, existingIssues, numbers) {
  const byTaskId = new Map();
  for (const issue of existingIssues) {
    const id = taskIdOf(issue.body);
    if (id) byTaskId.set(id, issue);
  }
  const create = [];
  const update = [];
  let unchanged = 0;
  for (const task of tasks) {
    const issue = byTaskId.get(task.id);
    if (!issue) {
      create.push(task);
      continue;
    }
    const title = issueTitle(task);
    const body = issueBody(task, numbers);
    if (issue.title !== title || norm(issue.body) !== norm(body)) update.push({ number: issue.number, task, title, body });
    else unchanged += 1;
  }
  return { create, update, unchanged };
}
