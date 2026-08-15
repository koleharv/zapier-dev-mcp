// Test-fixture generation: turns an extracted app definition into ready-to-run
// bundle mocks and zapier-platform-core appTester test skeletons. Pure logic.

const AUTH_HINTS: [RegExp, string][] = [
  [/email/i, "dev@example.com"],
  [/(api_?key|token|secret)/i, "test-api-key-1234567890"],
  [/password/i, "test-password"],
  [/(url|domain|host)/i, "https://example.com"],
  [/username|user/i, "testuser"],
];

function authValue(key: string): string {
  for (const [re, value] of AUTH_HINTS) if (re.test(key)) return value;
  return `test_${key}`;
}

export function sampleValue(field: any): unknown {
  if (Array.isArray(field.choices) && field.choices.length) {
    const first = field.choices[0];
    return typeof first === "object" ? (first.value ?? first.sample) : first;
  }
  if (field.choices && typeof field.choices === "object") {
    const keys = Object.keys(field.choices);
    if (keys.length) return keys[0];
  }
  if (field.default !== undefined) return field.default;
  switch (field.type) {
    case "integer":
    case "number":
      return 42;
    case "boolean":
      return true;
    case "datetime":
      return "2026-08-14T12:00:00Z";
    case "file":
      return "https://example.com/sample.pdf";
    case "dict":
      return { key: "value" };
    default: {
      const key = String(field.key ?? "field");
      if (/email/i.test(key)) return "recipient@example.com";
      if (/(url|link|webhook)/i.test(key)) return "https://example.com/page";
      if (/(id)$/i.test(key)) return "12345";
      return `sample ${key.replace(/_/g, " ")}`;
    }
  }
}

export interface ComponentFixture {
  component: string;
  bundle: { authData: Record<string, string>; inputData: Record<string, unknown> };
  notes: string[];
  testCode: string;
}

const TYPE_ACCESS: Record<string, string> = { triggers: "triggers", creates: "creates", searches: "searches" };

function testCodeFor(type: string, key: string, bundle: object): string {
  const isTrigger = type === "triggers";
  return `/* globals describe, it, expect */
const zapier = require('zapier-platform-core');
const App = require('../index');
const appTester = zapier.createAppTester(App);
zapier.tools.env.inject();

describe('${type}.${key}', () => {
  it('should run', async () => {
    const bundle = ${JSON.stringify(bundle, null, 4).replace(/\n/g, "\n    ")};

    const results = await appTester(App.${TYPE_ACCESS[type]}.${key}.operation.perform, bundle);
    expect(results).toBeDefined();${isTrigger ? "\n    expect(Array.isArray(results)).toBe(true);" : ""}
  });
});
`;
}

export function generateFixtures(definition: any, component?: string): ComponentFixture[] {
  const authData: Record<string, string> = {};
  for (const field of Array.isArray(definition.authentication?.fields) ? definition.authentication.fields : []) {
    if (field && typeof field === "object" && field.key) authData[field.key] = authValue(field.key);
  }

  const out: ComponentFixture[] = [];
  for (const type of Object.keys(TYPE_ACCESS)) {
    for (const [key, comp] of Object.entries<any>(definition[type] ?? {})) {
      const name = `${type}.${key}`;
      if (component && component !== name && component !== key) continue;

      const notes: string[] = [];
      const inputData: Record<string, unknown> = {};
      const fields = Array.isArray(comp?.operation?.inputFields) ? comp.operation.inputFields : [];
      for (const field of fields) {
        if (typeof field !== "object" || field === null) {
          notes.push("some input fields are computed at runtime and were skipped — add their values manually");
          continue;
        }
        if (!field.key) continue;
        inputData[field.key] = sampleValue(field);
        if (field.dynamic) notes.push(`inputData.${field.key} feeds from a dynamic dropdown — replace with a real ID when testing live`);
      }

      const bundle = { authData, inputData };
      out.push({ component: name, bundle, notes, testCode: testCodeFor(type, key, bundle) });
    }
  }

  if (component && out.length === 0) {
    const available = Object.keys(TYPE_ACCESS)
      .flatMap((t) => Object.keys(definition[t] ?? {}).map((k) => `${t}.${k}`))
      .join(", ");
    throw new Error(`No component "${component}". Available: ${available || "(none)"}`);
  }
  return out;
}
