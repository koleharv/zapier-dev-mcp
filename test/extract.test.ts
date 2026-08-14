import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadProject } from "../src/extract.js";

let dir: string;

async function writeProject(name: string, indexJs: string, pkg: object = {}): Promise<string> {
  const p = join(dir, name);
  await mkdir(p, { recursive: true });
  await writeFile(join(p, "package.json"), JSON.stringify({ name, version: "1.0.0", ...pkg }));
  await writeFile(join(p, "index.js"), indexJs);
  return p;
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "zapier-dev-test-"));
});

afterAll(() => rm(dir, { recursive: true, force: true }));

describe("loadProject", () => {
  it("extracts the definition, converting functions to markers", async () => {
    const p = await writeProject(
      "clean",
      `module.exports = { version: "1.0.0", platformVersion: "19.1.0",
         triggers: { t: { key: "t", operation: { perform: async () => [] } } } };`,
    );
    const { definition } = await loadProject(p);
    expect(definition.platformVersion).toBe("19.1.0");
    expect(definition.triggers.t.operation.perform).toBe("[Function]");
  });

  it("survives console noise printed at import time", async () => {
    const p = await writeProject(
      "noisy",
      `console.log("booting up", { some: "object" });
       module.exports = { version: "2.0.0" };`,
    );
    const { definition } = await loadProject(p);
    expect(definition.version).toBe("2.0.0");
  });

  it("respects package.json main", async () => {
    const p = await writeProject("mained", `module.exports = { version: "3.0.0" };`, { main: "app.js" });
    await writeFile(join(p, "app.js"), `module.exports = { version: "9.9.9" };`);
    const { definition } = await loadProject(p);
    expect(definition.version).toBe("9.9.9");
  });

  it("reports module load failures with the project's own error", async () => {
    const p = await writeProject("broken", `throw new Error("kaboom at import");`);
    await expect(loadProject(p)).rejects.toThrow(/kaboom at import/);
  });

  it("rejects non-projects", async () => {
    await expect(loadProject(join(dir, "missing"))).rejects.toThrow(/Path not found/);
    const empty = join(dir, "empty");
    await mkdir(empty, { recursive: true });
    await expect(loadProject(empty)).rejects.toThrow(/no package.json/);
  });
});
