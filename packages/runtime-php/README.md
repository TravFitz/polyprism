# polyprism/runtime

Runtime helpers for PolyPrism's PHP **domain-class** emitter. Provides the `Coerce` and `Normalise` utilities that generated property-hook setters call into — and which you can also use directly in hand-written PHP for boundary-input normalisation.

> Primarily designed to back [`@polyprism/php-domain-class`](https://github.com/TravFitz/polyprism/tree/main/packages/php-domain-class)'s generated code. The other PHP generators (`@polyprism/php-class`, `@polyprism/php-readonly`) emit code with zero runtime dependencies — they don't need this package.

## Requirements

- **PHP 8.1 or later** for the runtime itself (`Coerce` + `Normalise` use only PHP 8.0-era syntax: union types, `final` classes, untyped class constants)
- No third-party dependencies

**If you're using `@polyprism/php-domain-class`-generated code:** that generated code uses PHP 8.4 **property hooks** (`public int $x { set(...) { ... } }`) and so requires PHP 8.4+ to run. But the runtime itself is broadly compatible — meaning you can `composer require polyprism/runtime` from a Magento 2.4+, Symfony 6+, or Laravel 10+ project today and use `Coerce::int(...)` / `Normalise::apply(...)` directly in hand-written classes, even if you can't yet adopt the generator's output.

## Install

```bash
composer require polyprism/runtime
```

The PolyPrism PHP domain-class generator emits `use Polyprism\Runtime\Coerce;` and `use Polyprism\Runtime\Normalise;` at the top of each model file — Composer's PSR-4 autoloader wires them up. For hand-written usage, import the same way.

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

`polyprism/runtime` (Composer / Packagist) and `@polyprism/runtime` (npm) are versioned independently — they target different language runtimes and don't share code. The PHP package's floor is PHP 8.1 (broad Magento/Symfony/Laravel compatibility) and will float upward only when a new PHP feature meaningfully improves the runtime's contract. The npm runtime targets Node 22+ and follows the same float-the-floor policy.

### Hand-written usage example

```php
<?php

declare(strict_types=1);

use Polyprism\Runtime\Coerce;
use Polyprism\Runtime\Normalise;

final class OrderQuoteRequest
{
    public int $totalCents;
    public string $email;
    public \DateTimeImmutable $requestedAt;

    public function __construct(int|string $totalCents, string $email, \DateTimeImmutable|string|int $requestedAt)
    {
        // Boundary normalisation happens once at construction — no
        // property hooks required, no PHP 8.4 dependency.
        $this->totalCents = Coerce::int($totalCents, 'OrderQuoteRequest.totalCents');
        $this->email = Normalise::apply($email, [Normalise::TRIM, Normalise::LOWERCASE]);
        $this->requestedAt = Coerce::date($requestedAt, 'OrderQuoteRequest.requestedAt');
    }
}

// Stringified ints, dirty emails, ISO date strings — all flow in cleanly:
$req = new OrderQuoteRequest('12500', '  ADA@EXAMPLE.COM  ', '2026-06-08T12:00:00Z');
```

This is the pattern Magento module authors / Symfony service constructors / Laravel form-request handlers can adopt on PHP 8.1 today, without waiting for property-hook adoption to land in their framework.

## License

MIT
