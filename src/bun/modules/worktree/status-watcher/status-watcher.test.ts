import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorktreeStatus } from "../worktree.types";
import { createStatusWatcher } from "./status-watcher.service";
import type { StatusWatcher, StatusWatcherEvent } from "./status-watcher.types";

const FIXED_STATUS: WorktreeStatus = {
  hasChanges: false,
  changedFiles: 0,
  branchName: "main",
  ahead: 0,
  behind: 0,
  lastFetch: null,
};

function fakeComputeStatus(): Promise<WorktreeStatus> {
  return Promise.resolve(FIXED_STATUS);
}

async function flushTimers(ms = 50): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

describe("status-watcher (unit)", () => {
  let watcher: StatusWatcher;

  afterEach(async () => {
    await watcher?.shutdown();
  });

  test("startWatching is idempotent", () => {
    const tmp = mkdtempSync(join(tmpdir(), "sw-idempotent-"));
    try {
      watcher = createStatusWatcher({ computeStatus: fakeComputeStatus });
      watcher.startWatching("wt-1", tmp);
      watcher.startWatching("wt-1", tmp);
      watcher.startWatching("wt-1", tmp);
      expect(watcher.has("wt-1")).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("notify pushes to all subscribers and unsubscribe stops delivery", () => {
    watcher = createStatusWatcher({ computeStatus: fakeComputeStatus });
    const a: StatusWatcherEvent[] = [];
    const b: StatusWatcherEvent[] = [];
    const unsubA = watcher.subscribe((e) => a.push(e));
    watcher.subscribe((e) => b.push(e));

    watcher.notify("wt-1", FIXED_STATUS);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);

    unsubA();
    watcher.notify("wt-1", FIXED_STATUS);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(2);
  });

  test("a subscriber that throws does not break siblings", () => {
    watcher = createStatusWatcher({ computeStatus: fakeComputeStatus });
    const events: StatusWatcherEvent[] = [];
    watcher.subscribe(() => {
      throw new Error("boom");
    });
    watcher.subscribe((e) => events.push(e));
    watcher.notify("wt-1", FIXED_STATUS);
    expect(events).toHaveLength(1);
  });

  test("shouldIgnore filters fs events; bursts collapse to one emit", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sw-debounce-"));
    try {
      let computes = 0;
      watcher = createStatusWatcher({
        computeStatus: async () => {
          computes += 1;
          return FIXED_STATUS;
        },
        debounceMs: 30,
        shouldIgnore: (_root, p) => p.includes("/ignored"),
      });

      const events: StatusWatcherEvent[] = [];
      watcher.subscribe((e) => events.push(e));
      watcher.startWatching("wt-burst", tmp);

      mkdirSync(join(tmp, "ignored"), { recursive: true });
      writeFileSync(join(tmp, "ignored", "a.txt"), "x");
      await flushTimers(120);
      expect(computes).toBe(0);
      expect(events).toHaveLength(0);

      writeFileSync(join(tmp, "a.txt"), "1");
      writeFileSync(join(tmp, "b.txt"), "2");
      writeFileSync(join(tmp, "c.txt"), "3");
      await flushTimers(120);
      expect(computes).toBe(1);
      expect(events).toHaveLength(1);
      expect(events[0]?.worktreeId).toBe("wt-burst");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("stopWatching cancels in-flight debounce and removes the entry", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sw-stop-"));
    try {
      let computes = 0;
      watcher = createStatusWatcher({
        computeStatus: async () => {
          computes += 1;
          return FIXED_STATUS;
        },
        debounceMs: 50,
      });

      const events: StatusWatcherEvent[] = [];
      watcher.subscribe((e) => events.push(e));
      watcher.startWatching("wt-stop", tmp);

      writeFileSync(join(tmp, "a.txt"), "1");
      await watcher.stopWatching("wt-stop");
      expect(watcher.has("wt-stop")).toBe(false);

      await flushTimers(120);
      expect(computes).toBe(0);
      expect(events).toHaveLength(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("shutdown tears down all entries and clears subscribers", async () => {
    const tmpA = mkdtempSync(join(tmpdir(), "sw-shutdown-a-"));
    const tmpB = mkdtempSync(join(tmpdir(), "sw-shutdown-b-"));
    try {
      watcher = createStatusWatcher({ computeStatus: fakeComputeStatus });
      const events: StatusWatcherEvent[] = [];
      watcher.subscribe((e) => events.push(e));
      watcher.startWatching("a", tmpA);
      watcher.startWatching("b", tmpB);

      await watcher.shutdown();
      expect(watcher.has("a")).toBe(false);
      expect(watcher.has("b")).toBe(false);

      watcher.notify("a", FIXED_STATUS);
      expect(events).toHaveLength(0);
    } finally {
      rmSync(tmpA, { recursive: true, force: true });
      rmSync(tmpB, { recursive: true, force: true });
    }
  });

  test("stopWatching is idempotent on unknown id", async () => {
    watcher = createStatusWatcher({ computeStatus: fakeComputeStatus });
    await watcher.stopWatching("never-started");
    expect(watcher.has("never-started")).toBe(false);
  });
});
