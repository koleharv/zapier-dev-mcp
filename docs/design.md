# zapier-dev-mcp — Design

**Date:** 2026-08-14
**Goal:** Sixth portfolio MCP server; user asked for something Zapier-related.

## Idea selection

Zapier's own official **Zapier MCP** owns action execution against their
9,000-app catalog — no point competing with the vendor. Their app-directory
API requires partner credentials (probed live: 401 `Missing client_id`), so
directory browsing is out too. The open ground is the **developer side**:
people who *build* Zapier integrations with the open-source
`zapier-platform-cli`. No MCP tooling exists for them (checked 2026-08-14).

## What it does

Point Claude at a Zapier CLI integration project:

- *"What's in this integration?"* — structured summary: triggers, creates,
  searches, auth type, platform version, hooks.
- *"Is it ready for app review?"* — a lint pass encoding Zapier's review
  guidelines: missing sample data, unlabeled input fields, missing
  descriptions/nouns, dynamic dropdowns referencing nonexistent triggers,
  version mismatches between the definition and package.json.
- *"Run Zapier's validator"* — wraps the project's own `zapier validate`
  when the CLI is installed, with a clean, actionable error when it isn't.

## Architecture

- `src/extract.ts` — definition extraction: spawns
  `node -e "…JSON.stringify(require(entry))…"` with the project as cwd, a
  timeout, and an output cap. **This executes the project's own entry
  module — exactly what the Zapier CLI itself does** — and is documented as
  such; it never runs anything the user didn't already trust by having the
  project.
- `src/lint.ts` — pure review-readiness checks over the extracted
  definition JSON. No subprocess, fully unit-tested.
- `src/index.ts` — MCP wiring: three tools plus the `zapier validate`
  subprocess wrapper (`--format json` parsed when available).

No runtime deps beyond the MCP SDK and zod — the Zapier CLI is *the
project's* dependency, not ours.

## Tools

| Tool | Purpose |
|------|---------|
| `inspect_integration(path)` | Structured app-definition summary |
| `lint_integration(path)` | Review-readiness report: errors / warnings / info with component paths |
| `validate_integration(path)` | Runs the project's own `zapier validate`; explains how to install the CLI if missing |

## Lint checks (v1)

- Trigger/create/search: missing `display.label`, `display.description`,
  `noun`; empty/missing `operation.sample` (required for public apps);
  missing `operation.outputFields` (warning); input fields without `label`;
  `dynamic` dropdown references (`trigger_key.id.label`) whose trigger key
  doesn't exist (error).
- App: `version` differing from package.json `version`;
  `zapier-platform-core` major in package.json differing from
  `platformVersion` in the definition.
- Auth: missing `connectionLabel` (warning).
- Duplicate keys within a component type (error).

## Testing

Synthetic integration projects are written to temp dirs in-suite (a clean
one and a smelly one); extraction runs against them for real. Lint is unit
tested on definition objects directly. The missing-CLI path of
`validate_integration` is covered; the CLI-present path is exercised
manually against a real scaffolded integration before release. Smoke
generates a project and drives all three tools over stdio.

## Out of scope (v1)

Scaffolding/pushing/promoting (write operations — Claude edits files
itself; push/promote need Zapier auth), legacy Web Builder apps, running
the project's test suite.
