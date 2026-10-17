import { BACKUP_REHEARSAL_CONFIRMATION, type BackupCreated, type BackupHistory, type BackupProvider, type BackupRehearsal } from "../../../shared/backups";
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
export function rehearseBackup(backupId: string, provider: BackupProvider, signal?: AbortSignal): Promise<BackupRehearsal> {
  return apiRequest(`/api/admin/backups/${encodeURIComponent(backupId)}/rehearse`, { method: "POST", signal,
    json: { selectionConfirmation: backupId, provider, reviewed: true, confirmation: BACKUP_REHEARSAL_CONFIRMATION } });
}
