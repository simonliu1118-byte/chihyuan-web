# CY Web → Shared Identity Provider Requirements

> Purpose: handoff contract for the Identity/CYInvoice workstream. This file does not authorize CY Web to modify CYInvoice source/runtime.

## Required provider outcome

CY Web already has a provider-neutral Identity adapter boundary. The remaining external dependency is a browser-safe Shared Identity contract that can authenticate a CY Web user and let the CY Web Worker resolve the current principal on later requests.

The provider must remain the authority for credentials, shared account role and workspace membership. CY Web must not receive or persist password verifiers.

## Minimum principal returned to CY Web

The provider contract must let CY Web normalize:

```text
employeeId   stable shared employee identity
employeeNo   employee number, nullable only if the shared authority permits it
name         display name
role         EMPLOYEE | ADMIN | SUPER_ADMIN
workspaceId  current workspace identity when applicable
```

The transport may evolve, but these semantics need to remain stable behind the CY Web adapter.

## CY Web application access policy

The shared provider must recognize CY Web as its own application audience/scope.

Unlike the currently inspected CYAccountingWeb web-auth policy, CY Web must be able to authenticate ordinary `EMPLOYEE` users as well as `ADMIN` and `SUPER_ADMIN` users.

CY Web then applies its own app-tag/module mapping for ordinary employees. The shared provider must not encode CY Web tags such as sales/staff/warehouse/designer as shared global roles.

## Browser-session capability

A successful credential check alone is not sufficient for CY Web. The provider must support a browser-safe session lifecycle so later protected requests can be resolved without asking for the password again on every normal page/API request.

Required capabilities:

- establish an authenticated CY Web browser session after login;
- resolve the current session to the current Employee identity and shared role;
- reject disabled/invalid/revoked sessions;
- terminate/logout the session;
- avoid exposing provider credential verifiers or internal secrets to the browser;
- preserve server-side rate/abuse protection for login and other sensitive authentication actions.

The exact mechanism may be an HttpOnly session cookie, signed short-lived token, service-to-service session lookup or another reviewed design. CY Web depends on the semantics, not on a CYInvoice-specific transport shape.

## Error classes CY Web needs to distinguish

The provider should make it possible for the adapter to distinguish at least:

- unauthenticated / missing session;
- invalid or revoked authentication;
- application access denied at the shared-provider level;
- provider temporarily unavailable.

CY Web normalizes these to its own stable API errors.

## Current observed gap

On the inspected `cyinvoice/cloud-onboarding-first-device` branch, `cloud/src/web-auth.ts` currently:

- contains an application policy for `CYAccountingWeb` only;
- restricts that application to `ADMIN` / `SUPER_ADMIN`;
- verifies Employee No + Password and returns an authenticated employee result;
- does not establish the CY Web browser-session contract described above.

That implementation should be treated as reusable authority evidence, not copied into CY Web.

## Explicit non-goals

- Do not move CY Web app tags into Shared Identity.
- Do not create a duplicate CY Web credential store.
- Do not require CY Web business modules to know CYInvoice endpoint names.
- Do not expose production endpoint/resource identifiers in Public source.
- Do not couple this requirement to CYAccountingWeb runtime.

## Acceptance gate for CY Web

CY Web can wire the concrete provider adapter when all of the following are available in a non-production test environment:

1. CY Web application audience/scope is recognized.
2. EMPLOYEE / ADMIN / SUPER_ADMIN identities can be authenticated according to shared authority.
3. Browser session can be established and later resolved server-side.
4. Disabled/revoked identity/session behavior is testable.
5. CY Web receives stable principal fields without receiving credential material.
6. Logout/revocation path is testable.

After that gate, CY Web can implement its first authenticated business API without changing the business-module authorization model.
