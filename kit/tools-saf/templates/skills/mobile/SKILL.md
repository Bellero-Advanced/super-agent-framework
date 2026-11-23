---
name: mobile
description: Mobile app work — device and OS matrix, touch targets, offline and slow networks, permissions, app lifecycle, store builds. Use when building or testing a mobile screen or feature.
---

# Mobile

## Design for the device

- touch targets ≥ 44×44 pt (iOS) / 48×48 dp (Android) · safe areas and notches respected · one-handed reach for primary actions
- respect system settings: dark mode, text size (up to the largest accessibility size), reduced motion
- keyboard does not cover the focused input; the back gesture/button does the expected thing

## Network and lifecycle

- every screen works on a slow network and shows a useful offline state; writes queue or fail clearly — never silently
- the app survives background → foreground, process death and rotation without losing user input
- no work on the UI thread that can block (disk, network, heavy parsing)

## Permissions and privacy

- ask for a permission at the moment it is needed, with a reason; handle "denied" and "denied forever" with a way forward
- no personal data in logs; secrets never in the app bundle — the server holds them

## Test matrix

Name the matrix in the card: the oldest supported OS + the newest, one small and one large screen, at least one real device
for anything touching camera, location, notifications, payments or performance. Simulator-only results are labelled as such.

## Release

- version and build numbers bumped · release notes · store screenshots per language
- store builds, signing and submissions happen only on the owner's order
