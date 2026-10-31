import { describe, it, expect } from 'vitest';
import { readyTasks, blockedTasks } from '../../scripts/agent/lib/graph.mjs';

const t = (id, o = {}) => ({
  id, title: id, wave: 1, agent: 'frontend-dev', model: 'sonnet', area: 'ui',
  depends: [], heavy: false, files: [`src/${id}.ts`], body: '', status: 'Todo', labels: [], ...o,
});

describe('readyTasks', () => {
  it('returns Todo tasks whose dependencies are Done(completed), ordered by wave then id', () => {
    const tasks = [
      t('B', { wave: 2 }), t('A', { depends: ['D'] }), t('C'),
      t('D', { status: 'Done', closedAs: 'completed' }),
    ];
    expect(readyTasks(tasks)).toEqual(['A', 'C', 'B']);
  });

  it('excludes tasks whose dependency was closed not_planned', () => {
    const tasks = [t('A', { depends: ['D'] }), t('D', { status: 'Done', closedAs: 'not_planned' })];
    expect(readyTasks(tasks)).toEqual([]);
  });

  it('excludes tasks whose dependency is not Done', () => {
    expect(readyTasks([t('A', { depends: ['D'] }), t('D', { status: 'Review' })])).toEqual([]);
  });

  it('never returns two heavy tasks', () => {
    expect(readyTasks([t('A', { heavy: true }), t('B', { heavy: true })])).toEqual(['A']);
  });

  it('returns no heavy task while a heavy task is running', () => {
    expect(readyTasks([t('R', { heavy: true, status: 'In Progress' }), t('A', { heavy: true })])).toEqual([]);
  });

  it('excludes tasks whose files overlap a running task', () => {
    const tasks = [t('R', { status: 'In Progress', files: ['assets/src/rex/**'] }), t('A', { files: ['assets/src/rex/a.glb'] })];
    expect(readyTasks(tasks)).toEqual([]);
  });

  it('never returns two tasks that share a file', () => {
    expect(readyTasks([t('A', { files: ['x.json'] }), t('B', { files: ['x.json'] })])).toEqual(['A']);
  });

  it('respects maxConcurrent counting running tasks', () => {
    const tasks = [t('R', { status: 'In Progress' }), t('A'), t('B'), t('C')];
    expect(readyTasks(tasks, 3)).toEqual(['A', 'B']);
  });

  it('skips tasks labelled needs-human', () => {
    expect(readyTasks([t('A', { labels: ['needs-human'] })])).toEqual([]);
  });
});

describe('blockedTasks', () => {
  it('lists Todo tasks blocked by not_planned or needs-human dependencies', () => {
    const tasks = [
      t('A', { depends: ['D', 'E'] }),
      t('D', { status: 'Done', closedAs: 'not_planned' }),
      t('E', { status: 'In Progress', labels: ['needs-human'] }),
      t('F', { depends: ['E'], status: 'Done', closedAs: 'completed' }),
    ];
    expect(blockedTasks(tasks)).toEqual([{ id: 'A', by: ['D', 'E'] }]);
  });
});

describe('needs-human tasks do not hold slots', () => {
  it('three needs-human tasks In Progress leave all slots free', () => {
    const stuck = ['X', 'Y', 'Z'].map((id) => t(id, { status: 'In Progress', labels: ['needs-human'], heavy: true }));
    expect(readyTasks([...stuck, t('A', { heavy: true }), t('B')])).toEqual(['A', 'B']);
  });
});
