import { getSecret } from 'astro:env/server';
import { neon } from '@neondatabase/serverless';

export type TrialDownload = {
  id: string;
  userId: string;
  userEmail: string;
  sourceUrl: string;
  formatId: string;
  title: string;
  status: 'queued' | 'processing' | 'ready' | 'failed';
  objectKey: string | null;
  failureReason: string | null;
  createdAt: string;
};

type CreateTrialInput = Pick<TrialDownload, 'userId' | 'userEmail' | 'sourceUrl' | 'formatId' | 'title'>;

export class TrialAlreadyUsedError extends Error {}

function sql() {
  const databaseUrl = getSecret('DATABASE_URL');
  if (!databaseUrl) throw new Error('DATABASE_URL is not configured.');
  return neon(databaseUrl);
}

export async function createTrial(input: CreateTrialInput): Promise<TrialDownload> {
  const id = crypto.randomUUID();
  try {
    const rows = await sql()`
      INSERT INTO trial_downloads (id, user_id, user_email, source_url, format_id, title, status)
      VALUES (${id}, ${input.userId}, ${input.userEmail}, ${input.sourceUrl}, ${input.formatId}, ${input.title}, 'queued')
      ON CONFLICT (user_id) DO UPDATE
      SET
        id = EXCLUDED.id,
        user_email = EXCLUDED.user_email,
        source_url = EXCLUDED.source_url,
        format_id = EXCLUDED.format_id,
        title = EXCLUDED.title,
        status = 'queued',
        object_key = NULL,
        failure_reason = NULL,
        updated_at = NOW()
      WHERE trial_downloads.status = 'failed'
      RETURNING
        id,
        user_id AS "userId",
        user_email AS "userEmail",
        source_url AS "sourceUrl",
        format_id AS "formatId",
        title,
        status,
        object_key AS "objectKey",
        failure_reason AS "failureReason",
        created_at AS "createdAt";
    `;
    if (rows.length === 0) throw new TrialAlreadyUsedError();
    return rows[0] as TrialDownload;
  } catch (error) {
    if (isUniqueViolation(error)) throw new TrialAlreadyUsedError();
    throw error;
  }
}

export async function markTrialReady(id: string, objectKey: string): Promise<void> {
  await sql()`
    UPDATE trial_downloads
    SET status = 'ready', object_key = ${objectKey}, updated_at = NOW()
    WHERE id = ${id};
  `;
}

export async function markTrialProcessing(id: string): Promise<void> {
  await sql()`
    UPDATE trial_downloads
    SET status = 'processing', updated_at = NOW()
    WHERE id = ${id} AND status = 'queued';
  `;
}

export async function markTrialFailed(id: string, reason: string): Promise<void> {
  await sql()`
    UPDATE trial_downloads
    SET status = 'failed', failure_reason = ${reason}, updated_at = NOW()
    WHERE id = ${id};
  `;
}

export async function getTrialForUser(id: string, userId: string): Promise<TrialDownload | null> {
  const rows = await sql()`
    SELECT
      id,
      user_id AS "userId",
      user_email AS "userEmail",
      source_url AS "sourceUrl",
      format_id AS "formatId",
      title,
      status,
      object_key AS "objectKey",
      failure_reason AS "failureReason",
      created_at AS "createdAt"
    FROM trial_downloads
    WHERE id = ${id} AND user_id = ${userId}
    LIMIT 1;
  `;
  return (rows[0] as TrialDownload | undefined) ?? null;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === '23505';
}
