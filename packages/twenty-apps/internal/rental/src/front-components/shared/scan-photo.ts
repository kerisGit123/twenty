import { RestApiClient } from 'twenty-client-sdk/rest';

import type { PickedFile } from 'src/front-components/shared/file-drop';
import type { ScanResponse } from 'src/shared/scan';

// A phone photo is 3-8 MB; the reader needs far less. Photos are shrunk to
// 1600 px on the long side (JPEG) before sending: faster on mobile data,
// cheaper to read, and under the 5 MB image limit. PDFs go as they are.
const LONG_SIDE = 1600;

const toBase64 = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let text = '';

  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));

  return btoa(text);
};

const shrink = async (blob: Blob): Promise<Blob | null> => {
  const g = globalThis as { createImageBitmap?: (b: Blob) => Promise<ImageBitmap>; OffscreenCanvas?: typeof OffscreenCanvas };

  if (!g.createImageBitmap || !g.OffscreenCanvas) return null;
  try {
    const bitmap = await g.createImageBitmap(blob);
    const scale = Math.min(1, LONG_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = new g.OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');

    if (!context) return null;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
  } catch {
    // e.g. a HEIC photo the browser cannot open: sent as it is (the server explains).
    return null;
  }
};

export const scanReceipt = async (file: PickedFile): Promise<ScanResponse> => {
  if (!file.blob) return { success: false, message: 'Reload the page, then try again.' };
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const small = isPdf ? null : await shrink(file.blob);
  const blob = small ?? file.blob;
  const type = small ? 'image/jpeg' : isPdf ? 'application/pdf' : file.type || 'image/jpeg';

  try {
    return await new RestApiClient().post<ScanResponse>('/s/scan', { file: { name: file.name, type, data: await toBase64(blob) } });
  } catch (error) {
    return { success: false, message: `Could not reach the server. Check the connection and try again. (${error instanceof Error ? error.message : 'connection'})` };
  }
};
