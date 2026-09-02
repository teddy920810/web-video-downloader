import { afterEach, describe, expect, it, vi } from 'vitest';
import { trackToolEvent } from './tool-events';

describe('privacy-safe tool events', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('records only the tool, status, and processing boundary', () => {
    const dataLayer: unknown[] = [];
    vi.stubGlobal('window', { dataLayer });
    trackToolEvent('video-converter', 'succeeded', 'local');
    expect(dataLayer).toEqual([{ event: 'tool_job', tool_id: 'video-converter', status: 'succeeded', processing: 'local' }]);
  });

  it('records a privacy-safe retry marker so compatibility recovery can be measured', () => {
    const dataLayer: unknown[] = [];
    vi.stubGlobal('window', { dataLayer });
    trackToolEvent('video-compressor', 'retried', 'local');
    expect(dataLayer).toEqual([{ event: 'tool_job', tool_id: 'video-compressor', status: 'retried', processing: 'local' }]);
  });
});
