// A file picked in an <input type="file"> inside a front component: the
// browser hands the sandbox the file's Blob, which goes to the server as base64.

export type PickedFile = { name: string; base64: string };

const toBase64 = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';

  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));

  return btoa(binary);
};

export const readPickedFile = async (event: unknown): Promise<PickedFile | null> => {
  const target = (event as { target?: { files?: ArrayLike<{ name?: string; blob?: Blob } & Partial<Blob>> } }).target;
  const chosen = target?.files?.[0];
  const blob = chosen?.blob ?? (chosen instanceof Blob ? chosen : null);

  if (!chosen || !blob) return null;

  return { name: chosen.name ?? 'file.xlsx', base64: await toBase64(blob) };
};
