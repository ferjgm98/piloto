#!/usr/bin/env bun
/**
 * Scaffold a new Piloto feature module.
 *
 * Usage:
 *   bun run scaffold:module <kebab-name>
 *
 * Creates src/bun/modules/<name>/ with the three-file layout required by
 * CLAUDE.md:
 *   <name>.types.ts    — domain types, no cross-module imports
 *   <name>.service.ts  — business logic, throws AppError subclasses
 *   <name>.rpc.ts      — thin handlers exporting <name>Handlers
 *
 * Prints the manual follow-up step: wiring the new module into
 * src/bun/rpc.ts. The script does NOT auto-wire the aggregator — wiring is
 * small and the developer should see the diff to confirm naming.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , rawName] = process.argv;

if (!rawName) {
  console.error("Usage: bun run scaffold:module <kebab-name>");
  process.exit(1);
}

if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(rawName)) {
  console.error(
    `Invalid module name "${rawName}". Must be kebab-case (lowercase letters, numbers, and hyphens; starts with a letter).`,
  );
  process.exit(1);
}

const kebab = rawName;
// camelCase handler variable name: "agent-session" → "agentSession"
const camel = kebab.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
// PascalCase for types if ever needed
const pascal = camel.charAt(0).toUpperCase() + camel.slice(1);

const repoRoot = join(import.meta.dir, "..");
const moduleDir = join(repoRoot, "src", "bun", "modules", kebab);

if (existsSync(moduleDir)) {
  console.error(`Module "${kebab}" already exists at src/bun/modules/${kebab}/`);
  process.exit(1);
}

mkdirSync(moduleDir, { recursive: true });

const typesFile = `// Domain types for the ${kebab} module.
// Rule: do NOT import from other modules. If you need to share a type,
// move it to shared/ or re-export from a service.

export interface ${pascal} {
  id: string;
  // TODO: fill in domain fields
}
`;

const serviceFile = `// Business logic for the ${kebab} module.
// Rule: throw AppError subclasses (NotFoundError, ValidationError, GitError)
// on failure — the RPC middleware will serialize them across the IPC
// boundary automatically.

import { createLogger } from "../../utils/logger";
import type { ${pascal} } from "./${kebab}.types";

const log = createLogger("${kebab}");

export function list${pascal}s(): ${pascal}[] {
  log.debug("list${pascal}s called");
  // TODO: implement
  return [];
}
`;

const rpcFile = `// RPC handlers for the ${kebab} module.
// Rule: thin wrappers that unwrap params and delegate to ${kebab}.service.
// The wrapHandlers middleware in src/bun/rpc.ts applies logging + error
// serialization automatically.

import * as ${camel}Service from "./${kebab}.service";
import type { ${pascal} } from "./${kebab}.types";

export const ${camel}Handlers = {
  requests: {
    // Example query — rename, retype, or remove.
    list${pascal}s: async (): Promise<${pascal}[]> => ${camel}Service.list${pascal}s(),
  },
  messages: {},
};
`;

writeFileSync(join(moduleDir, `${kebab}.types.ts`), typesFile);
writeFileSync(join(moduleDir, `${kebab}.service.ts`), serviceFile);
writeFileSync(join(moduleDir, `${kebab}.rpc.ts`), rpcFile);

console.log(`✔ Created src/bun/modules/${kebab}/`);
console.log(`    ${kebab}.types.ts`);
console.log(`    ${kebab}.service.ts`);
console.log(`    ${kebab}.rpc.ts`);
console.log("");
console.log("Next steps:");
console.log("  1. Wire the handlers into src/bun/rpc.ts:");
console.log("");
console.log(`     import { ${camel}Handlers } from "./modules/${kebab}/${kebab}.rpc";`);
console.log("");
console.log("     requests: wrapHandlers({");
console.log("       ...existing handlers,");
console.log(`       ...${camel}Handlers.requests,`);
console.log("     }),");
console.log("");
console.log(`  2. Declare your methods in shared/rpc.ts under bun.requests.`);
console.log(`  3. Run 'bun run scaffold:rpc ${kebab} <methodName>' to add more methods.`);
console.log(`  4. Run 'bun run check' before committing.`);
