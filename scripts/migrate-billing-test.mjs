import { readFile, readdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { URL } from 'node:url';
import process from 'node:process';
import { neon } from '@neondatabase/serverless';
import { splitSqlStatements } from './sql-statements.mjs';

async function main() {
  // Never mutate the default DATABASE_URL. This command is dedicated to an empty sandbox.
  const env = { ...process.env };
  for (const file of ['.env.local', '.env']) {
    try {
      for (const [key, value] of Object.entries(
        parseEnv(await readFile(file, 'utf8')),
      ))
        env[key] ??= value;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  function identity(value) {
    const url = new URL(value);
    return `${url.hostname.replace(/-pooler(?=\.)/, '')}${url.pathname}`;
  }
  if (!env.BILLING_TEST_DATABASE_URL || env.VERCEL_ENV === 'production')
    throw new Error('An isolated test database is required.');
  if (
    env.DATABASE_URL &&
    identity(env.BILLING_TEST_DATABASE_URL) === identity(env.DATABASE_URL)
  )
    throw new Error('Refusing to migrate the default account database.');
  const names = (await readdir('db/migrations'))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();
  if (!process.argv.includes('--apply')) {
    process.stdout.write(
      `Ready to apply ${names.length} migrations transactionally to the configured test database. Add --apply to execute.\n`,
    );
  } else {
    const sql = neon(env.BILLING_TEST_DATABASE_URL);
    const statements = [];
    for (const name of names)
      statements.push(
        ...splitSqlStatements(await readFile(`db/migrations/${name}`, 'utf8')),
      );
    await sql.transaction([
      sql`SELECT pg_advisory_xact_lock(81412341)`,
      ...statements.map((statement) => sql.query(statement)),
    ]);
    process.stdout.write(
      `${names.length} migrations applied to the isolated test database.\n`,
    );
  }
}

main().catch(() => {
  process.stderr.write(
    'Billing test migration failed. Check the isolated database configuration and access; no credentials are included here.\n',
  );
  process.exitCode = 1;
});
