# CY Web Data View Foundation

> Status: reusable UI/interaction foundation before production business screens.

## Purpose

CY Web business modules must not each create their own search bar, loading/empty/error states, Desktop table, Mobile cards, selection behavior or pagination controls.

This foundation provides one shared interaction contract while keeping domain-specific columns, filters, API queries and actions inside each business module.

## Core rule

Business data remains in D1 and is queried through Worker APIs on demand.

The new system does **not** reproduce the Legacy GAS pattern of loading a whole module dataset into one browser-global object before that module can be used.

A data view should normally request only the current search/filter/page slice needed by the user.

## Shared components

### `DataViewToolbar`

Owns the consistent shell for:

- keyword search;
- module-provided filter controls;
- result summary;
- page-level data actions such as refresh or create.

It does not decide the business query or filter semantics.

### `DataView<T>`

Owns common presentation states:

- loading;
- error and retry;
- empty;
- ready data;
- optional row/card selection;
- Desktop table projection;
- Mobile card projection.

The module provides:

- immutable row key;
- Desktop columns;
- Mobile card renderer;
- selection behavior;
- domain-specific content.

Desktop and Mobile projections receive the same item collection and selection state. They are not separate business implementations.

### `DataPagination`

Provides a neutral previous/next navigation surface suitable for offset- or cursor-backed APIs.

The component does not assume page-number storage. Business/API layers may use cursors while showing a human-readable label when useful.

## Server-query boundary

The shared UI does not silently turn every list into a full client-side dataset.

For production business data, search/filter/sort/pagination should normally map to API query parameters, and the Worker/D1 query returns the requested slice.

Small static/configuration collections may be held client-side when appropriate, but that is an explicit choice rather than the system default.

## Responsive boundary

Initial presentation rule:

- wider screens: semantic table where tabular comparison is useful;
- narrow screens: card/list projection optimized for touch and limited width.

The exact breakpoint and final visual styling remain UI/UX decisions. The important architecture rule is that both views share one domain/query state.

## Selection and accessibility

Selectable rows/cards expose keyboard activation in addition to pointer/touch activation.

Tables retain real table semantics. Search controls carry accessible labels. Loading/error/empty states remain understandable without relying only on color.

Business screens must not remove keyboard access when composing these shared components.

## Refresh behavior

A manual refresh action may be exposed where useful, but the old GAS-style blocking “資料已更新／重新整理” workflow is not part of this foundation.

After mutations, business screens should update from the mutation result or revalidate the affected query. Relevant views may also revalidate on navigation/focus according to the request/data layer policy.

## Non-goals

This foundation does not yet define:

- Customer/Item/Order-specific columns;
- production query endpoints;
- saved filter presets;
- final density/branding;
- virtual scrolling;
- bulk actions;
- advanced column customization.

Those should be added only when real business requirements justify them.
