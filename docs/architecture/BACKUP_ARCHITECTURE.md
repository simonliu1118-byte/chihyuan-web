# CY Backup Architecture

> Scope: shared provider-neutral backup/recovery architecture used by CY Web and reusable by other CY-family applications. Application-specific migration/cutover status belongs in each application's own repository/TODO, not in this architecture contract.

## 1. Target topology

```text
Application D1 (live authoritative data)
        ↓
App-specific BackupService
        ↓ export once
Portable CYBackupSet
        ↓
CY Backup storage orchestration
        ├─ R2  — daily operational backup / routine restore
        └─ GCS — lower-frequency cross-cloud disaster recovery
```

D1 remains the live authoritative database after application cutover. R2 and GCS are backup targets, not live synchronization stores.

## 2. Recovery tiers

### R2 — operational tier

Purpose:

- routine daily backup;
- normal in-app restore source while Cloudflare is healthy;
- short operational recovery window;
- provider-local access from Workers.

Policy:

- schedule: daily, 03:30 Taiwan time;
- application retention: 30 rolling days of verified backup copies;
- read-back verification required after upload;
- normal restore selection prefers R2 when an equivalent valid copy exists.

### GCS — cross-cloud DR tier

Purpose:

- independent recovery source when Cloudflare/R2 is unavailable, compromised or otherwise unsuitable as the only recovery source;
- longer history outside the Cloudflare provider boundary.

Policy:

- scheduled replication days: Wednesday and Sunday, Taiwan local date;
- retention: 26 rolling weeks / 182 days;
- receives the exact same already-created portable backup-set bytes as the logical R2 backup;
- must never trigger a second D1 export for the same logical backup;
- manual/high-risk/pre-restore safety backup requests both providers regardless of weekday.

Expected normal scheduled RPO characteristics:

```text
R2 operational RPO       < 24 hours
GCS cross-cloud DR RPO   <= about 4 days
```

## 3. Logical backup identity

A logical backup is provider-neutral:

```text
backupId = one application backup event
```

One `backupId` can have multiple provider-copy states:

```text
R2 copy   verified / failed / pending / absent
GCS copy  verified / failed / pending / absent
```

Provider copies of one logical backup share the same portable payload/manifest bytes when both exist. User-facing history lists one logical backup once, with provider-copy health beneath it.

## 4. Portable package contract

Shared layout:

```text
<app-scope>/<backup-id>/
├─ manifest.json
└─ data.json
```

Shared outer format:

```text
format        CYBackupSet
formatVersion 1
```

Required manifest semantics:

```text
format
formatVersion
backupId
appId
appVersion
schemaVersion
createdAtUtc
sourceDatabaseEngine
workspaceScope / tenant scope when applicable
recordCounts
totalRecordCount
dataObjectName
dataSha256
dataByteLength
```

`data.json` remains application-specific. The shared contract is the outer package/integrity contract, not a requirement for identical application schemas.

Provider-specific copy state, bucket IDs, object generations, bindings or credential metadata must not mutate the portable manifest.

## 5. Export once / replicate exact bytes

Required sequence:

```text
export application D1 once
→ serialize data.json once
→ SHA-256(data.json exact bytes)
→ build manifest.json once
→ create logical backupId
→ store + read-back verify R2
→ when GCS policy applies:
     replicate the same data.json + manifest.json bytes
     → read-back verify GCS
→ apply provider-specific retention
```

A failed GCS copy is retried from the already-created backup set. It must not query/export D1 again while pretending to be the same backup event.

## 6. BackupStorageProvider contract

Required common boundary:

```text
BackupStorageProvider
- putObject(key, bytes, metadata)
- getObject(key)
- listObjects(prefix)
- deleteObject(key, versionToken?)
```

Normalize provider metadata into portable fields such as:

```text
key
byteSize
timeCreated
versionToken?  // opaque provider token when applicable
```

Domain/orchestration code must not branch on GCS- or R2-specific token semantics.

## 7. Responsibility split

### App-specific BackupService

Owned by each application:

- application D1 export;
- deterministic serialization;
- application schema/version compatibility;
- portable manifest generation;
- record-count/domain validation;
- user authorization;
- Super Admin restriction where required;
- double-confirmation restore;
- application-specific restore ordering/writes;
- application audit evidence.

### BackupStorageProvider

