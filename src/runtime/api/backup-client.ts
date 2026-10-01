import type { BackupCreated, BackupHistory } from "../../../shared/backups";
import { apiRequest } from "../../api/client";
export function loadBackups(signal?: AbortSignal): Promise<BackupHistory> {
  return apiRequest("/api/admin/backups", { method: "GET", signal });
}
export function createBackup(signal?: AbortSignal): Promise<BackupCreated> {
  return apiRequest("/api/admin/backups", { method: "POST", signal });
}
export function retryBackup(backupId: string, signal?: AbortSignal): Promise<BackupHistory> {
  return apiRequest(`/api/admin/backups/${encodeURIComponent(backupId)}/retry`, { method: "POST", signal });
}
