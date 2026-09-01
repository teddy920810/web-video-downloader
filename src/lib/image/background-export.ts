type ExportDependencies = {
  decode(blob: Blob): Promise<ImageBitmap>;
  createCanvas(): HTMLCanvasElement;
};

function browserDependencies(): ExportDependencies {
  return {
    decode: (blob) => createImageBitmap(blob),
    createCanvas: () => document.createElement('canvas'),
  };
}

export async function composeBackground(source: Blob, color: string, dependencies = browserDependencies()): Promise<Blob> {
  const bitmap = await dependencies.decode(source);
  try {
    const canvas = dependencies.createCanvas();
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas processing is unavailable.');
    if (color !== 'transparent') {
      context.fillStyle = color;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(bitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Unable to create the PNG file.')),
      'image/png',
    ));
  } finally {
    bitmap.close();
  }
}

export async function downloadBackgroundResult(resultUrl: string, color: string): Promise<void> {
  const response = await fetch(resultUrl);
  if (!response.ok) throw new Error('Unable to prepare the image download.');
  const output = await composeBackground(await response.blob(), color);
  const objectUrl = URL.createObjectURL(output);
  try {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = 'streamnest-background-removed.png';
    link.click();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
  }
}
