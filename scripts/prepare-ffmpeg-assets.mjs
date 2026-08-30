import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = resolve(projectRoot, 'node_modules', '@ffmpeg', 'core', 'dist', 'esm');
const outputRoot = resolve(projectRoot, 'public', 'vendor', 'ffmpeg');

await mkdir(outputRoot, { recursive: true });
await Promise.all([
  ['ffmpeg-core.js', 'ffmpeg-core.js'],
  ['ffmpeg-core.wasm', 'ffmpeg-core.wasm'],
].map(([source, destination]) => copyFile(resolve(sourceRoot, source), resolve(outputRoot, destination))));

process.stdout.write('Prepared same-origin FFmpeg browser assets.\n');
