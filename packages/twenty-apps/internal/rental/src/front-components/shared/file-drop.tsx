import { type CSSProperties, type ReactNode, type SyntheticEvent, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';

import { ALLOWED_EXTENSIONS, extensionOf, formatBytes, MAX_UPLOAD_BYTES } from 'src/shared/documents';

// Drop files here (desktop) or tap to pick / take a photo (phone). The page
// gets the files themselves (the fork passes them across the sandbox) and
// uploads them through POST /s/files, which stores them in R2.

export type PickedFile = { name: string; size: number; type: string; blob: Blob | null };

type SerializedFile = { name?: string; size?: number; type?: string; blob?: Blob };

// Files from an <input type=file> change or a drop event.
export const filesFromEvent = (event: SyntheticEvent<HTMLElement> | unknown): PickedFile[] => {
  const object = event as { detail?: { files?: SerializedFile[] }; files?: SerializedFile[] };
  const files = object.detail?.files ?? object.files ?? [];

  return files
    .filter((f) => f && typeof f.name === 'string')
    .map((f) => ({ name: f.name as string, size: f.size ?? 0, type: f.type ?? '', blob: f.blob ?? null }));
};

// Why a file can't be uploaded, or null when it's fine.
export const fileProblem = (file: PickedFile): string | null => {
  if (!file.blob) return 'Reload the page to enable uploads.';
  if (!ALLOWED_EXTENSIONS.includes(extensionOf(file.name))) return 'Only PDF, photos and Office files.';
  if (file.size > MAX_UPLOAD_BYTES) return `${formatBytes(file.size)} — the limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`;
  if (file.size === 0) return 'The file is empty.';

  return null;
};

const toBase64 = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let text = '';

  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));

  return btoa(text);
};

export type UploadResult = { success: boolean; message?: string; documentId?: string; fileId?: string; expenseId?: string };

// Uploads one file; `target` says where it goes: { documentId } |
// { newDocument: {...} } | { expenseId }.
export const uploadFile = async (file: PickedFile, target: Record<string, unknown>): Promise<UploadResult> => {
  const problem = fileProblem(file);

  if (problem) return { success: false, message: `${file.name}: ${problem}` };

  try {
    const data = await toBase64(file.blob as Blob);

    return await new RestApiClient().post<UploadResult>('/s/files', { action: 'upload', file: { name: file.name, type: file.type, data }, ...target });
  } catch (error) {
    return { success: false, message: `${file.name}: ${error instanceof Error ? error.message : 'upload failed'}` };
  }
};

const readFilesFromInput = (event: SyntheticEvent<HTMLElement>) => filesFromEvent(event);

export const FileDrop = ({
  onFiles,
  title = 'Drop files here',
  hint = 'or tap to choose — PDF or photos, up to 20 MB each',
  compact = false,
  disabled = false,
  accept = 'application/pdf,image/*,.doc,.docx,.xls,.xlsx',
  children,
}: {
  onFiles: (files: PickedFile[]) => void;
  title?: string;
  hint?: string;
  compact?: boolean;
  disabled?: boolean;
  accept?: string;
  children?: ReactNode;
}) => {
  const [over, setOver] = useState(false);
  const box: CSSProperties = {
    position: 'relative',
    display: 'flex',
    flexDirection: compact ? 'row' : 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: compact ? 10 : 6,
    padding: compact ? '10px 14px' : '22px 16px',
    borderRadius: 12,
    border: `2px dashed ${over ? 'var(--t-color-blue8)' : 'var(--t-border-color-medium)'}`,
    background: over ? 'var(--t-color-blue2)' : 'var(--t-background-secondary)',
    color: 'var(--t-font-color-secondary)',
    textAlign: 'center',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    boxSizing: 'border-box',
    width: '100%',
    fontFamily: 'var(--t-font-family)',
  };

  return (
    <label
      style={box}
      onDragOver={() => !over && setOver(true)}
      onDragEnter={() => setOver(true)}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        setOver(false);
        if (disabled) return;

        const files = filesFromEvent(event);

        if (files.length) onFiles(files);
      }}
    >
      <span style={{ fontSize: compact ? 20 : 28 }}>{over ? '📥' : '📎'}</span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: compact ? 'left' : 'center' }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--t-font-color-primary)' }}>{over ? 'Drop to upload' : title}</span>
        <span style={{ fontSize: 12 }}>{hint}</span>
      </span>
      {children}
      <input
        type="file"
        multiple
        accept={accept}
        disabled={disabled}
        onChange={(event) => {
          const files = readFilesFromInput(event);

          if (files.length) onFiles(files);
        }}
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
      />
    </label>
  );
};
