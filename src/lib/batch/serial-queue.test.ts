import { describe, expect, it } from 'vitest';
import { SerialQueue } from './serial-queue';

describe('serial tool queue', () => {
  it('runs only one job, continues after failure and retains each result', async () => {
    const queue = new SerialQueue<number, number>();
    queue.add([1, 2, 3]);
    let active = 0;
    let peak = 0;
    await queue.start(async value => {
      peak = Math.max(peak, ++active);
      await Promise.resolve();
      active--;
      if (value === 2) throw new Error('Invalid file');
      return value * 2;
    });
    expect(peak).toBe(1);
    expect(queue.items.map(item => item.status)).toEqual(['ready', 'failed', 'ready']);
    expect(queue.items.map(item => item.result)).toEqual([2, undefined, 6]);
  });

  it('stops after current job, prevents duplicate starts, and resumes without rerunning successes', async () => {
    const queue = new SerialQueue<number, number>();
    queue.add([1, 2]);
    let release!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; });
    const running = queue.start(async n => { await wait; return n; });
    await queue.start(async () => { throw new Error('duplicate'); });
    queue.stop();
    release();
    await running;
    expect(queue.items.map(item => item.status)).toEqual(['ready', 'queued']);
    await queue.start(async n => n * 10);
    expect(queue.items.map(item => item.result)).toEqual([1, 20]);
  });

  it('preserves duplicate filenames, supports safe removal, and enforces queue capacity', async () => {
    const queue = new SerialQueue<string, string>(2);
    queue.add(['same.png', 'same.png']);
    expect(queue.items[0].id).not.toBe(queue.items[1].id);
    expect(() => queue.add(['extra'])).toThrow(/20|limit|capacity/i);
    queue.remove(queue.items[0].id);
    queue.add(['next']);
    await queue.start(async value => { queue.remove(queue.items.find(i => i.status === 'processing')!.id); return value; });
    expect(queue.items).toHaveLength(2);
  });
});
