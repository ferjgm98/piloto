import type { AgentUpdateDTO } from "shared/rpc";
import { AgentBinaryNotFoundError, ConfigurationError } from "../../../utils/errors";
import { createLogger } from "../../../utils/logger";
import type { AgentBackend } from "../agent.types";
import { type AcpConnection, connectAcp } from "./acp-connection";

export interface AcpBackendConfig {
  name: AgentBackend["name"];
  defaultBinary: string;
  defaultArgs?: string[];
  binaryEnvOverride: string;
  apiKeyEnvVar: string;
  apiKey: string;
  binaryPath?: string;
}

export function createAcpBackend(config: AcpBackendConfig): AgentBackend {
  if (!config.apiKey) {
    throw new ConfigurationError(
      `${config.apiKeyEnvVar} is required to start the ${config.name} backend`,
    );
  }

  const log = createLogger(`${config.name}-backend`);
  const binaryOverride =
    config.binaryPath ?? process.env[config.binaryEnvOverride] ?? config.defaultBinary;
  const args = config.defaultArgs ?? [];

  let conn: AcpConnection | null = null;
  let onUpdateCb: ((update: AgentUpdateDTO) => void) | null = null;

  return {
    name: config.name,
    async start({ workingDir, prompt }) {
      const binary = Bun.which(binaryOverride);
      if (!binary) throw new AgentBinaryNotFoundError(binaryOverride);

      conn = await connectAcp({
        binary,
        args,
        cwd: workingDir,
        env: { ...process.env, [config.apiKeyEnvVar]: config.apiKey },
        onUpdate: (update) => onUpdateCb?.(update),
        onExit: (code, signal) => {
          log.info(`${config.name} process exited code=${code} signal=${signal}`);
        },
        onStderr: (chunk) => log.debug(`${config.name} stderr: ${chunk.trimEnd()}`),
      });

      if (prompt) {
        void conn.prompt(prompt).catch((err: Error) => {
          log.error(`${config.name} prompt failed: ${err.message}`);
        });
      }

      return { sessionId: conn.sessionId };
    },
    async sendPrompt(prompt: string) {
      if (!conn) throw new Error(`${config.name} backend not started`);
      await conn.prompt(prompt);
    },
    async stop() {
      if (!conn) return;
      await conn.shutdown(5_000);
      conn = null;
    },
    onUpdate(cb) {
      onUpdateCb = cb;
    },
  };
}
