// Collects PHP `use` statements during model rendering.
//
// Same idea as the TS ImportCollector, but PHP namespacing is different
// enough that the two collectors don't share code:
//
//   - In PHP, every class reference can either be the FQN written inline
//     (`\Generated\Enums\Role`) or a short name backed by a `use` statement
//     at the top of the file (`use Generated\Enums\Role;` → `Role`).
//   - There's no type-vs-value distinction — PHP doesn't have a separate
//     type-only import syntax, and an unused `use` is just dead code.
//   - The current file's own namespace is excluded automatically: classes
//     in the same namespace are referenceable without a `use` statement.
//
// The collector tracks a single bag of FQNs; render() emits the sorted
// `use` block. Same-namespace references skip the collector entirely
// (they're emitted bare and never need a use).

export class UseCollector {
  private readonly uses = new Set<string>();
  private readonly currentNamespace: string;

  constructor(currentNamespace: string) {
    this.currentNamespace = currentNamespace;
  }

  /**
   * Register a class reference. `fqn` is the fully-qualified name without a
   * leading backslash: e.g. `"Generated\\Enums\\Role"`. If the class is
   * in the current namespace, this is a no-op — short-name references
   * resolve in-namespace without a use statement.
   *
   * Returns the short name that callers should emit at the use site.
   */
  add(fqn: string): string {
    const shortName = extractShortName(fqn);
    const ns = extractNamespace(fqn);
    if (ns === this.currentNamespace) return shortName;
    this.uses.add(fqn);
    return shortName;
  }

  /**
   * Render the accumulated `use` statements. Sorted lexicographically — the
   * widely-used Symfony convention groups by depth then alphabetises within
   * each group, but a simple alpha sort is good enough for v0 and matches
   * what most PHP-CS tools normalise to anyway.
   */
  render(): string {
    if (this.uses.size === 0) return "";
    const lines = [...this.uses].sort().map((fqn) => `use ${fqn};`);
    return `${lines.join("\n")}\n\n`;
  }
}

function extractShortName(fqn: string): string {
  const lastSlash = fqn.lastIndexOf("\\");
  return lastSlash === -1 ? fqn : fqn.slice(lastSlash + 1);
}

function extractNamespace(fqn: string): string {
  const lastSlash = fqn.lastIndexOf("\\");
  return lastSlash === -1 ? "" : fqn.slice(0, lastSlash);
}
