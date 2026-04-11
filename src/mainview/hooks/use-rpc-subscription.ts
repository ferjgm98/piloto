import { electrobun } from "@/lib/electrobun";
import { useEffect, useRef } from "react";

// Electrobun's rpc instance exposes a typed addMessageListener keyed on the
// schema's message names. Since our hook takes a runtime string, we widen the
// signature to a generic string-keyed listener once and use that cast below.
type MessageListener = (payload: unknown) => void;
type MessageListenerApi = (event: string, listener: MessageListener) => void;

/**
 * Subscribe to a push message from the Bun main process. The callback is
 * stored in a ref so inline closures don't cause re-subscription on every
 * render; the effect only re-runs when `event` or caller-supplied `deps`
 * change. Unmount removes the listener, preventing leaks.
 */
export function useRPCSubscription<T>(
  event: string,
  callback: (data: T) => void,
  deps: unknown[] = [],
): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const rpc = electrobun.rpc;
    if (!rpc) return;

    const handler: MessageListener = (payload) => {
      callbackRef.current(payload as T);
    };

    const add = rpc.addMessageListener as unknown as MessageListenerApi;
    const remove = rpc.removeMessageListener as unknown as MessageListenerApi;

    add(event, handler);
    return () => {
      remove(event, handler);
    };
  }, [event, ...deps]);
}
