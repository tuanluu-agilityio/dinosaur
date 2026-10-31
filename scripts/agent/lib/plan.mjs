// Parses plan markdown into tasks. A task is a `### <ID> — <title>` heading
// followed by a ```task metadata block; its body runs to the next heading.

export class PlanError extends Error {}

const REQUIRED = ['id', 'wave', 'agent', 'model', 'area', 'depends', 'heavy', 'files'];
const HEADING = /^### ([A-Z0-9]+-T\d+) — (.+)$/;

function parseValue(raw) {
  const v = raw.trim();
  if (v.startsWith('[') && v.endsWith(']')) {
    return v.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (v === 'true' || v === 'false') return v === 'true';
  if (/^\d+$/.test(v)) return Number(v);
  return v;
}

function parseMeta(lines, headingId) {
  const meta = {};
  for (const line of lines) {
    const m = /^([a-z]+):\s*(.*)$/.exec(line);
    if (m) meta[m[1]] = parseValue(m[2]);
  }
  for (const field of REQUIRED) {
    if (meta[field] === undefined || meta[field] === '') {
      throw new PlanError(`Task ${headingId}: missing field "${field}"`);
    }
  }
  if (meta.id !== headingId) {
    throw new PlanError(`Task ${headingId}: heading id differs from block id "${meta.id}"`);
  }
  if (typeof meta.wave !== 'number') throw new PlanError(`Task ${headingId}: field "wave" must be a number`);
  if (typeof meta.heavy !== 'boolean') throw new PlanError(`Task ${headingId}: field "heavy" must be true|false`);
  if (!Array.isArray(meta.depends)) throw new PlanError(`Task ${headingId}: field "depends" must be a list`);
  if (!Array.isArray(meta.files)) throw new PlanError(`Task ${headingId}: field "files" must be a list`);
  return meta;
}

function finishBody(lines) {
  const body = lines.join('\n').trim();
  return body.replace(/(\n+---\s*)+$/, '').trim();
}

export function parsePlan(markdown) {
  const tasks = [];
  const seen = new Set();
  let fence = null; // backtick run that opened the current fence
  let current = null;

  const close = () => {
    if (!current) return;
    if (!current.meta) throw new PlanError(`Task ${current.id}: missing \`\`\`task block`);
    tasks.push({ ...current.meta, title: current.title, body: finishBody(current.body) });
    current = null;
  };

  for (const line of markdown.split(/\r?\n/)) {
    const fenceMatch = /^(`{3,})(.*)$/.exec(line);
    if (fenceMatch) {
      if (fence === null) {
        fence = fenceMatch[1];
        if (current && !current.meta && fenceMatch[2].trim() === 'task' && current.body.every((l) => !l.trim())) {
          current.metaLines = [];
          continue;
        }
      } else if (fenceMatch[1].length >= fence.length && !fenceMatch[2].trim()) {
        fence = null;
        if (current?.metaLines) {
          current.meta = parseMeta(current.metaLines, current.id);
          current.metaLines = null;
          current.body = [];
          continue;
        }
      }
    }

    if (current?.metaLines) {
      current.metaLines.push(line);
      continue;
    }

    if (fence === null && /^#{1,3} /.test(line)) {
      close();
      const h = HEADING.exec(line);
      if (h) {
        if (seen.has(h[1])) throw new PlanError(`Duplicate task id ${h[1]}`);
        seen.add(h[1]);
        current = { id: h[1], title: h[2].trim(), body: [], meta: null, metaLines: null };
      }
      continue;
    }

    if (current) current.body.push(line);
  }
  close();
  return tasks;
}
