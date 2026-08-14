// Review-readiness lint over an extracted app definition. Pure logic.
// These encode the checks Zapier's app review commonly bounces integrations
// for, beyond what schema validation catches.

export interface Finding {
  severity: "error" | "warning" | "info";
  component: string;
  message: string;
}

const COMPONENT_TYPES = ["triggers", "creates", "searches"] as const;

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === "object" && Object.keys(v as object).length === 0);
}

export function lintDefinition(definition: any, packageJson: any): Finding[] {
  const findings: Finding[] = [];
  const add = (severity: Finding["severity"], component: string, message: string) =>
    findings.push({ severity, component, message });

  const triggerKeys = new Set(Object.keys(definition.triggers ?? {}));

  for (const type of COMPONENT_TYPES) {
    const seen = new Set<string>();
    for (const [mapKey, comp] of Object.entries<any>(definition[type] ?? {})) {
      const where = `${type}.${mapKey}`;
      const hidden = comp?.display?.hidden === true;

      if (comp?.key && comp.key !== mapKey) {
        add("warning", where, `key "${comp.key}" does not match its map key "${mapKey}"`);
      }
      if (comp?.key && seen.has(comp.key)) add("error", where, `duplicate key "${comp.key}" within ${type}`);
      if (comp?.key) seen.add(comp.key);

      if (!hidden) {
        if (!comp?.display?.label) add("error", where, "missing display.label");
        if (!comp?.display?.description) add("warning", where, "missing display.description");
        if (!comp?.noun) add("warning", where, "missing noun");
        if (isEmpty(comp?.operation?.sample)) {
          add("error", where, "missing operation.sample — public apps require sample data for every visible action");
        }
        if (isEmpty(comp?.operation?.outputFields)) {
          add("info", where, "no operation.outputFields — field labels improve the Zap editor experience");
        }
      }

      const inputFields = Array.isArray(comp?.operation?.inputFields) ? comp.operation.inputFields : [];
      for (const field of inputFields) {
        if (typeof field !== "object" || field === null) continue; // "[Function]" — computed fields can't be linted statically
        const fieldWhere = `${where}.inputFields.${field.key ?? "?"}`;
        if (!field.label) add("warning", fieldWhere, "input field has no label");
        if (typeof field.dynamic === "string") {
          const source = field.dynamic.split(".")[0];
          if (!triggerKeys.has(source)) {
            add("error", fieldWhere, `dynamic dropdown references trigger "${source}", which does not exist`);
          }
        }
      }
    }
  }

  if (definition.version && packageJson?.version && definition.version !== packageJson.version) {
    add("warning", "version", `definition version ${definition.version} != package.json version ${packageJson.version}`);
  }

  const coreDep: string | undefined = packageJson?.dependencies?.["zapier-platform-core"];
  if (definition.platformVersion && coreDep) {
    const wanted = String(definition.platformVersion).replace(/^[^\d]*/, "");
    const declared = coreDep.replace(/^[^\d]*/, "");
    if (wanted !== declared) {
      add(
        "warning",
        "platformVersion",
        `definition platformVersion ${definition.platformVersion} != zapier-platform-core dependency ${coreDep}`,
      );
    }
  }

  if (!definition.authentication) {
    add("info", "authentication", "no authentication block (fine for auth-less integrations)");
  } else if (!definition.authentication.connectionLabel) {
    add("warning", "authentication", "missing connectionLabel — users can't tell their connected accounts apart");
  }

  return findings;
}

export interface LintReport {
  errors: number;
  warnings: number;
  infos: number;
  findings: Finding[];
}

export function toReport(findings: Finding[]): LintReport {
  const rank = { error: 0, warning: 1, info: 2 } as const;
  const sorted = [...findings].sort((a, b) => rank[a.severity] - rank[b.severity]);
  return {
    errors: findings.filter((f) => f.severity === "error").length,
    warnings: findings.filter((f) => f.severity === "warning").length,
    infos: findings.filter((f) => f.severity === "info").length,
    findings: sorted,
  };
}
