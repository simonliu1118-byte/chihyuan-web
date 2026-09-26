# CY Backup Architecture

> Scope: current shared backup architecture for CY Web and CYAccountingWeb. This is an architecture/design document, not a fourth governance-rules layer.

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

D1 remains the live database. R2 and GCS are immutable-style backup targets, not live sync stores.

## 2. Recovery tiers

### R2 — operational tier

Purpose:

- routine daily backup;
- normal in-app restore while Cloudflare services are available;
- short operational recovery window;
- fast provider-local access from Workers.

Policy:

- schedule: daily, 03:30 Taiwan time;
- retention: 30 rolling days of verified backup copies;
- read-back verification required after upload;
- normal restore selection prefers R2 when an equivalent valid copy exists.

### GCS — cross-cloud DR tier

Purpose:

- recover when Cloudflare/R2 is unavailable, compromised or otherwise unsuitable as the only recovery source;
- retain a longer independent history outside the Cloudflare provider boundary.

Policy:

- standard replication days: Wednesday and Sunday, Taiwan local date;
- retention: 26 rolling weeks (182 days);
- GCS receives the exact same already-created portable backup set; it never causes an independent D1 export;
- manual/high-risk/pre-restore safety backup requests both providers regardless of weekday.

Expected schedule characteristics:

```text
R2 operational RPO       < 24 hours under normal scheduled operation
GCS cross-cloud DR RPO   <= about 4 days under normal Wed/Sun replication
```

A failed eligible GCS copy remains pending/failed and must be retried from the already-created verified backup set rather than rebuilding a new D1 export with the same conceptual purpose.

## 3. Logical backup identity

A logical backup is not provider-specific.

```text
backupId = one application backup event
```

One `backupId` may have:

```text
R2 copy       verified / failed / pending / absent
GCS copy      verified / failed / pending / absent
```

The provider copies share identical portable bytes when both exist.

Do not display two provider copies of the same `backupId` as two separate business backups.

## 4. Portable package contract

Target shared layout:

```text
<app-scope>/<backup-id>/
├─ manifest.json
└─ data.json
```

Target shared outer format:

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

The exact stored bytes are authoritative for integrity verification. `dataSha256` is calculated over the exact UTF-8 bytes stored as `data.json`.

Provider-specific state must not mutate the package. In particular, do not put provider copy verification status, R2/GCS object generation, bucket identifier or provider credential metadata into the portable manifest.

## 5. Export once / replicate bytes

The required sequence for a normal daily backup is:

```text
export application D1 once
→ serialize data.json once
→ SHA-256(data.json)
→ build manifest.json once
→ create logical backupId
→ upload exact bytes to R2
→ read back R2 objects
→ verify bytes/digest/counts/manifest
→ mark R2 copy verified
→ if GCS policy applies for this backupId:
     replicate exact same data.json + manifest.json bytes
     → read back GCS objects
     → verify same bytes/digest/counts/manifest
     → mark GCS copy verified
→ apply provider-specific retention
```

A GCS retry reuses the existing backup-set bytes. It does not query/export D1 again.

## 6. Provider contract

Required common interface:

```text
BackupStorageProvider
- putObject(key, bytes, metadata)
- getObject(key)
- listObjects(prefix)
- deleteObject(key, versionToken?)
```

Normalized list/object metadata should expose only portable storage facts needed by orchestration, for example:

```text
key
byteSize
timeCreated
versionToken?   // opaque provider token when applicable
```

`versionToken` may internally represent a GCS generation, R2 version/etag or another provider concept, but callers must not assume its provider-specific shape.

## 7. Service responsibilities

### App-specific BackupService

Owned by CY Web or CYAccountingWeb individually:

- application D1 export;
- data serialization;
- application schema/version compatibility;
- portable manifest generation;
- application record-count validation;
- user-facing backup/restore authorization;
- Super Admin restriction and double-confirmation restore;
- application restore ordering and D1 writes;
- application audit evidence.

### BackupStorageProvider

Owned by provider adapter:

- object put/get/list/delete only;
- provider authentication/binding mechanics;
- normalization of provider metadata/errors.

It does not know application tables, roles or restore semantics.

### Future CY Backup Service / Worker

Shared infrastructure service:

- provider adapters;
- provider-copy catalog;
- exact-byte storage verification;
- R2→GCS replication;
- retention execution;
- storage health and retry state;
- app-scoped dataset routing.

The shared service must not perform application D1 restore writes.

## 8. Isolation boundary

Isolation is mandatory at two levels.

### Logical isolation

Every package contains an `appId`; backup listing/restoration is scoped by the authenticated calling application.

### Credential/resource isolation

For each application:

- separate R2 dataset/bucket or isolated binding;
- separate GCS dataset/bucket;
- separate least-privilege GCS service identity/credential;
- no broad credential shared simply because one CY Backup Worker serves multiple apps.

