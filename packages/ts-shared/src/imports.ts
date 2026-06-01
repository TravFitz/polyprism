// Collects imports during rendering, deduplicates, and emits a sorted import
// block at the top of each generated file.
//
// Most names emitted by OmniPrism are used purely as types (interfaces, type
// aliases, type annotations on class fields). A handful are used as runtime
// values — most notably enum defaults in class mode, where the class body
// contains `field: Status = Status.PENDING`. We track type-vs-value usage
// per (module, name) so we can:
//
//   - Emit `import type { ... }` when every name from a module is type-only.
//   - Emit `import { type A, B }` when a module has mixed usage.
//
// This plays nicely with `verbatimModuleSyntax`, which is on in tsconfig.base.

export class ImportCollector {
  private readonly imports = new Map<string, Map<string, "type" | "value">>();

  /** Add a type-only named import. Promotes to value if already a value. */
  add(moduleSpecifier: string, name: string): void {
    this.upsert(moduleSpecifier, name, "type");
  }

  /** Add a runtime-value named import. Overrides any prior type-only entry. */
  addValue(moduleSpecifier: string, name: string): void {
    this.upsert(moduleSpecifier, name, "value");
  }

  private upsert(moduleSpecifier: string, name: string, kind: "type" | "value"): void {
    let map = this.imports.get(moduleSpecifier);
    if (!map) {
      map = new Map();
      this.imports.set(moduleSpecifier, map);
    }
    // Once a name is needed as a value, it must stay a value — a type-only
    // promotion to value is a one-way ratchet within a single file.
    if (kind === "value" || !map.has(name)) {
      map.set(name, kind);
    }
  }

  /**
   * Render the accumulated imports as a block. Two-tier sort:
   *   1. Node built-ins + external packages (alphabetical)
   *   2. Relative imports (`./...` and `../...`) (alphabetical)
   * Matches the standard eslint-plugin-import convention.
   */
  render(): string {
    if (this.imports.size === 0) return "";
    const lines: string[] = [];
    const sortedModules = [...this.imports.keys()].sort(compareModuleSpecifiers);
    for (const moduleSpecifier of sortedModules) {
      const entries = [...this.imports.get(moduleSpecifier)!.entries()].sort(([a], [b]) =>
        a.localeCompare(b),
      );
      const allTypeOnly = entries.every(([, kind]) => kind === "type");
      if (allTypeOnly) {
        const names = entries.map(([name]) => name).join(", ");
        lines.push(`import type { ${names} } from "${moduleSpecifier}";`);
      } else {
        const namesWithMarkers = entries
          .map(([name, kind]) => (kind === "type" ? `type ${name}` : name))
          .join(", ");
        lines.push(`import { ${namesWithMarkers} } from "${moduleSpecifier}";`);
      }
    }
    return `${lines.join("\n")}\n\n`;
  }
}

function compareModuleSpecifiers(a: string, b: string): number {
  const aIsRelative = a.startsWith("./") || a.startsWith("../");
  const bIsRelative = b.startsWith("./") || b.startsWith("../");
  if (aIsRelative !== bIsRelative) return aIsRelative ? 1 : -1;
  return a.localeCompare(b);
}
