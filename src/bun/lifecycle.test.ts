import { afterEach, describe, expect, test } from "bun:test";
import { _resetShutdownStateForTests, shutdown } from "./lifecycle";

afterEach(() => {
  _resetShutdownStateForTests();
});

describe("shutdown", () => {
  test("awaits stopAll before calling exit", async () => {
    const events: string[] = [];
    const deferred: { resolve: (v: { stopped: number }) => void } = {
      resolve: () => {},
    };
    const stopAll = (): Promise<{ stopped: number }> =>
      new Promise<{ stopped: number }>((resolve) => {
        deferred.resolve = (v) => {
          events.push("stopAll-resolved");
          resolve(v);
        };
      });
    const exit = (_code: number): void => {
      events.push("exit-called");
    };

    const promise = shutdown("test", { stopAll, exit });
    await Promise.resolve();
    expect(events).toEqual([]);

    deferred.resolve({ stopped: 2 });
    await promise;

    expect(events).toEqual(["stopAll-resolved", "exit-called"]);
  });

  test("calls exit(0) on success", async () => {
    let exitCode = -1;
    await shutdown("test", {
      stopAll: async () => ({ stopped: 0 }),
      exit: (code) => {
        exitCode = code;
      },
    });
    expect(exitCode).toBe(0);
  });

  test("still calls exit(0) when stopAll throws", async () => {
    let exitCalled = false;
    await shutdown("test", {
      stopAll: async () => {
        throw new Error("teardown boom");
      },
      exit: () => {
        exitCalled = true;
      },
    });
    expect(exitCalled).toBe(true);
  });

  test("second concurrent shutdown is a no-op", async () => {
    let exitCount = 0;
    let stopAllCount = 0;
    const stopAll = async (): Promise<{ stopped: number }> => {
      stopAllCount += 1;
      return { stopped: 0 };
    };
    const exit = (): void => {
      exitCount += 1;
    };

    await Promise.all([
      shutdown("first", { stopAll, exit }),
      shutdown("second", { stopAll, exit }),
    ]);

    expect(stopAllCount).toBe(1);
    expect(exitCount).toBe(1);
  });
});
