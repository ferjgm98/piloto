import { RPCClientError, rpcRequest } from "@/lib/rpc-client";
import { useCallback, useState } from "react";
import { ErrorCode } from "shared/errors";

export interface UseRPCMutationResult<T, P> {
  mutate: (params: P) => Promise<T | undefined>;
  data: T | undefined;
  error: RPCClientError | undefined;
  loading: boolean;
}

/**
 * Imperative RPC call for write operations. Returns the result of the call
 * directly so callers can chain (e.g. invalidate a query's refetch) without
 * waiting for React state to flush.
 */
export function useRPCMutation<T, P extends Record<string, unknown> = Record<string, unknown>>(
  method: string,
): UseRPCMutationResult<T, P> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<RPCClientError>();
  const [loading, setLoading] = useState(false);

  const mutate = useCallback(
    async (params: P): Promise<T | undefined> => {
      setLoading(true);
      setError(undefined);
      try {
        const result = await rpcRequest<T>(method, params);
        setData(result);
        return result;
      } catch (err) {
        const rpcErr =
          err instanceof RPCClientError
            ? err
            : new RPCClientError(ErrorCode.INTERNAL, "Unexpected error");
        setError(rpcErr);
        return undefined;
      } finally {
        setLoading(false);
      }
    },
    [method],
  );

  return { mutate, data, error, loading };
}
