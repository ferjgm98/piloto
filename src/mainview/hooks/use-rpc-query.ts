import { RPCClientError, rpcRequest } from "@/lib/rpc-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorCode } from "shared/errors";

export interface UseRPCQueryResult<T> {
  data: T | undefined;
  error: RPCClientError | undefined;
  loading: boolean;
  refetch: () => void;
}

/**
 * Fetches data from the Bun main process via RPC. Auto-fetches on mount and
 * whenever `method` or the caller-supplied `deps` change.
 *
 * Note: `params` is intentionally excluded from the effect deps — object
 * literals would refetch every render. Pass any re-fetch triggers through
 * `deps` instead.
 */
export function useRPCQuery<T>(
  method: string,
  params: Record<string, unknown> = {},
  deps: unknown[] = [],
): UseRPCQueryResult<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<RPCClientError>();
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  // Hold params in a ref so refetch always sees the latest values without
  // forcing the effect to re-run on every render.
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await rpcRequest<T>(method, paramsRef.current);
      if (mountedRef.current) setData(result);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(
        err instanceof RPCClientError
          ? err
          : new RPCClientError(ErrorCode.INTERNAL, "Unexpected error"),
      );
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [method, ...deps]);

  useEffect(() => {
    mountedRef.current = true;
    void fetch();
    return () => {
      mountedRef.current = false;
    };
  }, [fetch]);

  return { data, error, loading, refetch: fetch };
}
