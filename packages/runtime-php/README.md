# polyprism/runtime

Runtime helpers for PolyPrism's PHP **domain-class** emitter. Provides the `Coerce` and `Normalise` utilities that generated property-hook setters call into.

> You only need this package if you use [`@polyprism/php-domain-class`](https://github.com/TravFitz/polyprism/tree/main/packages/php-domain-class). The other PHP generators (`@polyprism/php-class`, `@polyprism/php-readonly`) emit code with zero runtime dependencies.

## Requirements

- PHP **8.4** or later (property hooks are the load-bearing feature; there's no point targeting older PHP)
- No third-party dependencies

## Install

```bash
composer require polyprism/runtime
```

The PolyPrism PHP domain-class generator emits `use Polyprism\Runtime\Coerce;` and `use Polyprism\Runtime\Normalise;` at the top of each model file — Composer's PSR-4 autoloader wires them up.

## What's in the box

### `Polyprism\Runtime\Coerce`

Static methods that mirror `@polyprism/runtime`'s coerce primitives. Each accepts a widened input type, returns the canonical PHP type, and throws `\TypeError` with the field path on invalid input.

| Method                                            | Returns               |
| ------------------------------------------------- | --------------------- |
| `Coerce::int(int\|string $v, string $path)`       | `int`                 |
| `Coerce::float(float\|int\|string $v, string $p)` | `float`               |
| `Coerce::bigint(int\|string $v, string $path)`    | `int` (64-bit signed) |
| `Coerce::date(...mixed $v, string $path)`         | `\DateTimeImmutable`  |
| `Coerce::decimal(...mixed $v, string $path)`      | `string`              |

Notes:

- **Bigint maps to `int`** because PHP `int` is 64-bit signed on every supported platform. Strings outside `[PHP_INT_MIN, PHP_INT_MAX]` are rejected (not silently truncated). If you need arbitrary precision, annotate the field with `@type(...)` to point at a userland `BigInteger` class.
- **Decimal returns `string`** because PHP has no native decimal type. The method validates that the input is numerically shaped; float inputs are formatted with `%.17g` to preserve IEEE-754 round-trip precision.
- **Date strings** flow through `new \DateTimeImmutable($value)` (accepts ISO 8601, RFC 2822, English textual datetime). Int inputs are treated as Unix timestamps.

Error messages line up with the JS runtime's format:

```
TypeError: Cannot coerce "abc" to int for User.points
```

### `Polyprism\Runtime\Normalise`

```php
Normalise::apply(string $value, array $ops): string
Normalise::applyNullable(?string $value, array $ops): ?string
```

Ops are class constants (use these in generated code, not raw strings):

- `Normalise::TRIM`
- `Normalise::LOWERCASE`
- `Normalise::UPPERCASE`
- `Normalise::NULL_EMPTY_TO_NULL` *(only meaningful on `applyNullable`)*

Ops are applied in declared order. `apply` ignores `NULL_EMPTY_TO_NULL` (it's only meaningful on the nullable path).

## Versioning

`polyprism/runtime` (Composer / Packagist) and `@polyprism/runtime` (npm) are versioned independently — they target different language runtimes and don't share code. The PHP package's floor is PHP 8.4 and will float upward as new PHP versions land useful features. The npm runtime targets Node 22+ and follows the same float-the-floor policy.

## License

MIT
