// Typed RPC client wrapper for the webview side.
//
// Wraps `electrobun.rpc.request` to provide:
//   - Normalized error shape (RPCClientError) reconstructed from the wire
//     marker prefix defined in shared/errors.ts
//   - Timeout detection (Electrobun throws `Error("RPC request timed out.")`)
//   - A single typed call path that React hooks in @/hooks build on top of.

import { ErrorCode, type RPCError, decodeRPCError } from "shared/errors";
import { electrobun } from "./electrobun";

export class RPCClientError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "RPCClientError";
  }

  static fromRPCError(err: RPCError): RPCClientError {
    return new RPCClientError(err.code, err.message, err.details);
  }
}

// Electrobun's request object is a Proxy whose keys are RPC method names.
// We access it dynamically with a typed cast since the method is a runtime
// string in the client wrapper.
type RequestProxy = Record<string, (params?: Record<string, unknown>) => Promise<unknown>>;

export async function rpcRequest<T>(
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const rpc = electrobun.rpc;
  if (!rpc) {
    throw new RPCClientError(ErrorCode.INTERNAL, "RPC not initialized");
  }

  const requestProxy = rpc.request as unknown as RequestProxy;
  const fn = requestProxy[method];
  if (typeof fn !== "function") {
    throw new RPCClientError(ErrorCode.INTERNAL, `Unknown RPC method: ${method}`);
  }

  try {
    return (await fn(params)) as T;
  } catch (err) {
    if (err instanceof RPCClientError) throw err;

    if (err instanceof Error) {
      // Structured AppError serialized by the Bun middleware.
      const decoded = decodeRPCError(err.message);
      if (decoded) throw RPCClientError.fromRPCError(decoded);

      // Timeout from Electrobun's maxRequestTime gate.
      if (err.message.includes("timed out")) {
        throw new RPCClientError(ErrorCode.TIMEOUT, err.message);
      }

      throw new RPCClientError(ErrorCode.INTERNAL, err.message);
    }

    throw new RPCClientError(ErrorCode.INTERNAL, "RPC call failed");
  }
}
