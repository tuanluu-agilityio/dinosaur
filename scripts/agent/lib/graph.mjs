// Scheduling over task states: which Todo tasks may start now, which are blocked.

const RUNNING = new Set(['In Progress', 'Review']);

// Static part of a path pattern, before any glob character.
const staticPrefix = (p) => p.split(/[*?[]/)[0];

// Conservative: two patterns overlap if one's static prefix contains the other's
// (globs) or they are the same literal path.
export function filesOverlap(a, b) {
  const ga = /[*?[]/.test(a);
  const gb = /[*?[]/.test(b);
  if (!ga && !gb) return a === b;
  const pa = staticPrefix(a);
  const pb = staticPrefix(b);
  return pa.startsWith(pb) || pb.startsWith(pa);
}

const anyOverlap = (filesA, filesB) => filesA.some((a) => filesB.some((b) => filesOverlap(a, b)));

const isCompleted = (t) => t?.status === 'Done' && t.closedAs === 'completed';

export function readyTasks(tasks, maxConcurrent = 3) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const running = tasks.filter((t) => RUNNING.has(t.status));
  const picked = [];
  let slots = maxConcurrent - running.length;
  let heavyBusy = running.some((t) => t.heavy);

  const candidates = tasks
    .filter((t) => t.status === 'Todo' && !(t.labels ?? []).includes('needs-human'))
    .filter((t) => t.depends.every((d) => isCompleted(byId.get(d))))
    .sort((a, b) => a.wave - b.wave || a.id.localeCompare(b.id));

  for (const t of candidates) {
    if (slots <= 0) break;
    if (t.heavy && heavyBusy) continue;
    if ([...running, ...picked].some((o) => anyOverlap(t.files, o.files))) continue;
    picked.push(t);
    slots -= 1;
    if (t.heavy) heavyBusy = true;
  }
  return picked.map((t) => t.id);
}

export function blockedTasks(tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const isBlocker = (d) => {
    const dep = byId.get(d);
    return !!dep && ((dep.status === 'Done' && dep.closedAs === 'not_planned') || (dep.labels ?? []).includes('needs-human'));
  };
  return tasks
    .filter((t) => t.status === 'Todo')
    .map((t) => ({ id: t.id, by: t.depends.filter(isBlocker) }))
    .filter((b) => b.by.length > 0);
}
