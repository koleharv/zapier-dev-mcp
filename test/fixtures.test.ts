import { describe, expect, it } from "vitest";
import { generateFixtures, sampleValue } from "../src/fixtures.js";

const definition = {
  authentication: {
    type: "custom",
    fields: [
      { key: "api_key", label: "API Key" },
      { key: "account_email", label: "Email" },
    ],
  },
  triggers: {
    new_message: {
      key: "new_message",
      display: { label: "New Message" },
      operation: {
        perform: "[Function]",
        inputFields: [
          { key: "channel_id", label: "Channel", dynamic: "list_channels.id.name" },
          { key: "limit", type: "integer" },
        ],
      },
    },
  },
  creates: {
    send_message: {
      key: "send_message",
      display: { label: "Send Message" },
      operation: {
        perform: "[Function]",
        inputFields: [
          { key: "to_email", type: "string" },
          { key: "urgent", type: "boolean" },
          { key: "kind", choices: ["plain", "rich"] },
          "[Function]", // computed fields arrive as markers
        ],
      },
    },
  },
  searches: {},
};

describe("sampleValue", () => {
  it("prefers choices, then defaults, then types, then key heuristics", () => {
    expect(sampleValue({ key: "kind", choices: ["plain", "rich"] })).toBe("plain");
    expect(sampleValue({ key: "mode", choices: { fast: "Fast", slow: "Slow" } })).toBe("fast");
    expect(sampleValue({ key: "count", type: "integer", default: 7 })).toBe(7);
    expect(sampleValue({ key: "count", type: "integer" })).toBe(42);
    expect(sampleValue({ key: "when", type: "datetime" })).toBe("2026-08-14T12:00:00Z");
    expect(sampleValue({ key: "contact_email" })).toBe("recipient@example.com");
    expect(sampleValue({ key: "page_url" })).toBe("https://example.com/page");
  });
});

describe("generateFixtures", () => {
  it("builds authData from auth fields and inputData per component", () => {
    const all = generateFixtures(definition);
    expect(all.map((f) => f.component)).toEqual(["triggers.new_message", "creates.send_message"]);

    const trigger = all[0];
    expect(trigger.bundle.authData).toEqual({
      api_key: "test-api-key-1234567890",
      account_email: "dev@example.com",
    });
    expect(trigger.bundle.inputData.limit).toBe(42);
    expect(trigger.notes.some((n) => n.includes("dynamic dropdown"))).toBe(true);

    const create = all[1];
    expect(create.bundle.inputData).toEqual({
      to_email: "recipient@example.com",
      urgent: true,
      kind: "plain",
    });
    expect(create.notes.some((n) => n.includes("computed at runtime"))).toBe(true);
  });

  it("emits runnable-looking appTester test code", () => {
    const [trigger] = generateFixtures(definition, "new_message");
    expect(trigger.testCode).toContain("zapier.createAppTester(App)");
    expect(trigger.testCode).toContain("App.triggers.new_message.operation.perform");
    expect(trigger.testCode).toContain("expect(Array.isArray(results)).toBe(true);");
    const [create] = generateFixtures(definition, "creates.send_message");
    expect(create.testCode).not.toContain("Array.isArray");
  });

  it("names available components when the filter misses", () => {
    expect(() => generateFixtures(definition, "nope")).toThrow(/triggers\.new_message, creates\.send_message/);
  });
});
