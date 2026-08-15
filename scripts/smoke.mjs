// Self-contained smoke test: writes a deliberately-smelly integration project
// to a temp dir, then drives the built server over stdio.
// Usage: npm run build && node scripts/smoke.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = await mkdtemp(join(tmpdir(), "zapier-dev-smoke-"));
await writeFile(
  join(dir, "package.json"),
  JSON.stringify({ name: "smoke-app", version: "1.0.0", dependencies: { "zapier-platform-core": "19.1.0" } }),
);
await writeFile(
  join(dir, "index.js"),
  `module.exports = {
    version: "1.1.0", // deliberately != package.json
    platformVersion: "19.1.0",
    authentication: { type: "custom", fields: [{ key: "api_key", label: "API Key" }], test: async () => ({}) },
    triggers: {
      new_message: {
        key: "new_message", noun: "Message",
        display: { label: "New Message", description: "Fires on new messages." },
        operation: { perform: async () => [], sample: { id: 1 }, outputFields: [{ key: "id" }], inputFields: [] },
      },
    },
    creates: {
      send_message: {
        key: "send_message",
        display: { label: "Send Message" }, // missing description + noun
        operation: {
          perform: async () => ({}),
          // missing sample
          inputFields: [{ key: "channel", dynamic: "list_channels.id.name" }], // no label + bad dropdown ref
        },
      },
    },
  };`,
);

const client = new Client({ name: "smoke", version: "0.0.0" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: ["dist/index.js"] }));

const { tools } = await client.listTools();
console.log("tools:", tools.map((t) => t.name).join(", "));

const calls = [
  ["inspect_integration", { path: dir }],
  ["lint_integration", { path: dir }],
  ["generate_test_fixtures", { path: dir, component: "send_message" }],
  ["validate_integration", { path: dir }], // CLI not installed → guidance error
  ["inspect_integration", { path: join(dir, "nope") }], // must be isError
];

for (const [name, args] of calls) {
  const res = await client.callTool({ name, arguments: args });
  console.log(`\n== ${name} ${res.isError ? "(isError)" : ""}\n${res.content[0].text.slice(0, 700)}`);
}

await client.close();
await rm(dir, { recursive: true, force: true });
console.log("\nSMOKE OK");
