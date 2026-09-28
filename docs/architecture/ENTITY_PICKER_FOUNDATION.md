# CY Web Entity Picker Foundation

> Status: reusable interaction foundation before production business screens.

## Purpose

Customer, Item and other relationship lookups must not each implement their own autocomplete/search dropdown.

`EntityPicker<T>` provides one asynchronous lookup interaction while domain adapters remain responsible for the actual API and display semantics.

## Shared behavior

The shared picker owns:

- controlled selected entity;
- text query input;
- configurable debounce;
- cancellation of stale searches with `AbortController`;
- loading / no-result / error states;
- keyboard navigation with Arrow Up/Down, Enter and Escape;
- pointer/touch selection;
- outside-click dismissal;
- clear-selection behavior;
- accessible combobox/listbox semantics;
- standard field label/help/error presentation through `FieldFrame`.

## Domain adapter responsibility

A Customer, Item, Contractor or other module supplies:

- `search(query, signal)`;
- immutable entity key;
- primary display label;
- optional secondary description;
- selected value handling;
- domain/API permission rules.

The generic picker must not know Customer or Item business fields.

## D1/API boundary

Entity lookup is an on-demand query pattern.

For production business data the picker should normally call a bounded Worker search endpoint rather than receiving the full master table in advance.

Example direction:

```text
user types keyword
→ debounce
→ GET/POST application search API
→ Worker performs indexed D1 lookup
→ bounded result list
→ user explicitly selects one entity
→ relationship stores immutable internal ID
```

This is deliberately different from the Legacy GAS approach where broad datasets were commonly preloaded into the browser.

## Selection semantics

Typing text is not the same as selecting an entity.

When a user edits the visible text of an already-selected entity, the picker clears the controlled selected entity before continuing the search. The typed text is only a search query; it is not a valid relationship until the user explicitly selects a result.

If the picker is dismissed without a new selection, unresolved query text is discarded. Business validation can therefore treat `value === null` as “no valid entity selected” even when the user had typed search text.

This prevents both failure modes:

- free-typed text silently becoming a foreign-key relationship; and
- an old selected internal ID remaining hidden behind newly typed text.

Where a business workflow intentionally allows free-text entry, that workflow should use a separate explicit free-text field/mode rather than weakening the generic entity picker.

## Search safety and cost

- debounce defaults to 250 ms;
- stale in-flight requests are aborted;
- modules should return bounded result sets;
- searches should use appropriate D1 indexes once concrete endpoints are implemented;
- do not issue high-frequency background polling from entity pickers;
- do not cache sensitive business lookup results indefinitely in global browser state.

## Accessibility

The picker uses combobox/listbox/option semantics and supports keyboard interaction.

Business screens must preserve the shared label, focus and keyboard behavior rather than wrapping the picker in page-specific key handlers.

## Visual design

Current CSS is provisional foundation styling only. Final size, density, color, popup treatment and Mobile presentation remain part of the dedicated UI/UX review.

The interaction contract is reusable even if its final visual treatment changes.
