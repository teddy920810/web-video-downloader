import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function releasePlan(env) {
  if (env.VERCEL_ENV === 'production' && env.BILLING_MODE === 'live')
    throw new Error('Local release verification refuses live production migration environment.');
  return [['audit', '--audit-level=high'], ['run', 'site:validate'], ['run', 'verify']];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const plan = releasePlan(process.env);
    const npmCli = process.env.npm_execpath;
    if (!npmCli || !existsSync(npmCli)) throw new Error('Run through npm run release:verify.');
    for (const args of plan) {
      const result = spawnSync(process.execPath, [npmCli, ...args], { stdio: 'inherit', env: process.env });
      if (result.error || result.status !== 0) {
        process.stderr.write('Release verification stopped at a failed gate.\n');
        process.exitCode = result.status || 1;
        break;
      }
    }
  } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}
