// App-definition extraction. A Zapier CLI integration is a Node project whose
// entry module exports the definition object. We evaluate that module in a
// child process — exactly what the Zapier CLI itself does — with the project
// as cwd, a timeout, and an output cap. Functions (perform, etc.) survive as
// "[Function]" markers so lint can tell "present" from "missing".

import { execFile } from "node:child_process";
import { access, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Anything the module logs during import lands on stdout too; the marker
// separates our JSON from that noise.
const MARKER = "<<<ZAPIER_DEV_MCP>>>";
const EXTRACT_SCRIPT =
  `const d = require(process.argv[1]);` +
  `const json = JSON.stringify(d, (k, v) => typeof v === "function" ? "[Function]" : v);` +
  `process.stdout.write(${JSON.stringify(MARKER)} + json);`;

export interface Project {
  path: string;
  packageJson: any;
  definition: any;
}

export async function loadProject(rawPath: string): Promise<Project> {
  const path = resolve(rawPath);
  const s = await stat(path).catch(() => {
    throw new Error(`Path not found: ${path}`);
  });
  if (!s.isDirectory()) throw new Error(`Expected an integration project directory, got a file: ${path}`);

  const pkgPath = join(path, "package.json");
  const pkgRaw = await readFile(pkgPath, "utf8").catch(() => {
    throw new Error(`Not a Node project (no package.json in ${path})`);
  });
  let packageJson: any;
  try {
    packageJson = JSON.parse(pkgRaw);
  } catch {
    throw new Error(`package.json is not valid JSON: ${pkgPath}`);
  }

  const entry = join(path, packageJson.main ?? "index.js");
  await access(entry).catch(() => {
    throw new Error(`Entry module not found: ${entry} (package.json "main" or index.js)`);
  });

  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(process.execPath, ["-e", EXTRACT_SCRIPT, entry], {
      cwd: path,
      timeout: 15_000,
      maxBuffer: 32 << 20,
    }));
  } catch (err: any) {
    const detail = String(err.stderr ?? err.message ?? err).slice(0, 1500);
    throw new Error(`Failed to load the app definition from ${entry}:\n${detail}`);
  }

  const at = stdout.lastIndexOf(MARKER);
  if (at === -1) throw new Error(`Entry module produced no definition output: ${entry}`);
  let definition: any;
  try {
    definition = JSON.parse(stdout.slice(at + MARKER.length));
  } catch {
    throw new Error(`Could not parse the exported app definition from ${entry}`);
  }
  if (!definition || typeof definition !== "object") {
    throw new Error(`${entry} does not export an app definition object`);
  }
  return { path, packageJson, definition };
}
