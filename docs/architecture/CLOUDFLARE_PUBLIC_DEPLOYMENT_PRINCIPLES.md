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
