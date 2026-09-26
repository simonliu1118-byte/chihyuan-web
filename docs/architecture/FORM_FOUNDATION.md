# CY Web Form / Unsaved-Change Foundation

> Status: reusable interaction foundation before business-module forms.
>
> This document defines shared behavior and semantic structure. It does not freeze final form visuals or business-specific field layouts.

## 1. Purpose

Legacy GAS pages repeatedly implemented their own labels, inputs, validation messages, edit-state rules and navigation-away prompts. CY Web centralizes those mechanics before Customer, Item, Order, Outsourcing or WorkLog forms are built.

## 2. Shared field primitives

The initial shared form layer provides:

- `FieldFrame` for label / required marker / description / error placement;
- `TextInput`;
- `TextArea`;
- `SelectField`;
- shared accessibility wiring (`label`, `aria-invalid`, `aria-describedby`);
- shared disabled / read-only / error presentation;
- shared responsive form-grid styling.

These components own generic field semantics only. Domain modules still define actual business fields, validation rules, options and workflow behavior.

## 3. Validation presentation

Server-side validation remains authoritative.

When the API returns field errors, business forms map those errors into the shared field primitives rather than inventing one-off red text, alerts or modal messages per page.

Client-side validation may improve immediate usability, but it must not replace Worker/domain validation.

## 4. Unsaved-change guard

Unsaved-change protection is a shared application behavior.

The initial hook provides:

- browser `beforeunload` protection when unsaved work exists;
- one reusable confirmation decision function for in-app navigation/close actions;
- no prompt when the editor is clean.

The production router/Drawer/Dialog integration will reuse this guard once routing and those primitives are connected.

The guard should be driven by shared record-editor state (`dirty` / `saving`) rather than independent page-local booleans.

## 5. Explicit non-goals

This phase does not define:

- Customer-specific field order;
- final typography/colors/control sizes;
- final Enter-key traversal policy for every business workflow;
- route implementation;
- business-specific validation;
- automatic saving.

Those are connected incrementally without forking the generic form foundation.
