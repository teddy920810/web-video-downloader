export const MAX_SVG_SOURCE_BYTES = 2 * 1024 * 1024;
export const MAX_SVG_DIMENSION = 8192;
const MAX_SVG_PIXELS = 32_000_000;

export type SvgOutputFormat = 'png' | 'jpeg' | 'webp';

export type InspectedSvg = {
  source: string;
  width: number;
  height: number;
};

export function outputForSvgFormat(format: SvgOutputFormat) {
  if (format === 'jpeg') return { mimeType: 'image/jpeg' as const, extension: 'jpg' as const };
  if (format === 'webp') return { mimeType: 'image/webp' as const, extension: 'webp' as const };
  return { mimeType: 'image/png' as const, extension: 'png' as const };
}

function attributeValue(attributes: string, name: string) {
  const match = attributes.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match?.[2]?.trim();
}

function numericDimension(value: string | undefined) {
  if (!value) return undefined;
  const match = value.match(/^([0-9]+(?:\.[0-9]+)?)(?:px)?$/i);
  if (!match) return undefined;
  const dimension = Number(match[1]);
  return Number.isFinite(dimension) && dimension > 0 ? dimension : undefined;
}

function rejectUnsafeSvg(source: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('This SVG contains unsafe document declarations.');
  if (/<\s*(?:script|foreignObject|iframe|object|embed|audio|video)\b/i.test(source)) throw new Error('This SVG contains unsafe embedded content.');
  if (/\son[a-z]+\s*=/i.test(source)) throw new Error('This SVG contains unsafe event handlers.');
  if (/@import\b/i.test(source)) throw new Error('This SVG contains external styles or resources.');
  for (const match of source.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)) {
    const value = match[2].trim();
    if (!value.startsWith('#') && !/^data:image\/(?:png|jpeg|webp|gif);/i.test(value)) {
      throw new Error('This SVG contains external styles or resources.');
    }
  }
  for (const match of source.matchAll(/(?:href|xlink:href)\s*=\s*(["'])(.*?)\1/gi)) {
    const value = match[2].trim();
    if (!value.startsWith('#') && !/^data:image\/(?:png|jpeg|webp|gif);/i.test(value)) {
      throw new Error('This SVG contains an external resource reference.');
    }
  }
}

export function inspectSvgSource(input: string): InspectedSvg {
  const source = input.trim();
  if (!source || new TextEncoder().encode(source).byteLength > MAX_SVG_SOURCE_BYTES) {
    throw new Error('Enter SVG code no larger than 2 MB.');
  }
  const root = source.match(/<svg\b([^>]*)>/i);
  if (!root || (!/<\/svg\s*>\s*$/i.test(source) && !/<svg\b[^>]*\/\s*>\s*$/i.test(source))) {
    throw new Error('Enter valid SVG code with an <svg> root element.');
  }
  rejectUnsafeSvg(source);

  const viewBox = attributeValue(root[1], 'viewBox')?.split(/[\s,]+/).map(Number);
  const viewWidth = viewBox?.length === 4 && Number.isFinite(viewBox[2]) && viewBox[2] > 0 ? viewBox[2] : undefined;
  const viewHeight = viewBox?.length === 4 && Number.isFinite(viewBox[3]) && viewBox[3] > 0 ? viewBox[3] : undefined;
  let width = numericDimension(attributeValue(root[1], 'width'));
  let height = numericDimension(attributeValue(root[1], 'height'));
  if (!width && !height && viewWidth && viewHeight) [width, height] = [viewWidth, viewHeight];
  else if (width && !height && viewWidth && viewHeight) height = width * (viewHeight / viewWidth);
  else if (!width && height && viewWidth && viewHeight) width = height * (viewWidth / viewHeight);
  width ??= 1200;
  height ??= viewWidth && viewHeight ? width * (viewHeight / viewWidth) : 630;
  width = Math.max(1, Math.round(width));
  height = Math.max(1, Math.round(height));
  if (width > MAX_SVG_DIMENSION || height > MAX_SVG_DIMENSION) throw new Error(`SVG output dimensions must not exceed ${MAX_SVG_DIMENSION} pixels.`);
  if (width * height > MAX_SVG_PIXELS) throw new Error('SVG output must not exceed 32 megapixels.');

  const normalized = /<svg\b[^>]*\sxmlns\s*=/i.test(source)
    ? source
    : source.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return { source: normalized, width, height };
}

function parseSafeSvg(source: string) {
  const document = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (document.querySelector('parsererror') || document.documentElement.localName !== 'svg') {
    throw new Error('The SVG code could not be parsed.');
  }
  for (const element of document.querySelectorAll('*')) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith('on')) throw new Error('This SVG contains unsafe event handlers.');
      if ((name === 'href' || name === 'xlink:href') && !value.startsWith('#') && !/^data:image\/(?:png|jpeg|webp|gif);/i.test(value)) {
        throw new Error('This SVG contains an external resource reference.');
      }
    }
  }
  return document;
}

function loadSvgImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The SVG could not be rendered by this browser.'));
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, mimeType: string) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('The browser could not create the selected image format.')),
    mimeType,
    0.92,
  ));
}

export async function rasterizeSvg(input: string, format: SvgOutputFormat) {
  const inspected = inspectSvgSource(input);
  const document = parseSafeSvg(inspected.source);
  document.documentElement.setAttribute('width', String(inspected.width));
  document.documentElement.setAttribute('height', String(inspected.height));
  const serialized = new XMLSerializer().serializeToString(document);
  const svgUrl = URL.createObjectURL(new Blob([serialized], { type: 'image/svg+xml' }));
  try {
    const image = await loadSvgImage(svgUrl);
    const canvas = window.document.createElement('canvas');
    canvas.width = inspected.width;
    canvas.height = inspected.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas processing is not available in this browser.');
    if (format === 'jpeg') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvasBlob(canvas, outputForSvgFormat(format).mimeType);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
