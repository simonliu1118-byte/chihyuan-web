# CY Web Business Decisions

> Project: Chihyuan Enterprise Management System (CY Web)
>
> Purpose: record user-confirmed business semantics while the Legacy audit / canonical model is still under review.
>
> This is an architecture decision log, not a governance rules source. Confirmed decisions here supersede matching `OPEN` notes in draft architecture documents until those drafts are consolidated.

## BD-001 — Customer internal identity and customer number lifecycle

**Status:** CONFIRMED

### Business rule

A customer/prospect may be created before a formal customer number exists.

Typical flow:

1. A salesperson visits a prospective customer.
2. The system records the customer name and visit history even though no customer number has been assigned yet.
3. When the customer first reaches a real quotation or order, a customer number is assigned.
4. Once assigned, the customer number is permanent and cannot be changed.

This is the business reason the Legacy system needed a hidden `custId`: visits and other pre-commercial records needed a stable relationship key before `custNo` existed.

### Canonical CY Web treatment

`customers.id`

- exists immediately when the customer/prospect record is created;
- is the immutable internal primary key used by every relation;
- is never dependent on whether a customer number exists;
- replaces the semantic purpose of Legacy hidden `custId`.

`customers.customer_no`

- is nullable before the first real quotation/order;
- must be unique when present;
- is assigned when the customer first enters the quotation or ordering flow;
- becomes immutable immediately after assignment;
- is a user-facing business identifier, not a database relationship key.

### Workflow implications

- Customer visits may be created while `customer_no IS NULL`.
- Visits always reference `customer_id`, never `customer_no` or customer name.
- Creating/saving the first real quotation requires the customer to receive a customer number.
- Creating/saving the first real order requires the customer to receive a customer number.
- Quotes and orders still reference `customer_id`; they do not use `customer_no` as their foreign key.
- A later customer-number assignment does not require rewriting earlier visit relationships because those records already point to the immutable internal ID.

### Database implication

The intended constraint is effectively:

```text
customers.id            NOT NULL, immutable primary key
customers.customer_no   NULL before qualification; UNIQUE when present; immutable once assigned
```

Cloudflare D1/SQLite can support multiple unnumbered rows while enforcing uniqueness for non-null customer numbers.

### Migration implication

Legacy `custId` and `custNo` must remain distinct during migration:

- `custId` is a Legacy internal relationship/migration key;
- `custNo` is the business customer number and may be blank for visit-only prospects;
- the importer must not manufacture a customer number merely because a Legacy customer row exists.

### Deliberately still open

This decision does **not** yet define:

- the exact customer-number format;
- whether number assignment is automatic, manually entered, or system-suggested then confirmed;
- the sequence/allocation rule and concurrency behavior.

Those are separate numbering-policy decisions.
