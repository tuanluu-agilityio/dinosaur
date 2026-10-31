import { describe, it, expect } from 'vitest';
import { planToIssues, issueBody, issueTitle, taskIdOf } from '../../scripts/agent/lib/issues.mjs';

const task = (id, o = {}) => ({
  id, title: `Title ${id}`, wave: 1, agent: 'frontend-dev', model: 'sonnet', area: 'ui',
  depends: [], heavy: false, files: ['src/a.ts'], body: `Body ${id}`, ...o,
});

describe('issue mapping', () => {
  it('body carries the hidden task-id marker and metadata', () => {
    const b = issueBody(task('P1-T01', { depends: ['P0-T06'] }), new Map([['P0-T06', 7]]));
    expect(taskIdOf(b)).toBe('P1-T01');
    expect(b).toContain('Blocked by #7');
    expect(b).toContain('frontend-dev');
    expect(b).toContain('Body P1-T01');
  });

  it('unresolved dependency is written by task id', () => {
    expect(issueBody(task('P1-T01', { depends: ['P0-T06'] }), new Map())).toContain('Blocked by P0-T06');
  });

  it('title is prefixed with the task id', () => {
    expect(issueTitle(task('P1-T01'))).toBe('[P1-T01] Title P1-T01');
  });
});

describe('planToIssues', () => {
  it('creates issues for tasks without a marker match', () => {
    const r = planToIssues([task('A-T1'), task('A-T2')], [], new Map());
    expect(r.create.map((t) => t.id)).toEqual(['A-T1', 'A-T2']);
    expect(r.update).toEqual([]);
  });

  it('existing marker goes to update only when body or title changed', () => {
    const t1 = task('A-T1');
    const existing = [
      { number: 1, title: issueTitle(t1), body: issueBody(t1, new Map()) },
      { number: 2, title: '[A-T2] Old', body: issueBody(task('A-T2'), new Map()) },
    ];
    const r = planToIssues([t1, task('A-T2')], existing, new Map());
    expect(r.create).toEqual([]);
    expect(r.update.map((u) => u.number)).toEqual([2]);
    expect(r.unchanged).toBe(1);
  });

  it('a second run over its own output creates nothing', () => {
    const tasks = [task('A-T1'), task('A-T2', { depends: ['A-T1'] })];
    const numbers = new Map([['A-T1', 1], ['A-T2', 2]]);
    const existing = tasks.map((t) => ({ number: numbers.get(t.id), title: issueTitle(t), body: issueBody(t, numbers) }));
    const r = planToIssues(tasks, existing, numbers);
    expect(r.create).toEqual([]);
    expect(r.update).toEqual([]);
  });

  it('normalizes CRLF bodies returned by GitHub', () => {
    const t1 = task('A-T1');
    const existing = [{ number: 1, title: issueTitle(t1), body: issueBody(t1, new Map()).replace(/\n/g, '\r\n') }];
    expect(planToIssues([t1], existing, new Map()).update).toEqual([]);
  });
});
