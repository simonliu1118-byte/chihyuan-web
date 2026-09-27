# CY Web WorkLog Module Contract

> Status: staged domain/service foundation before protected HTTP wiring.
>
> Public source implements the generic configurable WorkLog capability. Chihyuan production category/platform/scoring values are runtime D1 configuration and are not source-code defaults.

## 1. Core lifecycle

The canonical WorkLog lifecycle remains:

```text
created
  -> submit review
pending_review
  -> review
reviewed
```

Owner-controlled reversal:

```text
pending_review
  -> withdraw review
created
```

Reviewer-controlled reversal:

```text
reviewed
  -> cancel review
pending_review
```

Workflow states are fixed application semantics; configurable WorkLog labels/categories/platforms are not workflow-state definitions.

## 2. Ownership and access

A newly created WorkLog belongs to the authenticated employee creating it. The browser does not choose an arbitrary technical employee identity for ordinary creation.

Initial ordinary permissions:

- owner may create and edit while `created`;
- owner may submit `created -> pending_review`;
- owner may withdraw `pending_review -> created`;
- authorized reviewer may review `pending_review -> reviewed`;
- authorized reviewer may cancel `reviewed -> pending_review`;
- owner or explicitly authorized administrator may hard-delete while still `created`;
- ordinary users see their own WorkLogs; cross-employee search/read requires a separate authorized capability.

Server authorization remains authoritative regardless of menu/button visibility.

## 3. Work days

`work_days` is required and must be greater than zero. It is stored as canonical scaled4 and is independent from `date_from/date_to`.

CY Web never derives or silently overwrites Work Days from the calendar-day count.

During review, the reviewer may correct Work Days. The review Audit event preserves the old/new Work Days when a correction occurs, and the corrected value is used for the finalized average-daily-score calculation.

## 4. Entries and configurable categories/platforms

WorkLog content is normalized into `work_log_entries` and `work_log_entry_categories`; the Legacy JSON content blob is not reproduced.

Each entry has:

- stable entry type code;
- optional content;
- optional configured platform;
- zero or more configured categories;
- category quantities where applicable;
- review remark / review score only after review activity.

A generic category has an Admin-configured `input_mode`:

- `boolean` — stored entry quantity is exactly 1;
- `quantity` — a positive scaled4 quantity is supplied.

Business logic does not infer behavior from Chihyuan-specific display names.

## 5. Public-source configuration boundary

Public source may contain generic configuration schemas, validation and UI mechanics. It must not seed Chihyuan's real production:

- category names;
- platform names;
- score values;
- target/minimum averages;
- descriptions/notes.

Those values are entered/maintained in the deployment environment by authorized administration.

The WorkLog service exposes configuration reads for entry/review UI. Final Admin mutation UI/service is completed with the Settings/Admin module rather than hard-coded into the WorkLog page.

## 6. Draft editing

Only `created` WorkLogs allow ordinary content editing.

Updating a created WorkLog replaces its current normalized entry/category projection transactionally and increments `revision`. Ordinary draft edits retain latest-modifier/time metadata and do not create field-by-field Audit history.

## 7. Submit / withdraw

`created -> pending_review` and `pending_review -> created` are explicit workflow actions and create Shared Audit events.

Submitting locks ordinary owner content editing until the owner explicitly withdraws the review request.

## 8. Review

Review is an explicit authorized action over a `pending_review` WorkLog.

Reviewer input includes:

- optionally corrected Work Days;
- optional per-entry review remark;
- optional per-entry score;
- optional overall review remark.

Blank entry score is treated as no entered score and contributes zero to the total, matching the proven Legacy review behavior without inventing automatic score assignment.

Final score is the sum of entered per-entry scores. `average_daily_score` is:

```text
final_score / work_days
```

Both are stored at scaled4 precision. Average division uses deterministic nearest-scaled4 rounding (half away from zero) because an arbitrary ratio may not be exactly representable at four decimals. This is a score representation rule, not a SMART ERP monetary rounding rule.

The review transition stores:

- reviewer;
- review timestamp;
- overall remark;
- finalized final score;
- finalized average daily score;
- per-entry review remarks/scores;
- structured review Audit.

Per BD-012, later scoring-configuration changes do not recalculate the active finalized result.

## 9. Cancel review

Per BD-051, cancel review is a controlled action:

```text
reviewed -> pending_review
```

It clears the currently effective:

- reviewer/timestamp;
- overall review remark;
- finalized score/average;
- per-entry review remarks/scores.

The cancellation itself creates structured Shared Audit with the status transition. The cancelled score payload does not require a second review-version history table or full score snapshot.

A later re-review creates the new current finalized result.

## 10. Statistics

Historical statistics read the stored finalized WorkLog results only. They do not recalculate old reviewed WorkLogs from current scoring configuration.

The initial statistics contract returns:

- reviewed WorkLog count;
- total Work Days;
- total finalized score;
- weighted average daily score (`sum(final score) / sum(work days)`);
- bounded per-WorkLog time-series points.

Ordinary users are limited to their own statistics unless cross-employee reporting permission is granted.

## 11. Generated reference

`work_log_ref` is produced through a server-side reference-provider boundary. The final display format remains intentionally unfrozen in Public source.

Legacy readable-ID formatting is not a relational identity contract.

## 12. Runtime gate

Protected WorkLog HTTP routes remain blocked on the existing gates:

- Shared Identity browser-session provider;
- app/module permission mapping;
- local/dev D1 migration acceptance;
- Worker typecheck/build/smoke acceptance.

No production D1/Worker/DNS/backup resource is changed by this foundation.
