import { stopAllThreadsGlobal } from "./modules/thread/thread.service";
import { createLogger } from "./utils/logger";

const log = createLogger("lifecycle");

let shuttingDown = false;

export interface ShutdownDeps {
  stopAll?: () => Promise<{ stopped: number }>;
  exit?: (code: number) => void;
}

export async function shutdown(reason: string, deps: ShutdownDeps = {}): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  const stopAll = deps.stopAll ?? stopAllThreadsGlobal;
  const exit = deps.exit ?? ((code: number) => process.exit(code));
  log.info(`Shutdown initiated: ${reason}`);
  try {
    const result = await stopAll();
    log.info(`Stopped ${result.stopped} thread(s) on shutdown`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`Shutdown teardown threw: ${message}`);
  }
  exit(0);
}

export function _resetShutdownStateForTests(): void {
  shuttingDown = false;
}
