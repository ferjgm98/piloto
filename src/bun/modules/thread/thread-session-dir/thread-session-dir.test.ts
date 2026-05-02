import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { lstat, mkdir, mkdtemp, readlink, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cleanupThreadSessionDir,
  createThreadSessionDir,
  getThreadSessionDirPath,
} from "./thread-session-dir.service";

const cleanupIds: string[] = [];

afterEach(async () => {
  while (cleanupIds.length > 0) {
    const id = cleanupIds.pop();
    if (id) await cleanupThreadSessionDir(id).catch(() => {});
  }
});

function trackId(): string {
  const id = `test-${randomUUID()}`;
  cleanupIds.push(id);
  return id;
}

describe("thread-session-dir", () => {
  test("getThreadSessionDirPath ends in <id>", () => {
    const id = "abc";
    expect(getThreadSessionDirPath(id).endsWith(`/.piloto/threads/${id}`)).toBe(true);
  });

  test("createThreadSessionDir creates dir and symlinks", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "piloto-tsd-"));
    try {
      const wtA = join(tmp, "wt-a");
      const wtB = join(tmp, "wt-b");
      await mkdir(wtA);
      await mkdir(wtB);
      await writeFile(join(wtA, "marker.txt"), "A");

      const id = trackId();
      const dir = await createThreadSessionDir(id, [
        { alias: "alpha", worktreePath: wtA },
        { alias: "beta", worktreePath: wtB },
      ]);

      expect(dir).toBe(getThreadSessionDirPath(id));
      const dirStat = await stat(dir);
      expect(dirStat.isDirectory()).toBe(true);

      const aLink = await lstat(join(dir, "alpha"));
      expect(aLink.isSymbolicLink()).toBe(true);
      expect(await readlink(join(dir, "alpha"))).toBe(wtA);
      expect(await readlink(join(dir, "beta"))).toBe(wtB);

      const resolved = await stat(join(dir, "alpha", "marker.txt"));
      expect(resolved.isFile()).toBe(true);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test("cleanupThreadSessionDir removes the dir", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "piloto-tsd-"));
    try {
      const wt = join(tmp, "wt");
      await mkdir(wt);
      const id = trackId();
      await createThreadSessionDir(id, [{ alias: "only", worktreePath: wt }]);

      await cleanupThreadSessionDir(id);

      const dir = getThreadSessionDirPath(id);
      let exists = true;
      try {
        await stat(dir);
      } catch {
        exists = false;
      }
      expect(exists).toBe(false);

      const targetStat = await stat(wt);
      expect(targetStat.isDirectory()).toBe(true);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test("cleanupThreadSessionDir is idempotent", async () => {
    const id = `test-${randomUUID()}`;
    await cleanupThreadSessionDir(id);
    await cleanupThreadSessionDir(id);
  });
});
