# CY Web Cloudflare / Public Repository Deployment Principles

> Project: Chihyuan Enterprise Management System (CY Web)
>
> Canonical permanent rule source: root `PROJECT_RULES.md`. This document expands the deployment/infrastructure consequences of that rule for implementation work.

## Core principle

> **Source 留接口，不留實際正式連線。**
>
> **Infrastructure metadata 在部署時注入。**
>
> **Secret 在 Cloudflare / GitHub Secret Store 管理。**
>
> **使用者資料、Token、正式資料庫資訊永遠不進 Public Git。**
>
> **Fork 使用者應可用同一份 Source 接自己的 Cloudflare、D1、Identity 與第三方 API。**

CY Web Public source describes what capabilities the application requires, but must not embed Chihyuan production resource identities or credentials.

## 1. Public source keeps only generic binding contracts

Application code may depend on stable logical bindings such as:

```text
DB
IDENTITY
STORAGE
BACKUP_PROVIDER
```

These names describe required capabilities. They do not identify Chihyuan production resources.

Public source/config templates may contain placeholders, for example:

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "__D1_DATABASE_NAME__",
      "database_id": "__D1_DATABASE_ID__"
    }
  ],
  "services": [
    {
      "binding": "IDENTITY",
      "service": "__IDENTITY_SERVICE__"
    }
  ]
}
```

Public Git must not contain Chihyuan production values such as:

```text
production D1 database_id
production D1 database name
production Worker/service names
Cloudflare Account ID
Cloudflare API Token
OAuth Client Secret
Refresh Token
Encryption Key
production user/business data
```

## 2. Infrastructure metadata is injected at deployment time

Cloudflare resource identities belong to the deployment environment, not the application source.

Examples include:

```text
CF_WORKER_NAME
CF_D1_DATABASE_NAME
CF_D1_DATABASE_ID
CF_IDENTITY_SERVICE
R2 / KV / Queue resource identifiers
```

They should be stored in the appropriate GitHub Deployment Environment variables/secrets or another approved deployment-time secret/config store.

The production deployment flow should conceptually be:

```text
Checkout source
↓
Read GitHub Environment Variables / Secrets
↓
Generate deployment-only Wrangler configuration
↓
Apply D1 migrations
↓
Deploy Worker
```

A generated production config such as `wrangler.deploy.jsonc` exists only in the CI runner/workspace for the deployment and must not be committed back to the Public repo.

## 3. Secrets use secret stores

Deployment credentials such as:

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
```

belong in GitHub Environment Secrets or the equivalent protected deployment store.

Runtime credentials such as:

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_TOKEN_KEY
SMTP_SECRET
API_SECRET
JWT_SECRET
WEBHOOK_SECRET
```

belong in Cloudflare Worker Secrets or another approved runtime secret store.

Application code references only names such as:

```text
env.GOOGLE_CLIENT_SECRET
env.JWT_SECRET
```

and never embeds their production values.

## 4. OAuth and third-party services follow the same boundary

Public source may include:

```text
OAuth callback contract
required scopes
secret/binding names
API integration logic
```

It must not include Chihyuan production OAuth credentials, refresh tokens, encryption keys, or private service data.

A fork/deployer should be able to:

```text
create its own provider project/account
create its own OAuth/application credentials
configure its own Cloudflare resources and secrets
deploy the same source against its own services/data
```

without sharing Chihyuan production infrastructure.

## 5. Fork independence is an architecture requirement

The intended boundary is:

```text
Chihyuan source
    ├─ DB binding        → deployer's D1
    ├─ IDENTITY binding  → deployer's Identity service
    ├─ STORAGE binding   → deployer's R2/KV/etc.
    ├─ OAuth/API         → deployer's third-party account
    └─ Secrets           → deployer's secret stores
