# ts-domain-class-showcase example

A billing/orders Prisma schema exercising every behaviour of the
**ts-domain-class** pattern (`export class User { #id!: string; get id() ... }`
with private fields, getter/setter accessors, and a setter pipeline that
fires `@coerce` and `@normalise` on assignment).

- **5 models**: `Customer`, `Order`, `OrderItem`, `Product`, `Address`
- **2 enums**: `CustomerTier`, `OrderStatus`
- **Every default-coerce scalar** — Int, Float, BigInt, Decimal, DateTime
- **Every `@normalise` op** — `trim`, `lowercase`, `uppercase`, `nullEmptyToNull`
- **`@noCoerce`** opts a default-coerce field out (`internalSeq`)
- **`@coerce(target)`** opts a strict field in (`legacyExternalId` String → string coercion path)
- **Inline `@json`** generates a typed value class under `json-types/`
- **Relations**: 1-to-1 (Customer ↔ Address), 1-to-many (Customer ↔ Order), self-reference (Order.parentOrder)
- **Pattern**: `polyprism-ts-domain-class`

## Run

```bash
pnpm install         # from the repo root
pnpm -F polyprism-example-ts-domain-class-showcase generate
```

Generated files appear in `generated/` and are committed to git — diff
schema changes against emitted code without running the generator yourself.

The integration test at `packages/ts-domain-class/tests/integration.test.ts`
imports from this directory and exercises the full setter pipeline against
real values (stringified Ints coerce, dirty emails normalise, JSON shapes
hydrate). If you change the schema, both the generated output AND the
integration test may need updating in lockstep.
