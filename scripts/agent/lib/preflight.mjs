// Machine/GitHub readiness checks. `exec` is injected so tests need no real tools.

const versionAtLeast = (v, min) => {
  const a = v.split('.').map(Number);
  const b = min.split('.').map(Number);
  for (let i = 0; i < b.length; i += 1) {
    if ((a[i] ?? 0) !== b[i]) return (a[i] ?? 0) > b[i];
  }
  return true;
};

const tokenFrom = (envVars, dotenv) =>
  envVars.SKETCHFAB_API_TOKEN || /^SKETCHFAB_API_TOKEN=(.*)$/m.exec(dotenv ?? '')?.[1]?.trim() || '';

export async function runPreflight({ exec, nodeVersion, envVars, dotenv }) {
  const checks = [];
  const add = (name, ok, fix) => checks.push({ name, ok, ...(ok ? {} : { fix }) });

  const auth = await exec('gh', ['auth', 'status']);
  const scopes = auth.stdout;
  add('gh-auth', auth.ok, 'gh auth login');
  add('gh-scopes', ['repo', 'project', 'workflow'].every((s) => scopes.includes(`'${s}'`)), 'gh auth refresh -s project');

  const remote = await exec('git', ['remote', 'get-url', 'origin']);
  add('git-remote', remote.ok, 'node scripts/agent/board.mjs setup');

  const branch = await exec('git', ['branch', '--show-current']);
  add('git-branch-main', branch.ok && branch.stdout.trim() === 'main', 'git branch -m master main');

  const hooks = await exec('git', ['config', 'core.hooksPath']);
  add('git-hooks', hooks.ok && hooks.stdout.trim() === '.githooks', 'npm run prepare');

  add('node', versionAtLeast(nodeVersion, '20.0.0'), 'Install Node.js LTS (>= 20)');

  const tts = await exec('python', ['-c', 'import edge_tts']);
  add('python-edge-tts', tts.ok, 'python -m pip install edge-tts');

  const blender = await exec('blender', ['--version']);
  const bv = /Blender (\d+\.\d+(?:\.\d+)?)/.exec(blender.stdout)?.[1];
  add('blender', blender.ok && !!bv && versionAtLeast(bv, '4.2'), 'Install Blender 4.2+ LTS and add it to PATH (winget install BlenderFoundation.Blender)');

  const toktx = await exec('toktx', ['--version']);
  add('toktx', toktx.ok, 'Install KTX-Software (winget install KhronosGroup.KTX-Software) and add it to PATH');

  add('sketchfab-token', tokenFrom(envVars, dotenv).length >= 20, 'Put SKETCHFAB_API_TOKEN=<token> in .env (https://sketchfab.com/settings/password)');

  return { ok: checks.every((c) => c.ok), checks };
}
