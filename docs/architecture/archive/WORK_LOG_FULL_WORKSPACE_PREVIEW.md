# CY Web WorkLog Full Workspace Preview

> Status: browser-local functional review surface.
>
> The preview is intentionally neutral and configurable. It does not contain Chihyuan production WorkLog categories, platforms, score values or thresholds.

## 1. Review goal

The preview combines the full first WorkLog lifecycle so it can be tested later together with Customer, Item, Sales Work Order and Outsourcing:

- create/edit draft;
- required Work Days;
- configurable categories/platforms;
- submit review;
- owner withdraw;
- reviewer scoring;
- reviewer correction of Work Days;
- cancel review;
- finalized-score statistics;
- configuration/public-source boundary visibility.

Visual polish is deliberately secondary to flow correctness.

## 2. Owner workflow

```text
created
  -> 送出審核
pending_review
  -> 撤回審核
created
```

Only the owner may ordinarily edit a `created` WorkLog. The preview includes a simple owner/all filter to illustrate the future authorization boundary; production server authorization remains authoritative.

Long edit mode keeps Cancel/Save controls at both the top and bottom, matching the accepted long-form interaction rule from the earlier Customer review.

## 3. Review workflow

Pending WorkLogs appear in a reviewer queue. Review input includes:

- Work Days correction;
- per-entry score;
- per-entry remark;
- overall review remark.

Saving review moves the WorkLog to `reviewed` and freezes the current result. Later configuration changes do not alter that stored finalized score.

## 4. Cancel review

The preview exposes:

```text
reviewed
  -> 取消審核
pending_review
```

It clears the active reviewer/result and per-entry review fields. The production service records structured Audit for this transition but deliberately does not keep a second cancelled-review version payload, per BD-051.

## 5. Work Days

Work Days is independently entered and must be greater than zero. Date interval does not auto-calculate Work Days.

The reviewer can correct Work Days during review; the production service records old/new Work Days in the review Audit event when changed.

## 6. Statistics

The preview shows stored reviewed results only. The aggregate average is weighted by Work Days:

```text
sum(final score) / sum(work days)
```

It does not rerun current score configuration against old reviewed content.

## 7. Configuration boundary

The `設定參考` tab intentionally uses neutral labels such as `示範項目` and `示範平台`.

Production configuration is deployment-specific D1 data maintained by authorized administration. Public source provides generic schemas/validation/UI mechanics only.

## 8. Preview simplifications

The browser-local preview simplifies:

- Identity/role resolution;
- server optimistic revision conflicts;
- reference generation;
- exact scaled4 implementation in the browser demo;
- shared Audit persistence;
- full Settings/Admin mutation UI.

The Worker foundation remains authoritative for these concerns.

## 9. Runtime boundary

The preview:

- uses fictional browser-memory data only;
- resets on refresh;
- does not call D1;
- does not bypass Shared Identity;
- does not contain production WorkLog configuration;
- does not change production Worker/DNS/backup resources.
