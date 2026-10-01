export type BackupProvider = "r2" | "gcs";
export interface BackupCopy {
  provider: BackupProvider;
  status: string;
  verifiedAt: string | null;
  errorCode: string | null;
}
export interface BackupHistoryEntry {
  backupId: string;
  createdAt: string;
  appVersion: string;
  schemaVersion: string;
  dataSha256: string;
  byteLength: number;
  recordCount: number;
  status: string;
  triggerKind: string;
  copies: BackupCopy[];
  canRetry: boolean;
}
export interface BackupHistory { configured: boolean; sets: BackupHistoryEntry[] }
export interface BackupCreated extends BackupHistory { backupId: string }
