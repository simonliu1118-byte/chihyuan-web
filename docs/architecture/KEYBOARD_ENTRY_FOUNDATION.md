# CY Web Keyboard Data-entry Foundation

> Status: focused reusable behavior before production business forms.

## Purpose

Legacy office workflows proved that keyboard-efficient data entry is useful, including deliberate Enter-to-next-field behavior in some forms.

CY Web keeps that useful behavior without recreating page-specific document-level key handlers.

## Opt-in rule

Enter progression is **opt-in**, not a global browser override.

A form/container may attach `advanceFocusOnEnter` to its `onKeyDown` handler, and only controls explicitly marked with:

```text
data-enter-advance="true"
```

participate in the progression order.

This keeps ordinary Web/browser keyboard behavior intact unless a real data-entry workflow benefits from Enter progression.

## Safety rules

The shared helper does not consume Enter when:

- another component already prevented the event;
- Shift/Ctrl/Alt/Meta is held;
- IME composition is active;
- the control is a textarea, button, link or select;
- the target is a combobox;
- the target currently exposes an expanded popup;
- the target was not explicitly opted in.

This is important for EntityPicker/autocomplete, multi-line notes and native controls whose Enter key already has a meaningful function.

## Progression order

Progression follows the explicit DOM order of enabled, visible controls marked `data-enter-advance="true"` inside the current event container.

The helper does not invent a separate numeric field-order map. Business forms should use sensible DOM/Tab order first; Enter progression supplements that order.

At the final eligible field, Enter is left untouched rather than implicitly submitting or jumping somewhere unexpected. A workflow that wants an explicit final action should define that action separately.

## Scope

Use Enter progression for high-frequency structured office input where it is proven useful.

Do not add it merely because the Legacy GAS page had a key handler. Final usage is decided per workflow during the real UI/UX implementation.

## Accessibility

Tab remains the standard universal navigation mechanism. Enter progression is an additional productivity behavior, not a replacement for accessible Tab order or visible focus.

Shared focus styling and component-specific keyboard semantics remain authoritative.

## Data-entry forms (0.9.2, user decision 2026-10-18)

The user asked that Enter must not save a record directly but move to the next field. Record editors therefore attach the form-wide helper instead of opting in field by field:

- `enterAdvancesFields` (customer, item, defect, sales order, outsourcing, work log, settings, identity create/register/policy forms): Enter moves through the form's visible, enabled, editable fields in DOM order; after the last field it moves focus to the save button, and Enter on that button saves.
- `enterAdvancesThenSubmits` (short dialogs: reason prompts, ERP customer number, password, email and OTP forms): the same walk, but Enter on the last field submits.
- Both: textareas keep Enter for new lines; buttons keep their native Enter; an open autocomplete list keeps Enter for picking a result (and never submits the form); Ctrl/⌘+Enter saves from any field; IME composition is ignored.
- Query forms (ERP 查詢, 稽核紀錄 filters) keep Enter = run the query.

The field-by-field `advanceFocusOnEnter` opt-in remains for the sign-in form.
