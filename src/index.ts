#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { loadProject } from "./extract.js";
import { lintDefinition, toReport } from "./lint.js";

const execAsync = promisify(exec);
const server = new McpServer({ name: "zapier-dev", version: "0.1.0" });

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

function jsonResult(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function guarded<A extends unknown[]>(fn: (...args: A) => Promise<ToolResult>) {
  return async (...args: A): Promise<ToolResult> => {
    try {
      return await fn(...args);
    } catch (err) {
      return { content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }], isError: true };
    }
  };
}

const pathArg = z.string().describe("Path to a zapier-platform-cli integration project directory");

function summarizeComponents(map: Record<string, any> | undefined) {
  return Object.entries(map ?? {}).map(([key, c]) => ({
    key,
    label: c?.display?.label,
    ...(c?.display?.hidden ? { hidden: true } : {}),
    ...(c?.display?.description ? { description: c.display.description } : {}),
  }));
}

server.registerTool(
  "inspect_integration",
  {
    title: "Inspect a Zapier integration",
    description:
      "Structured summary of a zapier-platform-cli project: triggers, creates, searches, authentication, platform version, request hooks. Note: this evaluates the project's own entry module (exactly as the Zapier CLI does).",
    inputSchema: { path: pathArg },
  },
  guarded(async ({ path }) => {
    const { packageJson, definition } = await loadProject(path);
    return jsonResult({
      name: packageJson.name,
      version: definition.version,
      platformVersion: definition.platformVersion,
      authentication: definition.authentication
        ? {
            type: definition.authentication.type,
            hasConnectionLabel: Boolean(definition.authentication.connectionLabel),
            fields: (Array.isArray(definition.authentication.fields) ? definition.authentication.fields : [])
              .map((f: any) => f?.key)
              .filter(Boolean),
          }
        : null,
      triggers: summarizeComponents(definition.triggers),
      creates: summarizeComponents(definition.creates),
      searches: summarizeComponents(definition.searches),
      hooks: {
        beforeRequest: Array.isArray(definition.beforeRequest) ? definition.beforeRequest.length : 0,
        afterResponse: Array.isArray(definition.afterResponse) ? definition.afterResponse.length : 0,
      },
      hasResources: !Object.is(definition.resources, undefined) && Object.keys(definition.resources ?? {}).length > 0,
    });
  }),
);

server.registerTool(
  "lint_integration",
  {
    title: "Lint for review readiness",
    description:
      "Checks a Zapier integration against common app-review blockers: missing sample data, unlabeled input fields, missing descriptions/nouns, dynamic dropdowns referencing nonexistent triggers, version mismatches. Complements (does not replace) `zapier validate`.",
    inputSchema: { path: pathArg },
  },
  guarded(async ({ path }) => {
    const { packageJson, definition } = await loadProject(path);
    return jsonResult(toReport(lintDefinition(definition, packageJson)));
  }),
);

server.registerTool(
  "validate_integration",
  {
    title: "Run zapier validate",
    description:
      "Runs the project's own `zapier validate` (schema + style checks) via npx. Requires zapier-platform-cli in the project or globally; returns install guidance if missing.",
    inputSchema: { path: pathArg },
  },
  guarded(async ({ path }) => {
    const { path: cwd } = await loadProject(path); // validates it's a real project first
    try {
      // Fixed command string, no user input — exec resolves npx.cmd on Windows.
      const { stdout } = await execAsync("npx --no-install zapier validate --format json", {
        cwd,
        timeout: 120_000,
        maxBuffer: 8 << 20,
      });
      return jsonResult({ passed: true, output: parseMaybeJson(stdout) });
    } catch (err: any) {
      const out = `${err.stdout ?? ""}${err.stderr ?? ""}`;
      if (/not found|could not determine|command failed.*--no-install/is.test(out) || err.code === "ENOENT") {
        throw new Error(
          "zapier-platform-cli is not installed in this project. Install it with:\n  npm install --save-dev zapier-platform-cli\nthen re-run this tool.",
        );
      }
      // validate exits non-zero when checks fail — that's a result, not a crash
      return jsonResult({ passed: false, output: parseMaybeJson(String(err.stdout ?? out).slice(0, 20_000)) });
    }
  }),
);

function parseMaybeJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

await server.connect(new StdioServerTransport());
