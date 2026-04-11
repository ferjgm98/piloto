#!/usr/bin/env bun
/**
 * Scaffold a new RPC method on an existing Piloto module.
 *
 * Usage:
 *   bun run scaffold:rpc <module> <methodName> [query|mutation|message]
 *
 * Defaults kind to "query". Inserts:
 *   - A schema entry in shared/rpc.ts under bun.requests.<method>
 *     (or bun.messages.<method> for message kind)
 *   - A stub handler in src/bun/modules/<module>/<module>.rpc.ts
 *
 * Both insertions use placeholder types — fill in params/response types
 * and the implementation before committing. Prints the suggested hook
 * usage for queries/mutations.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Kind = "query" | "mutation" | "message";

const [, , moduleName, methodName, kindArg = "query"] = process.argv;

if (!moduleName || !methodName) {
  console.error(
    "Usage: bun run scaffold:rpc <module> <methodName> [query|mutation|message]",
  );
  process.exit(1);
}

if (!["query", "mutation", "message"].includes(kindArg)) {
  console.error(`Invalid kind "${kindArg}". Must be query, mutation, or message.`);
  process.exit(1);
}

const kind = kindArg as Kind;

if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(moduleName)) {
  console.error(`Invalid module name "${moduleName}". Must be kebab-case.`);
  process.exit(1);
}

if (!/^[a-z][a-zA-Z0-9]*$/.test(methodName)) {
  console.error(
    `Invalid method name "${methodName}". Must be camelCase (starts with a lowercase letter).`,
  );
  process.exit(1);
}

const repoRoot = join(import.meta.dir, "..");
const moduleDir = join(repoRoot, "src", "bun", "modules", moduleName);
const rpcFilePath = join(moduleDir, `${moduleName}.rpc.ts`);
const schemaFilePath = join(repoRoot, "shared", "rpc.ts");

if (!existsSync(moduleDir)) {
  console.error(
    `Module "${moduleName}" not found. Run 'bun run scaffold:module ${moduleName}' first.`,
  );
  process.exit(1);
}
if (!existsSync(rpcFilePath)) {
  console.error(`Missing handler file: src/bun/modules/${moduleName}/${moduleName}.rpc.ts`);
  process.exit(1);
}
if (!existsSync(schemaFilePath)) {
  console.error("Missing schema file: shared/rpc.ts");
  process.exit(1);
}

// camelCase handler variable (e.g. "agent-session" → "agentSession")
const camelModule = moduleName.replace(/-([a-z0-9])/g, (_, c: string) =>
  c.toUpperCase(),
);

/* -------------------- update shared/rpc.ts -------------------- */

const schemaSource = readFileSync(schemaFilePath, "utf-8");

if (new RegExp(`\\b${methodName}\\b\\s*:`).test(schemaSource)) {
  console.error(`"${methodName}" already appears in shared/rpc.ts — aborting.`);
  process.exit(1);
}

const schemaEntry =
  kind === "message"
    ? `      ${methodName}: { /* TODO: payload */ };\n`
    : `      ${methodName}: {\n        params: Record<string, never>; // TODO: fill in\n        response: unknown; // TODO: fill in\n      };\n`;

const anchor = kind === "message" ? /(\s*messages:\s*\{)/ : /(\s*requests:\s*\{)/;
if (!anchor.test(schemaSource)) {
  console.error(
    `Could not find ${kind === "message" ? "messages" : "requests"}: { ... } block in shared/rpc.ts`,
  );
  process.exit(1);
}

const updatedSchema = schemaSource.replace(
  anchor,
  (match) => `${match}\n${schemaEntry}`,
);
writeFileSync(schemaFilePath, updatedSchema);

/* -------------------- update <module>.rpc.ts -------------------- */

const rpcSource = readFileSync(rpcFilePath, "utf-8");

if (new RegExp(`\\b${methodName}\\b\\s*:`).test(rpcSource)) {
  console.error(
    `"${methodName}" already appears in ${moduleName}.rpc.ts — aborting.`,
  );
  process.exit(1);
}

const handlerStub =
  kind === "message"
    ? `    ${methodName}: (_payload: unknown) => {\n      // TODO: implement ${methodName} message handler\n    },\n`
    : `    ${methodName}: async (): Promise<unknown> => {\n      // TODO: implement ${methodName} ${kind}\n      throw new Error("${methodName} not implemented");\n    },\n`;

const handlerAnchor =
  kind === "message"
    ? /(messages:\s*\{)/
    : /(requests:\s*\{)/;

if (!handlerAnchor.test(rpcSource)) {
  console.error(
    `Could not find ${kind === "message" ? "messages" : "requests"}: { ... } block in ${moduleName}.rpc.ts`,
  );
  process.exit(1);
}

const updatedRpc = rpcSource.replace(
  handlerAnchor,
  (match) => `${match}\n${handlerStub}`,
);
writeFileSync(rpcFilePath, updatedRpc);

/* -------------------- report -------------------- */

console.log(`✔ Added ${kind} "${methodName}" to module "${moduleName}"`);
console.log(`    shared/rpc.ts: schema entry under bun.${kind === "message" ? "messages" : "requests"}`);
console.log(`    src/bun/modules/${moduleName}/${moduleName}.rpc.ts: stub handler`);
console.log("");

if (kind === "query") {
  console.log("Next steps:");
  console.log(`  1. Fill in params/response types in shared/rpc.ts`);
  console.log(`  2. Implement ${moduleName}Service.${methodName} in ${moduleName}.service.ts and throw AppError subclasses on failure`);
  console.log(`  3. Use it from a component:`);
  console.log("");
  console.log(`     import { useRPCQuery } from "@/hooks";`);
  console.log(`     const { data, error, loading } = useRPCQuery<TResponse>("${methodName}");`);
} else if (kind === "mutation") {
  console.log("Next steps:");
  console.log(`  1. Fill in params/response types in shared/rpc.ts`);
  console.log(`  2. Implement ${moduleName}Service.${methodName} in ${moduleName}.service.ts`);
  console.log(`  3. Use it from a component:`);
  console.log("");
  console.log(`     import { useRPCMutation } from "@/hooks";`);
  console.log(`     const { mutate, loading } = useRPCMutation<TResponse, TParams>("${methodName}");`);
  console.log(`     await mutate({ /* params */ });`);
} else {
  console.log("Next steps:");
  console.log(`  1. Fill in the payload type in shared/rpc.ts`);
  console.log(`  2. The Bun side sends this via mainWindow.webview.send("${methodName}", payload)`);
  console.log(`  3. Subscribe in a component:`);
  console.log("");
  console.log(`     import { useRPCSubscription } from "@/hooks";`);
  console.log(`     useRPCSubscription<TPayload>("${methodName}", (data) => { /* handle */ });`);
}

console.log("");
console.log(`Run 'bun run check' before committing.`);

// Silence unused camelModule lint warning if the above grows.
void camelModule;
