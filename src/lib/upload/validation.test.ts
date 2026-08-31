import { describe, expect, it } from 'vitest';
import {
  MAX_UPLOAD_BYTES,
  createToolInputKey,
  createUploadKey,
  isBackgroundRemovalInput,
  validateUploadMetadata,
} from './validation';

describe('upload validation', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts %s', (contentType) => {
    expect(validateUploadMetadata({ contentType, size: 1024 })).toEqual({ ok: true });
  });

  it('rejects unsupported file types', () => {
    expect(validateUploadMetadata({ contentType: 'image/svg+xml', size: 1024 })).toMatchObject({ ok: false });
  });

  it('rejects files larger than 10 MB', () => {
    expect(validateUploadMetadata({ contentType: 'image/png', size: MAX_UPLOAD_BYTES + 1 })).toMatchObject({ ok: false });
  });

  it('creates opaque upload keys with the expected extension', () => {
    expect(createUploadKey('image/webp', 'fixed-id')).toBe('uploads/fixed-id.webp');
  });

  it('binds background remover uploads to one opaque job ID', () => {
    const key = createToolInputKey('background-remover', 'image/png', 'eb8fa168-c11c-4e54-8c63-137d649ed1db');
    expect(key).toBe('tool-inputs/background-remover/eb8fa168-c11c-4e54-8c63-137d649ed1db.png');
    expect(isBackgroundRemovalInput(key, 'eb8fa168-c11c-4e54-8c63-137d649ed1db')).toBe(true);
    expect(isBackgroundRemovalInput(key, 'different-job')).toBe(false);
  });
});
