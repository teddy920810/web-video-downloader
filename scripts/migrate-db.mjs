import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { neon } from '@neondatabase/serverless';
import { splitSqlStatements } from './sql-statements.mjs';

async function loadLocalEnvironment() {
  for (const name of ['.env.local', '.env']) {
    try {
      const content = await readFile(resolve(name), 'utf8');
      for (const line of content.split(/\r?\n/)) {
        const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
        if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}

await loadLocalEnvironment();
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const sql = neon(process.env.DATABASE_URL);
const migrationNames = (await readdir(resolve('db/migrations')))
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort();
for (const name of migrationNames) {
  const migration = await readFile(resolve('db/migrations', name), 'utf8');
  for (const statement of splitSqlStatements(migration)) await sql.query(statement);
}
process.stdout.write(`${migrationNames.length} product account migrations applied.\n`);
