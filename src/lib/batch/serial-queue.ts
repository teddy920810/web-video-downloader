export type QueueItem<Input, Output> = {
  id: number;
  input: Input;
  status: 'queued' | 'processing' | 'ready' | 'failed';
  result?: Output;
  error?: string;
};

/** In-tab queue. Stop finishes the active task; cloud work is never silently resubmitted. */
export class SerialQueue<Input, Output> {
  items: QueueItem<Input, Output>[] = [];
  running = false;
  private nextId = 1;
  private stopped = false;
  constructor(private capacity = 20, private changed: () => void = () => {}) {}

  add(inputs: Input[]) {
    if (this.items.length + inputs.length > this.capacity) throw new Error(`Queue capacity is ${this.capacity} tasks. Remove completed tasks before adding more.`);
    this.items = [...this.items, ...inputs.map(input => ({ id: this.nextId++, input, status: 'queued' as const }))];
    this.changed();
  }

  remove(id: number) {
    this.items = this.items.filter(item => item.id !== id || item.status === 'processing');
    this.changed();
  }

  stop() { this.stopped = true; }

  async start(process: (input: Input, id: number) => Promise<Output>) {
    if (this.running) return;
    this.running = true;
    this.stopped = false;
    const approved = new Set(this.items.filter(item => item.status === 'queued').map(item => item.id));
    this.changed();
    try {
      while (!this.stopped) {
        const item = this.items.find(entry => entry.status === 'queued' && approved.has(entry.id));
        if (!item) break;
        item.status = 'processing';
        this.changed();
        try {
          item.result = await process(item.input, item.id);
          item.status = 'ready';
        } catch (cause) {
          item.error = cause instanceof Error ? cause.message : 'Processing failed.';
          item.status = 'failed';
        }
        this.changed();
      }
    } finally {
      this.running = false;
      this.changed();
    }
  }
}
