# CY Web App Shell Foundation

> Current authenticated operational shell; final visual dimensions remain subject to UI/UX acceptance.

## Shared responsibilities

One `AppShell` owns the brand, navigation, active module, account controls, main-content boundary and responsive framing. Modules provide domain content and actions; Desktop/Tablet/Mobile share the navigation model and permission semantics.

Navigation items carry a stable key, label and href. The runtime filters business items through Employee Module Access and administrative items through existing Role rules. Identity and CY Programs remain available to valid sessions without business Module Access. The shell is presentation; it does not grant access.

## Module switching

`onNavigate` delegates ordinary same-tab activation to the runtime's guarded hash transition. Modified clicks retain native new-tab behavior; disabled items cannot activate. The skip link only focuses main content and never changes the module hash.

The active editor remains mounted while the shared switch dialog asks once:

- **確定切換**: discard unsaved local edits and enter the selected module.
- **放棄切換，繼續編輯**: remain in the original module with the fields intact.

There is no mandatory save, automatic save, extra recovery draft or second discard prompt. Hash/Back cancellation replaces the current address without adding a history entry. Repeated attempts do not create another pending transition. Permission enforcement invalidates pending navigation and returns to Identity independently of discard consent.

`useUnsavedChangesGuard` registers editor/busy state with `UnsavedChangesBoundary`; the existing shared `ConfirmDialog` renders the decision. Navigation does not duplicate business state or API authority. See `OVERLAY_FEEDBACK_FOUNDATION.md` for form cancellation and busy behavior.

A destination business page mounts after its own module-access check, avoiding an initial mount authorized by the previous module's result.

## Visual and acceptance boundary

Shared layout/styles remain one codebase; no separate device router is introduced. Desktop browser checks and automated transition tests do not substitute for real Tablet/Mobile and multi-role acceptance. Current progress and remaining tests live only in root `TODO.md`.
