export function validateBatchRange(start: number, end: number, duration: number): void {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Cannot read this video duration. Try converting it to MP4 before trimming or creating a GIF.');
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) throw new Error('Choose an end time later than the start time.');
  if (start >= duration || end > duration + 0.05) throw new Error(`The selected range exceeds this file (${duration.toFixed(1)} seconds). Adjust the range before trying it again.`);
}
