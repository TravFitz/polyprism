# task-tracker example

A mid-weight Kanban-style schema that exists specifically to show off what the
**ts-class** pattern can do that interfaces and type aliases can't: emit real
initializer expressions, so you can do `new Task({ title: "ship it" })` without
filling in every field by hand.

- **3 models**: `User`, `Project`, `Task`
- **3 enums**: `TaskStatus`, `Priority`, `Role`
- **1 inline JSON type**: `ProjectSettings`
- **Pattern**: `polyprism-ts-class`
- **Index barrel**: on (`emitIndex = "true"`)

## What this example demonstrates

| Behaviour | Where in the schema | What it emits |
|---|---|---|
| `cuid()` / `now()` defaults → definite-assignment `!` | `id`, `createdAt`, `joinedAt` | `id!: string;` |
| `String` literal default | `Project.colorHex` | `colorHex: string = "#6366f1";` |
| `Int` literal default | `Project.velocity`, `Task.points` | `velocity: number = 20;` |
| `Boolean` literal default | `User.active`, `Project.archived`, `Task.completed` | `active: boolean = true;` |
| Enum-value default (mixed type/value imports) | `User.role`, `Task.status`, `Task.priority` | `import { Role }` + `role: Role = Role.CONTRIBUTOR;` |
| Nullable scalar default | `Project.description`, `Task.dueAt` | `description: string \| null = null;` |
| List default | `Task.tags`, relations | `tags: string[] = [];` |
| `@hide` strips a field | `User.passwordHash` | (omitted) |
| `@deprecated` JSDoc | `TaskStatus.WONT_DO` | `/** @deprecated use Project.archived instead */` |
| Inline-named `@json` | `Project.settings` | own file at `json-types/ProjectSettings.ts` |
| Class barrel re-export | `index.ts` | `export { User }` (no `type` keyword — class is a runtime value) |

The integer-default-Date bug in `prisma-class-generator` (an `Int @default(90)`
on a `DateTime` field got fed to `Date.parse("90")`) is fixed at the source:
PolyPrism only emits a literal default when the literal kind matches the
scalar kind. Mismatches fall through to `!` instead of fabricating a value.

## Schema

```prisma
generator polyprismCodegen {
  provider  = "polyprism-ts-class"
  output    = "../generated"
  emitIndex = "true"
}

datasource db {
  provider = "postgresql"
  // URL lives in `prisma.config.ts` (Prisma 7 layout).
  // Prisma 6 users add `url = env("DATABASE_URL")` here.
}

enum TaskStatus {
  TODO
  IN_PROGRESS
  IN_REVIEW
  DONE
  /// @deprecated("use Project.archived instead")
  WONT_DO
}

enum Priority {
  LOW
  MEDIUM
  HIGH
  URGENT
}

enum Role {
  VIEWER
  CONTRIBUTOR
  MAINTAINER
  OWNER
}

model User {
  id           String    @id @default(cuid())
  email        String    @unique
  displayName  String
  role         Role      @default(CONTRIBUTOR)
  active       Boolean   @default(true)
  joinedAt     DateTime  @default(now())

  /// @hide
  passwordHash String

  ownedProjects Project[] @relation("ProjectOwner")
  assignedTasks Task[]    @relation("TaskAssignee")
}

model Project {
  id          String   @id @default(cuid())
  name        String
  slug        String   @unique
  description String?
  archived    Boolean  @default(false)
  velocity    Int      @default(20)
  colorHex    String   @default("#6366f1")

  /// @json(ProjectSettings = { notifyOnAssign: boolean, autoCloseAfterDays: number })
  settings    Json?

  ownerId     String
  owner       User     @relation("ProjectOwner", fields: [ownerId], references: [id])

  tasks       Task[]
  createdAt   DateTime @default(now())
}

model Task {
  id          String     @id @default(cuid())
  title       String
  description String?
  status      TaskStatus @default(TODO)
  priority    Priority   @default(MEDIUM)
  points      Int        @default(0)
  completed   Boolean    @default(false)
  dueAt       DateTime?

  projectId   String
  project     Project    @relation(fields: [projectId], references: [id])

  assigneeId  String?
  assignee    User?      @relation("TaskAssignee", fields: [assigneeId], references: [id])

  tags        String[]

  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
}
```

## Run

```bash
pnpm install         # from the repo root
pnpm -F polyprism-example-ts-task-tracker generate
```

Generated files appear in `generated/`:

```
generated/
├── enums/
│   ├── Priority.ts
│   ├── Role.ts
│   └── TaskStatus.ts
├── json-types/
│   └── ProjectSettings.ts
├── User.ts
├── Project.ts
├── Task.ts
└── index.ts
```

## Sample output

`generated/Task.ts`:

```ts
import { Priority } from "./enums/Priority.js";
import { TaskStatus } from "./enums/TaskStatus.js";
import type { Project } from "./Project.js";
import type { User } from "./User.js";

export class Task {
  id!: string;
  title!: string;
  description: string | null = null;
  status: TaskStatus = TaskStatus.TODO;
  priority: Priority = Priority.MEDIUM;
  points: number = 0;
  completed: boolean = false;
  dueAt: Date | null = null;
  projectId!: string;
  project!: Project;
  assigneeId: string | null = null;
  assignee: User | null = null;
  tags: string[] = [];
  createdAt!: Date;
  updatedAt!: Date;
}
```

Note the mixed import on lines 1–4: `Priority` and `TaskStatus` come in as
runtime values (no `type` keyword) because they're referenced as
`Priority.MEDIUM` / `TaskStatus.TODO` in the initializers. `Project` and
`User` are type-only because they only appear in type positions.

## Using it

```ts
import { Task, TaskStatus, Priority } from "./generated/index.js";

const t = new Task();
t.title = "Wire up the PolyPrism CI matrix";
t.status = TaskStatus.IN_PROGRESS;
t.priority = Priority.HIGH;
// id / createdAt / updatedAt come from Prisma at insert time — left as `!`.
```
