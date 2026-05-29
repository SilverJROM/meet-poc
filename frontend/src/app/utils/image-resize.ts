// Downscale an image File to fit within maxW x maxH and return a data URL.
// Used for account background uploads (stored small/720p) and reusable elsewhere.
export async function resizeImageToDataUrl(
  file: File,
  maxW = 1280,
  maxH = 720,
  mime = 'image/webp',
  quality = 0.85,
): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not available');
    ctx.drawImage(img, 0, 0, width, height);
    const dataUrl = canvas.toDataURL(mime, quality);
    // Fall back to PNG if the browser couldn't encode the requested mime.
    return dataUrl.startsWith(`data:${mime}`) ? dataUrl : canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read image'));
    img.src = src;
  });
}
