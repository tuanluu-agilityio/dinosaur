import { describe, it, expect } from 'vitest';
import { parsePlan, PlanError } from '../../scripts/agent/lib/plan.mjs';

const FENCE = '```';

const task = (id) => `### ${id} — Title ${id}
${FENCE}task
id: ${id}
wave: 1
agent: frontend-dev
model: sonnet
area: ui
depends: [P0-T06]
heavy: false
files: [src/a.ts, src/b.ts]
${FENCE}

Body of ${id}.

- [ ] Step 1
`;

const plan = `# Plan

## Wave 1

${task('P1-T01')}
---

${task('P1-T02')}
## Wave 2
`;

describe('parsePlan', () => {
  it('parses tasks with metadata', () => {
    const tasks = parsePlan(plan);
    expect(tasks.map((t) => t.id)).toEqual(['P1-T01', 'P1-T02']);
    expect(tasks[0]).toMatchObject({
      title: 'Title P1-T01', wave: 1, agent: 'frontend-dev', model: 'sonnet', area: 'ui',
      depends: ['P0-T06'], heavy: false, files: ['src/a.ts', 'src/b.ts'],
    });
  });

  it('body excludes heading, task block and trailing separators', () => {
    const [t] = parsePlan(plan);
    expect(t.body).not.toContain('### P1-T01');
    expect(t.body).not.toContain(`${FENCE}task`);
    expect(t.body.startsWith('Body of P1-T01.')).toBe(true);
    expect(t.body.endsWith('- [ ] Step 1')).toBe(true);
  });

  it('ignores headings inside fenced examples', () => {
    const doc = `${FENCE}\`\n### P9-T99 — Example\n${FENCE}task\nid: P9-T99\n${FENCE}\n${FENCE}\`\n\n${task('P1-T01')}`;
    expect(parsePlan(doc).map((t) => t.id)).toEqual(['P1-T01']);
  });

  it('parses empty depends', () => {
    const doc = task('P0-T01').replace('[P0-T06]', '[]');
    expect(parsePlan(doc)[0].depends).toEqual([]);
  });

  it('throws PlanError naming the task and field when a field is missing', () => {
    const doc = task('P1-T03').replace('agent: frontend-dev\n', '');
    expect(() => parsePlan(doc)).toThrow(PlanError);
    expect(() => parsePlan(doc)).toThrow(/P1-T03.*agent/);
  });

  it('throws on duplicate ids', () => {
    expect(() => parsePlan(task('P1-T01') + task('P1-T01'))).toThrow(/duplicate.*P1-T01/i);
  });

  it('throws when heading id and block id differ', () => {
    const doc = task('P1-T01').replace('id: P1-T01', 'id: P1-T09');
    expect(() => parsePlan(doc)).toThrow(/P1-T01/);
  });
});
