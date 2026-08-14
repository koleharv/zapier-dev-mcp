import { describe, expect, it } from "vitest";
import { lintDefinition, toReport } from "../src/lint.js";

const goodPkg = { version: "1.0.0", dependencies: { "zapier-platform-core": "19.1.0" } };

const goodDef = {
  version: "1.0.0",
  platformVersion: "19.1.0",
  authentication: {
    type: "custom",
    connectionLabel: "{{bundle.authData.email}}",
    fields: [{ key: "api_key", label: "API Key" }],
    test: "[Function]",
  },
  triggers: {
    new_contact: {
      key: "new_contact",
      noun: "Contact",
      display: { label: "New Contact", description: "Fires when a contact is added." },
      operation: {
        perform: "[Function]",
        sample: { id: 1, name: "Ada" },
        outputFields: [{ key: "id", label: "ID" }],
        inputFields: [{ key: "list_id", label: "List", dynamic: "new_contact.id.name" }],
      },
    },
  },
  creates: {},
  searches: {},
};

describe("lintDefinition", () => {
  it("passes a clean definition with no errors or warnings", () => {
    const report = toReport(lintDefinition(goodDef, goodPkg));
    expect(report.errors).toBe(0);
    expect(report.warnings).toBe(0);
  });

  it("flags missing labels, samples, nouns, and descriptions", () => {
    const def = {
      triggers: {
        bare: { key: "bare", operation: { perform: "[Function]" } },
      },
    };
    const findings = lintDefinition(def, {});
    const messages = findings.map((f) => `${f.severity}:${f.component}:${f.message}`);
    expect(messages).toContainEqual(expect.stringContaining("error:triggers.bare:missing display.label"));
    expect(messages).toContainEqual(expect.stringContaining("error:triggers.bare:missing operation.sample"));
    expect(messages).toContainEqual(expect.stringContaining("warning:triggers.bare:missing noun"));
    expect(messages).toContainEqual(expect.stringContaining("warning:triggers.bare:missing display.description"));
  });

  it("skips visibility checks for hidden components", () => {
    const def = {
      triggers: { util: { key: "util", display: { hidden: true }, operation: { perform: "[Function]" } } },
    };
    expect(lintDefinition(def, {}).filter((f) => f.severity === "error")).toEqual([]);
  });

  it("catches dynamic dropdowns pointing at nonexistent triggers", () => {
    const def = {
      triggers: {},
      creates: {
        make_thing: {
          key: "make_thing",
          noun: "Thing",
          display: { label: "Make Thing", description: "d" },
          operation: {
            sample: { id: 1 },
            outputFields: [{ key: "id" }],
            inputFields: [{ key: "folder", label: "Folder", dynamic: "list_folders.id.name" }],
          },
        },
      },
    };
    const errors = lintDefinition(def, {}).filter((f) => f.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0].component).toBe("creates.make_thing.inputFields.folder");
    expect(errors[0].message).toContain('references trigger "list_folders"');
  });

  it("flags version and platform mismatches and missing connectionLabel", () => {
    const def = {
      version: "2.0.0",
      platformVersion: "15.0.0",
      authentication: { type: "custom" },
      triggers: {},
    };
    const pkg = { version: "1.0.0", dependencies: { "zapier-platform-core": "19.1.0" } };
    const warnings = lintDefinition(def, pkg).filter((f) => f.severity === "warning");
    const components = warnings.map((w) => w.component).sort();
    expect(components).toEqual(["authentication", "platformVersion", "version"]);
  });

  it("flags key/map-key mismatches and unlabeled input fields", () => {
    const def = {
      triggers: {
        alpha: {
          key: "beta",
          noun: "X",
          display: { label: "L", description: "D" },
          operation: { sample: { id: 1 }, outputFields: [{ key: "id" }], inputFields: [{ key: "q" }] },
        },
      },
    };
    const findings = lintDefinition(def, {});
    expect(findings.some((f) => f.message.includes('does not match its map key'))).toBe(true);
    expect(findings.some((f) => f.component === "triggers.alpha.inputFields.q" && f.message.includes("no label"))).toBe(true);
  });
});
