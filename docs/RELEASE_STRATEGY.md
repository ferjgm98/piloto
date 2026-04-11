# Piloto — release strategy

This document defines how Piloto gets from the current bootstrap state to the
first external release without waiting for the entire original product vision
to land.

## Summary

Piloto ships on a staged release ladder:

- **R0: Dev Preview** keeps `main` continuously releasable for the founder
- **R1: Trusted Alpha** is the first installable build for a small invited set
- **R2: Public Alpha** opens access after the core workflow proves reliable
- **R3: Beta** broadens support toward the original long-term vision

The first real release is a **macOS-only trusted alpha**. It proves one
high-value workflow end to end:

1. Create a multi-repo workspace
2. Create linked worktrees across those repos
3. Run one supported agent backend in that workspace
4. Stream output in the app
5. Inspect resulting repo changes with external git/editor tooling

That release deliberately ships before embedded terminal, in-app diff review,
MCP, skills, and the full dual-backend promise are complete.

## Release ladder

### R0 — Dev Preview

Purpose: keep `main` releasable for internal iteration.

- Audience: founder only
- Channel: `bun run build:canary`
- Gate:
  - `bun run check` passes
  - app launches locally
- Outcome: continuous internal validation, not user-facing

### R1 — Trusted Alpha

Purpose: first installable build for a small invited group.

- Platform: macOS only
- Channel: canary builds promoted manually to an alpha artifact
- Supported backend: Claude Code first
- Success criterion: a tester can complete one cross-repo task end to end with
  one supported backend and review resulting repo changes outside Piloto if
  needed

Required slice:

- `PIL-18` Workspace CRUD and persistence
- `PIL-19` Multi-repo worktree lifecycle
- `PIL-21` Agent abstraction and Claude integration
- `PIL-23` Agent output streaming
- `PIL-31` Test infrastructure and foundational coverage
- Minimal release hygiene from `PIL-29` and `PIL-30`

Stretch, but not blocking:

- `PIL-20` Worktree status dashboard

Explicitly deferred from trusted alpha:

- Embedded terminal: `PIL-24`, `PIL-8`
- In-app diff review and merge: `PIL-25`, `PIL-26`, `PIL-32`, `PIL-9`
- MCP and skills: `PIL-27`, `PIL-28`, `PIL-10`
- Most post-MVP work

### R2 — Public Alpha

Purpose: open Piloto to a broader external audience.

Before promotion:

- Add a second backend or clearly label it experimental
- Strengthen onboarding and settings
- Improve packaging and release documentation
- Add at least a minimal in-app review path if external testers need it
- Harden macOS distribution enough for broader installability

Gate:

- At least one full trusted-alpha dogfood cycle completes without
  release-blocking data-loss or worktree-corruption issues

### R3 — Beta

Purpose: broaden support toward the original product vision.

Expected additions:

- Robust parallel multi-agent behavior
- In-app diff accept/reject and merge flow
- Terminal integration
- Selected MCP and skills capabilities
- Platform reassessment for Linux after trusted alpha

Windows stays out until runtime behavior and packaging are stable.

## Release process

### Build policy

- Use `build:canary` continuously from `main`
- Promote specific canary builds manually after a release checklist pass
- Treat `build:stable` as a later-stage release path, not the default for the
  first external milestone

### Promotion checklist

Every promoted alpha build must have:

- Passing `bun run check`
- Install/run smoke test on macOS
- Workspace creation smoke test
- Multi-repo worktree creation smoke test
- Agent start/stop smoke test
- Known issues documented for testers

### Release blockers

These issues block promotion:

- Workspace corruption
- Incorrect worktree lifecycle behavior
- Agent process orphaning
- Loss of user changes
- App failing to start on target macOS environments

## Positioning

Trusted alpha should be described as:

> multi-repo workspace plus worktree orchestration with one supported agent backend

Do not position trusted alpha as the full dual-backend, terminal-integrated,
diff-managed, MCP-enabled Piloto vision yet. Keep the full thesis visible, but
mark those capabilities as upcoming milestones.

## Test scenarios

Use scenario-based gates in addition to code checks.

1. Create a workspace with two repos, reopen the app, and verify persistence.
2. Create one linked worktree set across those repos, then list and delete it
   safely.
3. Launch the supported agent backend, stream output, stop it cleanly, and
   confirm no orphan processes remain.
4. Make the agent produce changes in more than one repo and verify the user can
   find and review those changes without data loss.
5. Install the promoted alpha artifact on a clean macOS machine and complete
   the same flow from scratch.
6. Run the regression pass for every promoted alpha using the `PIL-31` test
   baseline plus `bun run check`.
