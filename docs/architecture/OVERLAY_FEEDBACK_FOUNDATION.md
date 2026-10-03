# CY Web Overlay / Feedback Foundation

> Status: reusable interaction foundation, adopted by Customer and WorkLog operational screens.

## Purpose

CY Web should not repeat the Legacy pattern where each page chooses its own `alert`, confirmation dialog, popup or inline status behavior.

This foundation separates routine feedback from interactions that genuinely require the user's attention.

## Feedback hierarchy

Default behavior:

- routine save/create/update success → non-blocking Toast;
- field validation failure → inline field error;
- section/page request failure → local recoverable error state;
- destructive or irreversible decision → `ConfirmDialog`;
- contextual secondary editing/details → Dialog, Drawer or Bottom Sheet as appropriate;
- high-risk administrative actions → the stronger flow required by the applicable Business Decision.

A successful ordinary save should not force the user to dismiss a modal.

## `Dialog`

The shared Dialog foundation uses the browser's native modal `<dialog>` behavior and provides one content structure for:

- `modal` — focused decision or contained task;
- `drawer` — contextual side detail/editing, especially on wider screens;
- `sheet` — bottom-aligned contextual interaction, useful on narrower/touch layouts.

The presentation may adapt during final UI/UX work without changing the business workflow contract.

Shared behavior includes:

- controlled open/close state;
- title/description/body/footer structure;
- Escape handling;
- restore focus to the connected invoking control on close/unmount, including nested confirmations;
- optional backdrop dismissal;
- explicit non-dismissible/busy mode;
- common close affordance.

Business modules own the actual decision, form and permission rules.

## `ConfirmDialog`

`ConfirmDialog` is the shared confirmation surface for ordinary destructive/irreversible actions.

It supports normal and danger confirmation tones and can lock dismissal while an action is in progress.

This generic component does **not** weaken stronger confirmed safeguards. For example, Backup/Restore remains governed by BD-044 and requires the approved Super Admin authorization and double-confirmation flow even if one step uses this shared dialog component.

`useConfirmation()` provides an asynchronous decision through the existing `ConfirmDialog`: only one decision is pending per mounted screen; cancellation, Escape and unmount resolve it as false. It does not execute the mutation. Callers send the existing protected API request only after confirmation.

Customer ERP-number editing and WorkLog review/withdraw/cancel-review use the existing `Dialog` with one form, captured record revision, busy dismissal lock and recoverable errors. Failed requests retain the form; successful requests close it after server confirmation. No separate modal renderer or business authority is introduced.

## Toast feedback

`useToastQueue()` + `ToastRegion` provide non-blocking transient feedback.

Typical use:

- 已儲存;
- 已新增;
- 已更新;
- 已完成一般非高風險動作;
- a recoverable background refresh warning when the user does not need to make an immediate decision.

Toasts have stable IDs, optional automatic timeout, manual dismissal and shared semantic tones.

Danger/error feedback that affects the current task must still be shown at the relevant field/section/page location when that context matters; Toast is not a replacement for actionable error detail.

## No GAS refresh modal

The old GAS-style blocking `資料已自動更新 / 重新整理` interaction is not part of CY Web.

Data freshness is handled through API mutation results and targeted revalidation. A modal is used only when the user must make a genuine decision, not simply because backend data changed.

## Unsaved-change integration

Drawer/Sheet/Dialog editors that can discard unsaved work must use the shared unsaved-change guard before closing.

`useUnsavedChangesGuard.confirmNavigationAsync()` accepts the shared confirmation callback; the synchronous entry remains available to existing callers. Customer/WorkLog draft cancellation and modified dialog closing use the asynchronous path. The browser before-unload safeguard remains native. This adoption does not yet guard all cross-module hash navigation.

The overlay itself does not invent a page-local dirty flag. It consumes the existing shared record-editor/list dirty state through the calling workflow.

## Adaptive presentation

The same business task may use a Drawer on Desktop and a Sheet/full-screen composition on Mobile when appropriate. That is an Adaptive UI decision, not a second implementation of the business workflow.

## Visual-design boundary

Current overlay and Toast CSS is provisional foundation styling only.

Final dimensions, animation, branding, density, responsive presentation and exact mobile treatment remain part of the dedicated UI/UX review. No GAS popup styling is copied.
