# complex-ecommerce example

A schema designed to exercise **every** PolyPrism feature in one place.

## What's in here

- **All scalar types**: String, Int, BigInt, Float, Decimal, DateTime, Json, Boolean
- **All 4 `@json` forms**:
  - Bare reference (`@json(SeoMeta)`)
  - With-path reference (`@json(ProductAttributes from "./types/product-attributes")`)
  - Inline anonymous (`@json({...})` — auto-named as `OrderMetadata`)
  - Inline named (`@json(LineItemSnapshot = {...})`)
- **`@hide`**: on fields (`Customer.internalToken`, `AuditLog.rawIp`)
- **`@deprecated`**: on enum values, fields, and models (with reasons)
- **`@name`**: renaming a lowercase `enum status` to `OrderStatus`
- **`@type`**: overriding an inferred field type
- **Self-referential relation**: `Product.parent` ↔ `Product.variants`
- **Multiple relations** between same models: `Customer` → `Address`, `Customer` → `Order`
- **`@db.*` native types**: precision-controlled `Decimal`, `VarChar(2)` country codes
- **Composite uniques + indexes**: `Address.@@unique([customerId, streetLine1, postalCode])`, `Order.@@index(...)`

## Run

```bash
pnpm install         # from the repo root
pnpm -F polyprism-example-complex-ecommerce generate
```

Generated files appear in `generated/`:

```
generated/
├── enums/
│   ├── Currency.ts
│   ├── FulfilmentMethod.ts      (LEGACY_COURIER hidden via @hide)
│   ├── OrderStatus.ts           (renamed from `status` via @name)
│   └── ProductCategory.ts
├── json-types/
│   ├── AuditPayload.ts
│   ├── LineItemSnapshot.ts
│   └── OrderMetadata.ts
├── Customer.ts
├── Address.ts
├── Order.ts
├── OrderItem.ts
├── Product.ts
├── AuditLog.ts
├── LegacyAnalyticsSnapshot.ts   (emitted but JSDoc warns about deprecation)
└── index.ts
```
