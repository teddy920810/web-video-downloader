import { afterEach, expect, it, vi } from 'vitest';
import { runTrackedTask } from './tracked-task';
afterEach(() => vi.unstubAllGlobals());
it('preserves tool events in the shared workspace without sending filenames or media', async () => {
  const dataLayer: unknown[] = [];
  vi.stubGlobal('window', { dataLayer });
  await expect(runTrackedTask('image-converter', false, async () => 'private result')).resolves.toBe('private result');
  await expect(runTrackedTask('background-remover', true, async () => { throw new Error('private error'); })).rejects.toThrow('private error');
  expect(dataLayer).toEqual([
    { event: 'tool_job', tool_id: 'image-converter', status: 'started', processing: 'local' },
    { event: 'tool_job', tool_id: 'image-converter', status: 'succeeded', processing: 'local' },
    { event: 'tool_job', tool_id: 'background-remover', status: 'started', processing: 'cloud' },
    { event: 'tool_job', tool_id: 'background-remover', status: 'failed', processing: 'cloud' },
  ]);
});
