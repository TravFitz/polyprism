# @polyprism/php-class

Prisma 6 & 7 generator that emits **PHP 8.1+ classes** from your `schema.prisma`. Public typed properties via constructor property promotion. Part of [PolyPrism](https://github.com/TravFitz/polyprism).

```prisma
generator polyprismCodegen {
  provider = "polyprism-php-class"
  output   = "../src/Generated"
}
```

That's the whole API. Pair it with a composer.json psr-4 mapping and you're done:

```json
{
  "autoload": {
    "psr-4": { "Generated\\": "src/Generated/" }
  }
}
```

**Verified Composer-compliant.** Every emitted file passes `composer dump-autoload --strict-psr` with zero warnings — PolyPrism's CI runs that check on every push, alongside `php -l` for syntax and a drift check against the committed showcase output. No surprises when you wire it into your project.

## What it emits

```php
<?php

declare(strict_types=1);

namespace Generated\Models;

use Generated\Enums\Role;

final class User
{
    public function __construct(
        public string $id,
        public string $email,
        public ?string $name = null,
        public Role $role = Role::MEMBER,
        public \DateTimeImmutable $createdAt = new \DateTimeImmutable(),
    ) {}
}
```

Files land at:

- `<outputDir>/Models/<ClassName>.php` — one per Prisma model
- `<outputDir>/Enums/<EnumName>.php` — PHP 8.1+ backed enums

## Why a separate package for plain classes

The PHP class shape is the natural mutable counterpart to TypeScript's `ts-class`. Public typed properties + constructor property promotion is the canonical PHP 8 shorthand for "DTO with no setter logic", and it's the right default when you want to:

- Hydrate from request payloads or DB rows without ceremony.
- Mutate fields in place (e.g. updating a status before saving).
- Round-trip cleanly through `json_encode` / `json_decode`.

If you want immutability (value objects), use [`@polyprism/php-readonly`](https://www.npmjs.com/package/@polyprism/php-readonly) instead — same shape, but the class is marked `readonly` and properties can't be reassigned after construction.

For setter-driven `@normalise` / `@coerce` data laundering (the PHP analog of `ts-domain-class`), wait for `@polyprism/php-domain-class` — that'll need PHP 8.4 property hooks and a Composer-published runtime.

## Type mapping

| Prisma | PHP | Notes |
|---|---|---|
| `String` | `string` | |
| `Int` | `int` | |
| `Float` | `float` | |
| `Boolean` | `bool` | |
| `DateTime` | `\DateTimeImmutable` | Always immutable — `\DateTime` is foot-bullet API |
| `BigInt` | `int` | PHP `int` is 64-bit on every modern target. Set `@type("string", ...)` if you need values beyond `PHP_INT_MAX` |
| `Decimal` | `string` | No native arbitrary-precision decimal in PHP — use `brick/math` or BCMath at the consumer |
| `Json` | `mixed` | Inline `@json({ ... })` / `@json(Name = { ... })` generates a typed value class — see [JSON value classes](#json-value-classes). Bare and with-path forms warn + fall back to `mixed` |
| `Bytes` | `string` | PHP convention for binary data |
| Enums | `EnumName` | Emits as PHP 8.1+ backed enum (`enum X: string`) |
| Relations | `ClassName` | Cross-namespace targets get a `use` statement |
| `Type?` | `?Type` | PHP nullable shorthand |
| `Type[]` | `array` | With PHPDoc `@var array<int, Type>` for static analysers |

## Annotation support

| Annotation | Behaviour |
|---|---|
| `@hide` | Field omitted from the class body |
| `@deprecated("reason")` | PHPDoc `@deprecated` tag |
| `@name(NewName)` | Renames the class / property identifier |
| `@type("\\Brick\\Math\\BigDecimal")` | Overrides the PHP type expression verbatim |
| `@coerce` / `@normalise` / `@noCoerce` | Recognised but ignored (deferred to `php-domain-class`) |
| `@json({ ... })` / `@json(Name = { ... })` | Generates a `final readonly class` under `JsonTypes/` and types the field as that class — see [JSON value classes](#json-value-classes) |
| `@json(SomeType)` / `@json(SomeType from "./path")` | Warning + falls back to `mixed`. TS module imports don't translate to PHP; use `@type` instead |

## JSON value classes

Inline `@json` shapes generate a typed PHP class under `JsonTypes/`:

```prisma
/// @json(ShippingDetails = { carrier: string, tracking?: string, address: { line1: string, city: string }, tags: string[] })
shipping Json
```

```php
// Generated/JsonTypes/ShippingDetails.php
final readonly class ShippingDetails
{
    public function __construct(
        public string $carrier,
        /** @var array{line1: string, city: string} */
        public array $address,
        /** @var array<int, string> */
        public array $tags,
        public ?string $tracking = null,
    ) {}
}
```

**TS → PHP type mapping** inside @json shapes:

| TS | PHP | PHPDoc enhancement |
|---|---|---|
| `string` | `string` | — |
| `number` | `float` | — (PHP `float` accepts ints by widening) |
| `boolean` | `bool` | — |
| `unknown` / `any` | `mixed` | — |
| `T[]` (primitive `T`) | `array` | `@var array<int, T>` |
| `{ k: T, ... }` (nested) | `array` | `@var array{k: T, ...}` |
| `name?: type` (optional) | `?type = null` | — |

**Unsupported in v0** — warns + falls back to `mixed`:

- Unions (`string | number`)
- Generics (`Record<K, V>`, `Map<K, V>`, etc.)
- Identifier references inside an inline shape (`{ items: SomeOtherType }`)
- Tuples, intersections, discriminated unions

For richer typing, use `@type("\\App\\YourType")` to point at a hand-written PHP class.

The generated value class is **always `readonly`** regardless of whether the parent model is `php-class` or `php-readonly`. JSON blobs are value-object-shaped by nature — you swap the whole object, you don't scribble on individual fields.

Files land under `<outputDir>/JsonTypes/<Name>.php` with the namespace `Generated\JsonTypes` by default. Configurable via the `jsonTypesNamespace` option when wiring `emitPhpModels` directly.

## Defaults

PHP defaults are emitted where they're statically representable:

- Literal scalars (`String`, `Int`, `Float`, `Boolean`)
- Enum cases (`Role::MEMBER`)
- `@default(now())` becomes `new \DateTimeImmutable()`
- Lists default to `[]`
- Nullable scalars without an explicit Prisma default get `= null`

Unrepresentable defaults — `cuid()`, `uuid()`, `autoincrement()`, `@default(dbgenerated(...))` — produce a required constructor argument. Prisma assigns these at insert time, so the consumer either lets Prisma fill them or provides them explicitly.

## Constructor argument ordering

Required parameters come first, optional (defaulted) parameters second. Within each group, schema field order is preserved. This avoids PHP 8.4's deprecation warning for optional-before-required parameters and is idiomatic PHP — named-argument callers are unaffected; positional callers get a stable required-first ordering.

## Why `final`?

Every generated class is marked `final`. That's deliberate: a generated DTO is regenerated every time the schema changes, and a hand-written subclass that depends on the parent's shape silently breaks whenever a field is renamed, removed, or retyped. `final` makes that contract enforceable at the language level instead of hoping nobody opens the door.

If you need domain logic on top of the generated DTO, the supported pattern is **composition over inheritance** — wrap the generated class:

```php
final class UserDomain
{
    public function __construct(
        public readonly User $dto,
        // ... domain-only state
    ) {}

    public function isActive(): bool
    {
        return $this->dto->active && $this->dto->loyaltyPoints > 0;
    }
}
```

Or add domain methods to a separate service class that accepts the DTO as a parameter. Both patterns survive schema regeneration without breakage.

## JSON encoding caveat (`\DateTimeImmutable`)

`json_encode($model)` walks the public typed properties of the generated class out of the box — strings, ints, floats, bools, enums (via their backing string), nested JsonType classes, and arrays all serialise to the natural wire shape. **The one ugly default is `\DateTimeImmutable`**: PHP serialises it as its verbose internal representation, not ISO 8601:

```php
$customer = new Customer(/* ... */);
echo json_encode($customer);
// {"id":"cust_1","email":"...","createdAt":{"date":"2026-06-05 06:13:25.097341","timezone_type":3,"timezone":"UTC"},...}
```

That shape is rarely what you want on the wire. The cleanest workaround for v0 is to implement `JsonSerializable` on a thin consumer-side wrapper that formats the `DateTimeImmutable` fields explicitly:

```php
final class CustomerWire implements JsonSerializable {
    public function __construct(public readonly Customer $dto) {}

    public function jsonSerialize(): array {
        return [
            'id' => $this->dto->id,
            'email' => $this->dto->email,
            'createdAt' => $this->dto->createdAt->format(\DATE_ATOM), // ISO 8601
            // ...
        ];
    }
}

echo json_encode(new CustomerWire($customer));
// {"id":"cust_1","email":"...","createdAt":"2026-06-05T06:13:25+00:00",...}
```

A future v0.2.x may emit `JsonSerializable::jsonSerialize()` on the generated class with an ISO-8601 default for DateTime fields — tracked as a known gap. Until then, the wrapper pattern above keeps the generated class regen-safe while letting you control the wire shape.

## Links

- [PolyPrism on GitHub](https://github.com/TravFitz/polyprism) — full feature list, annotation reference, side-by-side pattern examples
- [`@polyprism/php-readonly`](https://www.npmjs.com/package/@polyprism/php-readonly) — same shape but `final readonly class` (PHP 8.2+)
- [Issue tracker](https://github.com/TravFitz/polyprism/issues)

## License

[MIT](https://github.com/TravFitz/polyprism/blob/main/LICENSE) © Travis Fitzgerald
