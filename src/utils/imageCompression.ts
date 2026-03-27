/**
 * Shared image compression and file-naming utilities.
 * Used by Team.tsx (new-member form) and EditMemberModal.tsx (edit form).
 */

/** Compress an image file to a target size using binary-search quality reduction. */
export const compressImage = (file: File, maxSizeKB = 150): Promise<File> => {
  return new Promise((resolve, reject) => {
    if (file.size <= maxSizeKB * 1024) { resolve(file); return; }
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image for compression')); };
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      const maxDim = 1200;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      // Binary search for quality that hits target size
      let lo = 0.1, hi = 0.9, bestBlob: Blob | null = null;
      const tryQuality = (q: number): Promise<Blob | null> => new Promise(r => canvas.toBlob(b => r(b), 'image/jpeg', q));
      (async () => {
        try {
          for (let i = 0; i < 5; i++) {
            const mid = (lo + hi) / 2;
            const blob = await tryQuality(mid);
            if (!blob) break;
            bestBlob = blob;
            if (blob.size > maxSizeKB * 1024) hi = mid; else lo = mid;
          }
          if (!bestBlob) { resolve(file); return; } // fallback to original if compression fails
          resolve(new File([bestBlob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
        } catch (e) { console.error('Image compression failed, using original:', e); resolve(file); }
      })();
    };
    img.src = url;
  });
};

/** Sanitize a name for use in filenames: lowercase, replace spaces/special chars with underscore. */
export const sanitizeName = (name: string): string =>
  name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'unnamed';

/** Generate a datetime stamp like 20260324_1430 for unique file naming. */
export const getDateStamp = (): string => {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
};