```

The same source must be deployable to different Cloudflare accounts without those deployments sharing production resources or credentials by default.

## 6. Chihyuan production remains separate from Public source

Chihyuan production deployment is conceptually:

```text
Chihyuan GitHub Environment
↓
Chihyuan Cloudflare Account
↓
Chihyuan Worker
↓
Chihyuan D1 / storage / bindings
↓
Chihyuan Identity
↓
Chihyuan Google / third-party integrations
```

The Public repo contains only reusable source artifacts such as:

```text
Source Code
Migrations
Logical binding names
Config templates/placeholders
Deployment scripts
API contracts
```

It does not contain the production resource identifiers, production credentials, tokens, or business/user data listed above.

## 7. CI/CD boundary

Preferred production path:

```text
PR
↓
Syntax / Unit Test / Migration Test / Worker Dry-run
↓
Merge main
↓
Production GitHub Environment injects resource config/secrets
↓
Generate deployment-only config
↓
Remote D1 migration
↓
Worker deploy
```

PR jobs must not receive production deployment secrets and must not deploy production.

Only an explicitly authorized production deploy job from the approved branch/environment may access production deployment configuration.

## 8. Implementation reminder

Whenever CY Web later adds Cloudflare Workers, D1, Service Bindings, R2, KV, Queues, Google APIs, Microsoft APIs, email providers, backup providers, or other external services, implementation must start from this boundary rather than committing a working production identifier first and trying to remove it later.

The permanent rule is defined in `PROJECT_RULES.md`; this document is the implementation reference for future cloud/integration work.


## Backup deployment activation contract

The protected `development` environment supplies the following inputs; their actual values remain outside Public Git.

| Input | Store | Purpose |
| --- | --- | --- |
| `CF_BACKUP_ENABLED` | environment variable | Exact `true` enables manual backup routes; absent/false leaves backup unavailable. |
| `CF_BACKUP_R2_BUCKET` | environment variable | Existing app-owned R2 bucket bound as `BACKUP_R2`; required when enabled. |
| `GCS_BUCKET` | environment variable | Existing app-owned GCS bucket; required when enabled. |
| `GCS_SERVICE_ACCOUNT_JSON` | environment secret | Dedicated service account credential with access limited to this application's GCS bucket. |
| `CF_BACKUP_SCHEDULE_ENABLED` | environment variable | Separate exact `true` opt-in for Taiwan 03:30 scheduling; requires backup enabled. |

Enable manual operation first, leaving schedule absent/false. Before remote migrations, the deployment validates required storage inputs and service-account JSON/PKCS8 RSA format. This is configuration validation, not evidence of live bucket permissions or successful replication. The credential is reduced to fields used by the provider, written exclusively to a mode-0600 runner-temporary file, and uploaded atomically with Worker code using `wrangler deploy --secrets-file`. It is never a Wrangler plain-text variable or build artifact and is removed by the always-running cleanup step.

Scheduled activation renders UTC cron `30 19 * * *`; manual-only or disabled activation renders an explicit empty cron array to remove an older schedule. The Worker also independently ignores scheduled events without `BACKUP_SCHEDULE_ENABLED=true`. Disabling backup leaves existing provider copies/catalog intact; it does not erase cloud credentials, buckets or backup objects.

Live acceptance must select a successful manual event through the normal Super Admin interface, verify R2 and GCS copies have the same manifest/data bytes and event identifier, record a bounded same-event GCS retry after a controlled GCS failure, and complete recovery in a separately migrated empty D1 target. Only then enable the schedule and verify actual scheduled catalog/audit events and retention. Existing CI uses ephemeral D1/R2 and simulated GCS and cannot substitute for this acceptance. Do not reuse another application's backup bucket, payload reader or broad service-account credential.

This deployment workflow consumes existing resources; it does not create buckets, service accounts, IAM grants, billing configuration or production infrastructure. Resource names, credentials, object contents and business backup exports must stay in protected operational records rather than Public Git/Actions artifacts.


### Development backup: manual setup and handback

These instructions fill protected resources/settings outside Public Git. Their completion is not successful backup acceptance; deploy/readback/recovery results belong in `TODO.md`. CYACC's accepted topology is the reference for per-application isolation, not a source of shared bucket contents or credentials.

1. **Cloudflare R2:** in the account already hosting the CY Web development Worker, open R2 and create/confirm an application-owned private development bucket. Use a lowercase 3–63-character name accepted by the renderer. Keep public bucket access disabled. The deployment adds the `BACKUP_R2` binding automatically; no R2 S3 access key or manual Worker binding is needed.
2. **Google Cloud Storage:** use the existing approved Google Cloud project if suitable, but create/confirm a separate private CY Web development bucket. This deployment currently accepts lowercase 3–63-character names using letters, digits, hyphens or underscores, with alphanumeric ends. Use uniform bucket-level access and public access prevention. Leave automatic object expiration and locked retention policies unconfigured during acceptance; application retention must be tested first.
3. **Google service account:** create/confirm a dedicated CY Web development service account. In this bucket's Permissions, grant that account `Storage Object User` (`roles/storage.objectUser`) on this bucket only, covering create/read/list/delete for replication and retention. The runtime account does not need project-wide Storage Admin. In its Keys tab, choose Add key → Create new key → JSON. Keep the downloaded JSON private and use it only as the environment secret below.
4. **GitHub:** open `simonliu1118-byte/chihyuan-web` → Settings → Environments → existing `development` environment. Add/update these fields; preserve the existing Cloudflare/D1/Identity configuration and deployment protections.

| Location | Exact name | Value |
| --- | --- | --- |
| Environment variable | `CF_BACKUP_R2_BUCKET` | CY Web development R2 bucket name |
| Environment variable | `GCS_BUCKET` | CY Web development GCS bucket name |
| Environment variable | `CF_BACKUP_ENABLED` | `true` after the resources and secret are ready |
| Environment variable | `CF_BACKUP_SCHEDULE_ENABLED` | `false` throughout manual/recovery acceptance |
| Environment secret | `GCS_SERVICE_ACCOUNT_JSON` | Entire downloaded service-account JSON, preserving its contents; not a filename or only the private-key field |

Do not paste the JSON into chat, a Git commit, an Issue, a PR or an environment **variable**. Use GitHub's environment **secret**. Resource/settings changes alone do not deploy the Worker. Hand back only a non-sensitive completion message, for example “development 備份設定完成”; bucket names, project identifiers and JSON contents are not needed in the handback message.

The maintainer then runs the existing governed development deployment and checks the normal Super Admin backup UI, both provider readbacks, same-event retry and isolated empty-target recovery. Keep `CF_BACKUP_SCHEDULE_ENABLED=false` until those checks pass. Production resource setup/cutover and scheduled activation are later, separate steps.

Provider references (checked 2026-10-01):

- [Cloudflare: create R2 buckets](https://developers.cloudflare.com/r2/buckets/create-buckets/)
- [Google Cloud: Cloud Storage IAM roles](https://docs.cloud.google.com/storage/docs/access-control/iam-roles)
- [Google Cloud: create service-account JSON keys](https://docs.cloud.google.com/iam/docs/keys-create-delete)
- [GitHub: deployment environments, secrets and variables](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
