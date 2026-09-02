type ToolEventStatus = 'started' | 'retried' | 'succeeded' | 'failed' | 'cancelled';

export function trackToolEvent(toolId: string, status: ToolEventStatus, processing: 'local' | 'cloud') {
  if (typeof window === 'undefined') return;
  const layer = (window as typeof window & { dataLayer?: unknown[] }).dataLayer;
  if (!Array.isArray(layer)) return;
  layer.push({ event: 'tool_job', tool_id: toolId, status, processing });
}
