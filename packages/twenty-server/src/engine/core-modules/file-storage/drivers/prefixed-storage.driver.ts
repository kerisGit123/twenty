import { type Readable } from 'stream';

import { type StorageDriver } from 'src/engine/core-modules/file-storage/drivers/interfaces/storage-driver.interface';
import { type FileStorageMetadata } from 'src/engine/core-modules/file-storage/types/file-storage-metadata.type';

import { type ByteRange } from 'src/engine/core-modules/file-storage/types/byte-range.type';

// Scopes every key under a fixed prefix (e.g. "app/"), so Twenty can share a
// bucket with other content without touching it. Wrapping at the interface
// boundary keeps the underlying driver's internal key handling (folder
// copy/move re-listing raw keys) untouched, so keys are never prefixed twice.
export class PrefixedStorageDriver implements StorageDriver {
  private readonly prefix: string;

  constructor(
    private readonly delegate: StorageDriver,
    prefix: string,
  ) {
    this.prefix = prefix.replace(/^\/+|\/+$/g, '');
  }

  private withPrefix(path: string): string {
    return `${this.prefix}/${path.replace(/^\/+/, '')}`;
  }

  private withPrefixedFolder<T extends { folderPath: string }>(location: T): T {
    return { ...location, folderPath: this.withPrefix(location.folderPath) };
  }

  async readFile(params: {
    filePath: string;
    byteRange?: ByteRange;
  }): Promise<Readable> {
    return this.delegate.readFile({ ...params, filePath: this.withPrefix(params.filePath) });
  }

  async readFilePrefix(params: {
    filePath: string;
    byteCount: number;
  }): Promise<Buffer> {
    return this.delegate.readFilePrefix({ ...params, filePath: this.withPrefix(params.filePath) });
  }

  async writeFile(params: {
    filePath: string;
    sourceFile: Buffer | Uint8Array | string;
    mimeType: string | undefined;
  }): Promise<void> {
    return this.delegate.writeFile({ ...params, filePath: this.withPrefix(params.filePath) });
  }

  async writeFileStream(params: {
    filePath: string;
    stream: Readable;
    mimeType: string | undefined;
  }): Promise<void> {
    return this.delegate.writeFileStream({ ...params, filePath: this.withPrefix(params.filePath) });
  }

  async getFileMetadata(params: {
    filePath: string;
  }): Promise<FileStorageMetadata | null> {
    return this.delegate.getFileMetadata({ filePath: this.withPrefix(params.filePath) });
  }

  async downloadFile(params: {
    onStoragePath: string;
    localPath: string;
  }): Promise<void> {
    return this.delegate.downloadFile({
      ...params,
      onStoragePath: this.withPrefix(params.onStoragePath),
    });
  }

  async delete(params: { folderPath: string; filename?: string }): Promise<void> {
    return this.delegate.delete(this.withPrefixedFolder(params));
  }

  async move(params: {
    from: { folderPath: string; filename?: string };
    to: { folderPath: string; filename?: string };
    ifMatchChecksum?: string;
  }): Promise<void> {
    return this.delegate.move({
      ...params,
      from: this.withPrefixedFolder(params.from),
      to: this.withPrefixedFolder(params.to),
    });
  }

  async copy(params: {
    from: { folderPath: string; filename?: string };
    to: { folderPath: string; filename?: string };
  }): Promise<void> {
    return this.delegate.copy({
      from: this.withPrefixedFolder(params.from),
      to: this.withPrefixedFolder(params.to),
    });
  }

  async checkFileExists(params: { filePath: string }): Promise<boolean> {
    return this.delegate.checkFileExists({ filePath: this.withPrefix(params.filePath) });
  }

  async checkFolderExists(params: { folderPath: string }): Promise<boolean> {
    return this.delegate.checkFolderExists({ folderPath: this.withPrefix(params.folderPath) });
  }

  async getPresignedUrl(params: {
    filePath: string;
    expiresInSeconds?: number;
    responseContentType?: string;
    responseContentDisposition?: string;
    responseCacheControl?: string;
  }): Promise<string | null> {
    return this.delegate.getPresignedUrl({ ...params, filePath: this.withPrefix(params.filePath) });
  }

  async getPresignedUploadUrl(params: {
    filePath: string;
    contentType: string;
    contentLength: number;
    expiresInSeconds?: number;
  }): Promise<string | null> {
    return this.delegate.getPresignedUploadUrl({
      ...params,
      filePath: this.withPrefix(params.filePath),
    });
  }
}
