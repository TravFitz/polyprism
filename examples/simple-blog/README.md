# simple-blog example

A minimal Prisma schema showing OmniPrism's zero-config defaults using the
**ts-type** pattern (`export type X = { ... };` rather than `export interface`).

- **3 models**: `User`, `Post`, `Comment`
- **1 enum**: `PostStatus`
- **No annotations** — everything runs on defaults
- **Pattern**: `omniprism-ts-type`

## Run

```bash
pnpm install         # from the repo root
pnpm -F omniprism-example-simple-blog generate
```

Generated files appear in `generated/`:

```
generated/
├── enums/
│   └── PostStatus.ts
├── User.ts
├── Post.ts
├── Comment.ts
└── index.ts
```
