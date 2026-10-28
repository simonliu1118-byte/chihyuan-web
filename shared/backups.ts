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
export interface BackupRehearsalHistoryEntry {
  eventId: number;
  backupId: string;
  occurredAt: string;
  status: "verified" | "failed" | "unconfirmed";
  provider: BackupProvider | null;
  phase: string | null;
  errorCode: string | null;
  requestId: string | null;
}
export interface BackupHistory {
  configured: boolean; recoveryConfigured?: boolean; scheduleEnabled?: boolean;
  sets: BackupHistoryEntry[]; rehearsals?: BackupRehearsalHistoryEntry[]; rehearsalHistoryAvailable?: boolean;
  /** Current bound isolated target can receive a new rehearsal only when the server confirms it is unused. */
  recoveryReady?: boolean;
  recoveryBlockedReason?: string;
}
export const BACKUP_REHEARSAL_ERROR_MESSAGES: Record<string, string> = {
  BACKUP_TABLE_COVERAGE_MISMATCH: "隔離資料庫結構與目前備份不一致（部分資料表缺少或多出），無法驗證。請保留既有目標，由管理員確認後準備新版空白驗證副本。",
  BACKUP_SCHEMA_MISMATCH: "隔離資料庫結構版本與備份不一致，請檢查隔離目標版本；不可直接覆寫。",
  BACKUP_COLUMNS_MISMATCH: "隔離資料庫欄位與備份不一致，請檢查版本；不可直接覆寫。",
  BACKUP_TARGET_NOT_EMPTY: "隔離驗證副本已使用，不能覆寫；重做須另行準備核准的空白目標。",
  BACKUP_TARGET_ALREADY_REHEARSED: "此隔離目標已執行過演練或曾發生結果未確認的驗證，系統已鎖定；下一次請準備經核准的新目標。",
  BACKUP_NO_VERIFIED_COPY_AVAILABLE: "所選儲存副本無法於本次讀回驗證，請核對備份紀錄；不要直接重送。",
  BACKUP_RECOVERY_TARGET_NOT_ISOLATED: "隔離目標設定不正確，已停止操作。",
  BACKUP_ISOLATED_RECOVERY_FAILED: "隔離還原或資料核對未能完成；目標可能已寫入，請先核對，切勿直接重試。",
  BACKUP_REHEARSAL_RESULT_UNCONFIRMED: "隔離還原可能已執行，但結果紀錄未能確認。請停止重試並由管理員查核。",
  BACKUP_RECOVERY_UNAVAILABLE: "隔離驗證未完成，請查看驗證紀錄與 requestId，不要直接重送。",
};
export interface BackupCreated extends BackupHistory { backupId: string }
export interface BackupRehearsal { verified: true; backupId: string; safetyBackupId: string; provider: BackupProvider }
export const BACKUP_REHEARSAL_CONFIRMATION = "驗證隔離還原";
