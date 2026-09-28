# CY Web App Shell Foundation

> Status: structural implementation baseline before production business screens.
>
> This document defines reusable application-shell responsibilities. It does not freeze the final visual design.

## 1. Purpose

CY Web uses one shared application shell around all authenticated business modules. The shell exists to prevent each module from recreating navigation, top-level layout, status/feedback areas, responsive framing and common account/context controls.

The shell is part of the new Web architecture. It is not a recreation of the Legacy GAS menu/header.

## 2. Shared responsibilities

The App Shell owns:

- application identity/brand area;
- primary module navigation;
- active-module indication;
- responsive navigation presentation;
- a consistent main-content boundary;
- optional top-level account/workspace/status actions;
- common skip-link/focus structure;
- global feedback/notice mounting points;
- layout adaptation for Desktop/Tablet/Mobile.

Business modules provide their page content and domain actions. They do not create their own independent application frame.

## 3. Navigation contract

Navigation items are data/configuration, not hard-coded page-specific markup.

Each item has a stable key, user-facing label and route target. Visibility/availability will later be filtered through the shared Identity/app-module authorization boundary.

The initial shell does not implement the final production router or permission provider. It exposes a small navigation model so those dependencies can be connected without redesigning the shell.

## 4. Responsive behavior

One navigation model and one page tree serve all viewport sizes.

- Desktop may present persistent side navigation.
- Narrow layouts may collapse the same navigation into a temporary panel/drawer pattern.
- Business pages remain responsible for their own task-specific Adaptive UI inside the shell.

Responsive changes must not create separate Desktop and Mobile business implementations.

## 5. Visual boundary

Current CSS variables and layout styling are provisional foundation tokens only. They exist to exercise spacing, focus, responsive behavior and component states during development.

Before production UI acceptance, a dedicated UI/UX review may change:

- brand colors;
- type scale;
- spacing/radius/shadow tokens;
- navigation density and composition;
- iconography;
- header/sidebar proportions;
- visual hierarchy.

A visual change must not require business modules to fork or rewrite shared shell logic.

## 6. First implementation scope

The initial implementation provides:

- `AppShell` structural component;
- data-driven `NavigationItem` model;
- reusable `Button`, `StatusChip`, `Notice` and `Section` primitives;
- responsive shell CSS using shared foundation variables;
- current health-check diagnostic rendered inside the shell so the shared frame is exercised without inventing a production business screen.

## 7. Explicit non-goals

This phase does not implement:

- final CY Web visual design;
- final menu hierarchy;
- production routing;
- production authentication/session UX;
- Customer/Order/Item/WorkLog business screens;
- GAS-derived screen layouts.
