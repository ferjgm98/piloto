// Shared error contract between Bun main process and webview.
//
// Electrobun's RPC wire protocol only transports `error.message` as a string
// (see node_modules/electrobun/dist/api/shared/rpc.ts lines 398-419). To send
// a structured error across the boundary we JSON-encode an RPCError payload
// into Error.message with a stable marker prefix, and decode it on the other
// side. Plain throws that don't carry the prefix fall back to INTERNAL.

export const ErrorCode = {
  NOT_FOUND: "NOT_FOUND",
  VALIDATION: "VALIDATION",
  GIT_ERROR: "GIT_ERROR",
  WORKTREE_IN_USE: "WORKTREE_IN_USE",
  UNCOMMITTED_CHANGES: "UNCOMMITTED_CHANGES",
  AGENT_BINARY_NOT_FOUND: "AGENT_BINARY_NOT_FOUND",
  CONFIGURATION_ERROR: "CONFIGURATION_ERROR",
  TIMEOUT: "TIMEOUT",
  INTERNAL: "INTERNAL",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface RPCError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

/** Marker prefix used to encode RPCError payloads inside Error.message. */
export const RPC_ERROR_PREFIX = "__RPC_ERROR__:";

export function encodeRPCError(err: RPCError): string {
  return RPC_ERROR_PREFIX + JSON.stringify(err);
}

export function decodeRPCError(message: string): RPCError | undefined {
  if (!message.startsWith(RPC_ERROR_PREFIX)) return undefined;
  try {
    const parsed = JSON.parse(message.slice(RPC_ERROR_PREFIX.length));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.code === "string" &&
      typeof parsed.message === "string"
    ) {
      return parsed as RPCError;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
