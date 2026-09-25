# Chihyuan Enterprise Management System

**CY Web** — 志遠企業管理系統的新一代全 Web 專案。

This repository is **Public, source-visible proprietary**. Source may be read, but open-source use/modification/distribution rights are not granted; see `LICENSE`.

## Product direction

- One Web application for Desktop / Tablet / Mobile.
- RWD is the shared layout foundation; Mobile uses Adaptive UI rather than a scaled-down Desktop screen.
- SMART ERP remains the primary ERP. CY Web complements it for Web/mobile field work, extension data, and cross-module workflows.
- Target application platform: Cloudflare; D1 is the live relational database direction.
- Shared account/identity capability is reused through an adapter/service boundary; the medium-term direction is CYCloud Identity.
- Chihyuan production off-site backup uses GCS behind a provider-neutral backup contract; production infrastructure identifiers and credentials stay outside Public Git.

## Legacy status

The complete GAS / Google Sheets prototype and its Git history remain in Private `chihyuan-legacy-private`; they are not mirrored into this Public repository.

The prototype has **not** entered production use. Existing Legacy rows are development/test data and are not migrated into production CY Web. Legacy source remains useful as behavior/workflow reference only (BD-047).

Production CY Web starts from a clean canonical D1 schema.

## Current engineering direction

This section is engineering planning and does not replace `PROJECT_RULES.md`:

- Frontend: TypeScript + React + Vite.
- Backend: TypeScript + Cloudflare Workers.
- Database: Cloudflare D1.
- Static delivery: Cloudflare Workers Static Assets.
- Contract/validation: shared TypeScript schema with authoritative server-side validation.

## Architecture documentation

Start with:

1. `docs/architecture/README.md` — document map and current architecture baseline.
2. `docs/architecture/decisions/README.md` — Business Decision index and supersession map.
3. `docs/architecture/CANONICAL_DATA_MODEL.md` — current working logical model.
4. `TODO.md` — current implementation sequence.

Pre-consolidation architecture/audit documents are preserved under `docs/architecture/archive/` for historical traceability only.

## Governance

Before changing the project, read in order:

1. `REPOSITORY_RULES.md`
2. `REPO_POLICY.md`
3. `PROJECT_RULES.md`
4. `docs/architecture/README.md`
5. `TODO.md` and relevant design/source documents

AITeam `main` is the canonical source for Common Rules and CY family shared visual assets. CY Web does not automatically use the Windows Desktop Visual Guide as its Web UI specification.
