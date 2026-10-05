export type SerializedFileData = {
  name: string;
  size: number;
  type: string;
  lastModified: number;
  // The file itself, so a front component can upload what the user picked
  // or dropped (Blobs are structured-cloned across the thread).
  blob?: Blob;
};
