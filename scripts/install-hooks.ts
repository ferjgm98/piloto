#!/usr/bin/env bun
// Installs the tracked git hooks in `.githooks/` by setting
// `core.hooksPath` for the current repository. Works in the main checkout
// and in `git worktree` worktrees (simple-git-hooks does not — see
// https://github.com/toplenboren/simple-git-hooks/issues for the long story).
//
// Runs automatically from the `prepare` script on `bun install`.
// Safe to re-run; idempotent.

import { chmodSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";

const HOOKS_DIR = ".githooks";

async function main() {
  // Skip silently outside a git repo (e.g. fresh tarball install).
  try {
    await $`git rev-parse --is-inside-work-tree`.quiet();
  } catch {
    console.log("[install-hooks] not inside a git work tree — skipping");
    return;
  }

  if (!existsSync(HOOKS_DIR)) {
    console.log(`[install-hooks] ${HOOKS_DIR}/ not found — skipping`);
    return;
  }

  // Make every hook script executable. Git refuses to run non-executable hooks.
  for (const entry of readdirSync(HOOKS_DIR)) {
    const full = join(HOOKS_DIR, entry);
    if (!statSync(full).isFile()) continue;
    chmodSync(full, 0o755);
  }

  // Point git at the tracked hooks directory. We set both the per-repository
  // config AND the per-worktree config: when `extensions.worktreeConfig` is
  // enabled (as it is in Piloto's worktree setup), per-worktree settings
  // override the shared ones, so we must update both to keep behavior
  // consistent whether `bun install` runs in the main checkout or a worktree.
  await $`git config --local core.hooksPath ${HOOKS_DIR}`.quiet();

  const worktreeConfigEnabled = await $`git config --get extensions.worktreeConfig`
    .quiet()
    .nothrow();
  if (worktreeConfigEnabled.exitCode === 0) {
    await $`git config --worktree core.hooksPath ${HOOKS_DIR}`.quiet().nothrow();
  }

  console.log(`[install-hooks] core.hooksPath set to ${HOOKS_DIR}`);
}

await main();
