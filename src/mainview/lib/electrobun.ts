import { Electroview } from "electrobun/view";
import type { MainRPC } from "shared/rpc";

const rpc = Electroview.defineRPC<MainRPC>({
  maxRequestTime: 5000,
  handlers: {
    requests: {},
    messages: {},
  },
});

// Electrobun's native preload script injects these globals before the webview
// loads. They're absent when the UI is served through plain `vite` in a
// browser for HMR-only development. Construct Electroview only when the
// runtime is actually there; otherwise export a stub whose rpc has no
// transport, so calls surface as RPCClientError(INTERNAL) via rpc-client.
// biome-ignore lint/suspicious/noExplicitAny: Electrobun preload globals are untyped on `window`.
const globals = typeof window !== "undefined" ? (window as any) : undefined;
const isElectrobunRuntime =
  globals !== undefined &&
  typeof globals.__electrobunWebviewId !== "undefined" &&
  typeof globals.__electrobunRpcSocketPort !== "undefined";

function makeElectrobun(): { rpc: typeof rpc } {
  if (isElectrobunRuntime) {
    return new Electroview({ rpc }) as unknown as { rpc: typeof rpc };
  }
  return { rpc };
}

export const electrobun = makeElectrobun();
