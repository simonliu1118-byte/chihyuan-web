import { recoveryOperationIdPattern } from "./cyinvoice-recovery-client";

/** Navigation checkpoint only; never an authorization or invitation authority. */
export interface RecoveryCheckpoint {
  operationId: string;
  attempted: boolean;
  closed: boolean;
}
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

export function recoveryCheckpointKey(workspaceId: string, employeeId: string): string {
  return "cyweb:cyinvoice-recovery:" + JSON.stringify([workspaceId, employeeId]);
}

export function readRecoveryCheckpoint(storage: Storage, key: string): RecoveryCheckpoint | null {
  const raw = storage.getItem(key);
  if (raw === null) return null;
  const row = JSON.parse(raw) as RecoveryCheckpoint;
  if (!row || Object.keys(row).some(k => !["operationId", "attempted", "closed"].includes(k))
      || typeof row.operationId !== "string" || !recoveryOperationIdPattern.test(row.operationId)
      || typeof row.attempted !== "boolean" || typeof row.closed !== "boolean"
      || (row.closed && !row.attempted)) throw new Error("RECOVERY_CHECKPOINT_INVALID");
  return row;
}

export function writeRecoveryCheckpoint(storage: Storage, key: string, row: RecoveryCheckpoint): void {
  // Explicit projection: credentials, recovery code and provider state cannot persist here.
  const raw = JSON.stringify({ operationId: row.operationId, attempted: row.attempted, closed: row.closed });
  storage.setItem(key, raw);
  if (storage.getItem(key) !== raw) throw new Error("RECOVERY_CHECKPOINT_NOT_SAVED");
}
