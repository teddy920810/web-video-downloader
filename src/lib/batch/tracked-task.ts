import { trackToolEvent } from '../analytics/tool-events';

export async function runTrackedTask<T>(toolId: string, cloud: boolean, run: () => Promise<T>): Promise<T> {
  const processing = cloud ? 'cloud' : 'local';
  trackToolEvent(toolId, 'started', processing);
  try {
    const result = await run();
    trackToolEvent(toolId, 'succeeded', processing);
    return result;
  } catch (error) {
    trackToolEvent(toolId, 'failed', processing);
    throw error;
  }
}
