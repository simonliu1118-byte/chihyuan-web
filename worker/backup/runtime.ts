import type { IdentityRuntimeEnv } from "../http/auth-routes";
import { BackupService } from "./backup-service";
import { GCSBackupProvider } from "./gcs-provider";
import { R2BackupProvider } from "./r2-provider";
export interface BackupRuntimeEnv extends IdentityRuntimeEnv {
  BACKUP_ENABLED?: string;
  BACKUP_R2?: R2Bucket;
  GCS_BUCKET?: string;
  GCS_SERVICE_ACCOUNT_JSON?: string;
}
export function backupService(env: BackupRuntimeEnv): BackupService | null {
  if (env.BACKUP_ENABLED !== "true" || !env.BACKUP_R2 || !env.GCS_BUCKET || !env.GCS_SERVICE_ACCOUNT_JSON
    || !env.IDENTITY_WORKSPACE_ID || !env.SOURCE_VERSION) return null;
  return new BackupService(env.DB, env.IDENTITY_WORKSPACE_ID, env.SOURCE_VERSION,
    { r2: new R2BackupProvider(env.BACKUP_R2), gcs: new GCSBackupProvider(env.GCS_BUCKET, env.GCS_SERVICE_ACCOUNT_JSON) });
}
