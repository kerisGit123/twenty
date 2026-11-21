// Shared folders: a link anyone can open to see (and download) every file in
// one Documents folder, including the folders inside it. A link is a random
// token kept in the app's key-value store; it lasts the days picked when it was
// made (0 = until someone stops it) and stops working once stopped.

export type FolderShare = {
  token: string;
  ownerId: string;
  folder: string;
  createdAt: string; // ISO
  expiresAt: string | null; // ISO; null = until stopped
  createdBy: string;
};

export const SHARE_DAY_CHOICES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 0, label: 'Until I stop it' },
] as const;

export const shareKey = (token: string) => `folderShare:${token}`;
// The tokens of one business's links, so its folders can list them.
export const shareIndexKey = (ownerId: string) => `folderShares:${ownerId}`;

export const shareIsLive = (share: FolderShare | null, now = new Date()) => !!share && (!share.expiresAt || Date.parse(share.expiresAt) > now.getTime());
