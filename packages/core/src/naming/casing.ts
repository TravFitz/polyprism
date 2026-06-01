// Pure casing transformations. No external state, no IR awareness.
//
// Word boundary detection:
//   - camelCase: `createdAt` → ["created", "At"]
//   - PascalCase + acronym: `HTMLParser` → ["HTML", "Parser"]
//   - snake_case / kebab-case: `created_at`, `created-at` → ["created", "at"]
//   - SCREAMING_SNAKE: `LEGACY_VALUE` → ["LEGACY", "VALUE"]

const ACRONYM_BOUNDARY = /([A-Z]+)([A-Z][a-z])/g;
const CAMEL_BOUNDARY = /([a-z0-9])([A-Z])/g;
const SEPARATOR = /[_\-\s]+/;

export function splitWords(input: string): readonly string[] {
  if (input.length === 0) return [];
  return input
    .replace(ACRONYM_BOUNDARY, "$1 $2")
    .replace(CAMEL_BOUNDARY, "$1 $2")
    .split(SEPARATOR)
    .filter((s) => s.length > 0);
}

function capitalize(word: string): string {
  if (word.length === 0) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function toPascalCase(input: string): string {
  return splitWords(input).map(capitalize).join("");
}

export function toCamelCase(input: string): string {
  const words = splitWords(input);
  if (words.length === 0) return "";
  const [first, ...rest] = words;
  return first!.toLowerCase() + rest.map(capitalize).join("");
}

export function toSnakeCase(input: string): string {
  return splitWords(input)
    .map((w) => w.toLowerCase())
    .join("_");
}

export function toKebabCase(input: string): string {
  return splitWords(input)
    .map((w) => w.toLowerCase())
    .join("-");
}
