# zapier-dev-mcp

An [MCP](https://modelcontextprotocol.io) server for people who **build Zapier integrations**. [Zapier MCP](https://docs.zapier.com/mcp/home) lets AI *use* Zapier apps — this server helps you *ship* one. Point Claude at your [zapier-platform-cli](https://github.com/zapier/zapier-platform) project:

- *"What's in this integration?"* — triggers, creates, searches, auth, platform version, request hooks
- *"Is it ready for app review?"* — a lint pass encoding the things Zapier's review commonly bounces integrations for
- *"Run the validator"* — wraps your project's own `zapier validate`

## Quick start

**Claude Code**

```bash
claude mcp add zapier-dev -- npx -y zapier-dev-mcp
```

**Claude Desktop** — add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "zapier-dev": {
      "command": "npx",
      "args": ["-y", "zapier-dev-mcp"]
    }
  }
}
```

Then: *"Lint C:\\code\\my-zapier-app and walk me through fixing the errors."*

## Tools

| Tool | What it does |
|------|--------------|
| `inspect_integration` | Structured summary of the app definition |
| `lint_integration` | Review-readiness report: errors / warnings / info, each anchored to a component path |
| `generate_test_fixtures` | Ready-to-run bundle mocks (typed `inputData`, `authData` from your auth fields) plus an appTester test skeleton per component |
| `validate_integration` | Runs the project's own `zapier validate` (schema + style), with install guidance if the CLI is missing |

## What the linter checks

- Missing `operation.sample` on visible actions — **required for public apps**, and the single most common review bounce
- Dynamic dropdowns (`"trigger_key.id.label"`) referencing triggers that don't exist
- Missing `display.label` / `display.description` / `noun`; unlabeled input fields
- Definition `version` vs `package.json` version mismatch; `platformVersion` vs the `zapier-platform-core` dependency
- Auth without a `connectionLabel` (users can't tell accounts apart)
- Key/map-key mismatches and duplicate keys

`hidden` components skip the visibility checks. The linter complements `zapier validate` — schema validation catches malformed definitions; this catches *reviewable-but-rough* ones.

## Notes

- Inspecting a project **evaluates its entry module** in a child process (with a timeout and output cap) — exactly what the Zapier CLI itself does. Only point it at projects you trust, i.e. your own.
- Computed input fields (functions) can't be linted statically; they're skipped, not flagged.
- Not affiliated with or endorsed by Zapier. `zapier-platform-cli` is Zapier's open-source SDK.

## Development

```bash
npm install
npm test                 # offline tests — synthetic projects written in-suite
npm run build            # tsc → dist/
node scripts/smoke.mjs   # end-to-end: generates a project, drives the server over stdio
```

Architecture: [`src/extract.ts`](src/extract.ts) (definition extraction via child process) and [`src/lint.ts`](src/lint.ts) (pure review checks) carry the logic; [`src/index.ts`](src/index.ts) is the MCP wiring.

## License

MIT
