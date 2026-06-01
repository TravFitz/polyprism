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
  /**
   * Story points. Int default(0) — emits as `points: number = 0`.
   * NOT as `Date.parse("0")` (that was the prisma-class-generator bug).
   */
  points: number = 0;
  completed: boolean = false;
  dueAt: Date | null = null;
  projectId!: string;
  project!: Project;
  assigneeId: string | null = null;
  assignee: User | null = null;
  /**
   * Lists always default to an empty array in class mode — Prisma never
   * returns null for a list field.
   */
  tags: string[] = [];
  createdAt!: Date;
  updatedAt!: Date;
}