Owned by provider adapter:

- object put/get/list/delete;
- provider authentication/binding mechanics;
- provider metadata/error normalization;
- read-back object access needed by integrity verification.

It does not know application tables, business roles or restore ordering.

### Shared CY Backup orchestration

Reusable infrastructure may own:

- provider adapters;
- provider-copy catalog;
- exact-byte storage verification;
- R2 → GCS replication;
- retention execution;
- storage health/retry state;
- app-scoped dataset routing.

Shared storage orchestration must not perform application D1 restore writes by itself.

## 8. Isolation boundary

Isolation is mandatory at logical and resource/credential levels.

### Logical isolation

- every package identifies its `appId`;
- listing/replication/recovery operations are scoped to the authenticated/authorized application;
- a caller cannot cross scope merely by changing an `appId` parameter.

### Resource / credential isolation

Each application uses app-scoped storage resources/bindings and least-privilege credentials. Do not share one broad credential across CY applications merely because storage orchestration is reusable.

Production bucket names, service-account payloads, tokens and exact resource identifiers remain deployment-private and must not be committed to this Public repository.

## 9. Logical catalog

Preferred semantics separate logical backup identity from provider copies:

```text
backup_sets
  backup_id
  app_id
  created_at
  app_version
  schema_version
  data_sha256
  data_byte_length
  record_count
  trigger_kind

backup_copies
  backup_id
  provider
  status
  verified_at
  storage_prefix
  version_token
  last_error
```

Exact table ownership may initially be app-local and later move behind shared orchestration. The user-facing meaning remains one logical backup with zero or more provider copies.

## 10. Retention rules

Application policy:

```text
R2  = 30 days
GCS = 182 days / 26 weeks
```

Rules:

- only verified copies count as recoverable;
- retention cleanup runs only after a new copy is successfully verified;
- cleanup failure does not invalidate the newly verified copy;
- a copy needed as pending replication source remains protected until replication resolves;
- provider lifecycle rules, if used, are secondary safety guards with thresholds longer than application retention;
- architecture/provider migration must not perform destructive bulk cleanup before replacement recovery acceptance.

## 11. Restore selection

Normal application restore flow:

```text
logical backup list
→ verify app scope + schema compatibility
→ prefer verified R2 copy
→ fallback to verified GCS copy of same backupId
→ load bytes
→ verify portable integrity
→ application-specific restore validation
→ required confirmation/authorization
→ controlled D1 restore
→ reconciliation + Audit
```

GCS remains the independent recovery source for provider-wide Cloudflare disaster scenarios.

## 12. Migration / compatibility principles

When an application adopts or changes this architecture:

- preserve its last accepted backup/restore path until the replacement path passes application-specific acceptance;
- introduce format/provider changes additively and version compatibility explicitly;
- do not rewrite old accepted backup objects in place merely to attach new provider metadata;
- do not destructively change backup format and storage provider at the same instant without a tested compatibility path;
- keep rollback to the last accepted topology during the migration acceptance window;
- application-specific phase names, version numbers, current provider state and cutover dates belong in that application's own repository/status tracker, not here.

## 13. Acceptance matrix

A tiered/shared implementation is not complete until the applicable application proves:

1. one D1 export creates one logical `backupId`;
2. R2 read-back SHA-256/byte-length/record-count verification passes;
3. GCS copy of the same logical backup has identical portable bytes/digests;
4. forced GCS copy failure does not invalidate a valid R2 backup;
5. GCS retry does not re-export D1;
6. retention follows the 30-day R2 / 26-week GCS policy;
7. one logical backup is displayed once even when multiple provider copies exist;
8. R2-unavailable restore can fall back to a valid GCS copy;
9. cross-app listing/access is rejected;
10. pre-existing accepted backup formats remain readable for their declared compatibility window;
11. migration rollback remains possible until explicit cutover acceptance;
12. shared storage orchestration cannot perform application D1 restore writes on its own.

CY Web implements the shared outer `CYBackupSet / formatVersion 1` for new packages. CYAccountingWeb currently preserves its already-accepted app-specific outer format during its governed migration; sharing storage/manifest concepts does not make the two applications' payloads or restore readers interchangeable.

Current per-application implementation progress is intentionally excluded from this document. Use each application's current `main`/`TODO` and deployment-private operational records.