A future shared Worker maps internal caller identity to an allowed app scope. The caller cannot cross scope by changing an `appId` parameter.

## 9. Catalog model

The preferred logical catalog separates backup identity from provider copies:

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
  version_token / provider metadata (opaque)
  last_error
```

The exact table ownership may remain app-local initially and later move into CY Backup Service.

## 10. Retention rules

Primary application policy:

```text
R2  = 30 days
GCS = 182 days / 26 weeks
```

Rules:

- only verified copies count as recoverable;
- retention cleanup occurs only after a new copy is successfully verified;
- cleanup failure does not invalidate the new copy;
- a copy needed as the source of pending replication is protected until replication resolves;
- provider lifecycle rules, if used, are secondary guards with thresholds longer than the application policy;
- no bulk destructive cleanup occurs during architecture migration until the replacement path has passed acceptance.

## 11. Restore selection

Normal in-app restore candidate flow:

```text
logical backup list
→ verify requested appId / schema compatibility
→ prefer verified R2 copy
→ fallback to verified GCS copy of same backupId
→ load bytes
→ portable integrity verification
→ app-specific restore validation
→ double confirmation
→ controlled D1 restore
→ reconciliation + audit
```

For provider-wide Cloudflare disaster recovery, GCS is the independent recovery source.

## 12. CYAccountingWeb V0.17 migration plan

Current accepted baseline:

- D1 is authoritative;
- GCS provider is production and verified;
- V0.17 exports a portable two-file backup set;
- daily 03:30 Taiwan schedule;
- current GCS retention is 14 days;
- current provider contract already uses put/get/list/delete.

The migration is deliberately additive-first.

### Phase A — freeze accepted GCS path

Do not remove, rename or disable the working V0.17 GCS path while the new architecture is only documentation/design.

### Phase B — package compatibility

- isolate one reusable backup-set builder from provider execution;
- add the shared `CYBackupSet` outer contract behind a versioned compatibility path;
- keep the V0.17 application-specific format readable;
- test deterministic bytes/digests and old-format validation before changing production output.

### Phase C — add R2, keep GCS behavior

- implement an R2 `BackupStorageProvider` adapter;
- configure an Accounting-specific R2 dataset/binding;
- export once per scheduled backup;
- write the same backup-set bytes to R2 and the existing GCS path during the parallel acceptance period;
- keep GCS daily schedule and current 14-day behavior during this phase;
- set R2 operational retention to 30 days.

Acceptance gate: at least **14 consecutive scheduled backups** with successful R2 and GCS read-back verification, identical logical backup IDs/package digests for paired copies, and no regression to current GCS recovery evidence.

### Phase D — switch to tiered schedule

After Phase C acceptance:

- R2 remains daily at 03:30;
- GCS changes from daily export target to Wed/Sun replication target;
- GCS retention changes to 26 weeks;
- GCS replication uses the same verified backup set, never a second D1 export;
- pre-cutover daily GCS objects are not bulk-deleted at cutover; they age out safely under an explicit compatibility cleanup policy.

### Phase E — shared CY Backup Service

When CY Web reaches the same implementation stage:

- move provider adapters, provider-copy catalog, replication and retention behind the shared CY Backup Service/Worker;
- keep Accounting exporter/restorer/schema validation inside CYAccountingWeb;
- migrate one app at a time behind feature/config switches;
- retain direct GCS rollback capability during acceptance;
- only after shared-service acceptance remove direct provider credentials/bindings from the application Worker.

## 13. Migration rollback principles

At every production migration step:

- accepted V0.17 GCS backups remain valid;
- do not rewrite old objects in place;
- do not change existing backup bytes merely to add provider metadata;
- new format/version readers must coexist with old accepted backup format until retention/compatibility policy explicitly allows retirement;
- a feature/config switch must permit rollback to the last accepted storage topology during the validation window.

## 14. Acceptance matrix

A tiered/shared implementation is not complete until all of the following pass:

1. one D1 export creates one logical `backupId`;
2. R2 read-back SHA-256/byte-length/record-count verification passes;
3. GCS copy of the same logical backup has identical portable bytes/digests;
4. forced GCS copy failure does not invalidate a valid R2 backup;
5. GCS retry does not re-export D1;
6. retention respects 30-day R2 / 26-week GCS policy;
7. one backup is shown once even when two provider copies exist;
8. R2-unavailable restore can fall back to a valid GCS copy;
9. cross-app listing/access is rejected;
10. existing CYAccountingWeb V0.17 GCS backups remain readable/valid;
11. direct GCS production path remains available until the explicit cutover gate is passed;
12. shared service, when introduced, cannot perform application D1 restore writes on its own.
