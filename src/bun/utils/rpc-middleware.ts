// RPC request middleware for the Bun main process.
//
// `wrapHandlers` takes a module's `requests` object and returns a new object
// where every handler is wrapped with logging, timing, and AppError -> wire
// error serialization. Apply once in the top-level RPC aggregator
// (src/bun/rpc.ts) so every handler gets the same cross-cutting behavior.

import { ErrorCode as Codes, type ErrorCode, encodeRPCError } from "../../../shared/errors";
import {
  AppError,
  GitError,
  NotFoundError,
  UncommittedChangesError,
  ValidationError,
  WorktreeInUseError,
} from "./errors";
import { createLogger } from "./logger";

const log = createLogger("rpc");

// biome-ignore lint/suspicious/noExplicitAny: generic handler signature must preserve arbitrary param/return types across the module boundary.
type AnyHandler = (...args: any[]) => any;

function mapErrorCode(err: unknown): ErrorCode {
  if (err instanceof NotFoundError) return Codes.NOT_FOUND;
  if (err instanceof ValidationError) return Codes.VALIDATION;
  if (err instanceof GitError) return Codes.GIT_ERROR;
  if (err instanceof WorktreeInUseError) return Codes.WORKTREE_IN_USE;
  if (err instanceof UncommittedChangesError) return Codes.UNCOMMITTED_CHANGES;
  return Codes.INTERNAL;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unknown error";
}

export function wrapHandler<F extends AnyHandler>(name: string, handler: F) {
  return async (...args: Parameters<F>): Promise<Awaited<ReturnType<F>>> => {
    const start = performance.now();
    try {
      const result = (await handler(...args)) as Awaited<ReturnType<F>>;
      const duration = (performance.now() - start).toFixed(1);
      log.debug(`${name} completed in ${duration}ms`);
      return result;
    } catch (err) {
      const duration = (performance.now() - start).toFixed(1);
      const code = mapErrorCode(err);
      const message = errorMessage(err);
      log.error(`${name} failed (${code}) after ${duration}ms: ${message}`);

      // Preserve any AppError.details for downstream observability (currently
      // unused by AppError subclasses, but kept extensible).
      const details: Record<string, unknown> = { handler: name };
      if (err instanceof AppError) {
        details.originalCode = err.code;
      }

      throw new Error(encodeRPCError({ code, message, details }));
    }
  };
}

export function wrapHandlers<T extends Record<string, AnyHandler>>(handlers: T): T {
  const wrapped: Record<string, AnyHandler> = {};
  for (const [name, handler] of Object.entries(handlers)) {
    wrapped[name] = wrapHandler(name, handler);
  }
  return wrapped as T;
}
