import type { ProjectSettings } from "./json-types/ProjectSettings.js";
import type { Task } from "./Task.js";
import type { User } from "./User.js";

export class Project {
  id!: string;
  name!: string;
  slug!: string;
  description: string | null = null;
  archived: boolean = false;
  /**
   * Daily target velocity, in story points.
   */
  velocity: number = 20;
  /**
   * Project accent colour. Demonstrates a String literal default.
   */
  colorHex: string = "#6366f1";
  /**
   * Inline-named JSON type — emits to json-types/ProjectSettings.ts and is
   * imported as `import type { ProjectSettings } from "./json-types/...";`.
   */
  settings: ProjectSettings | null = null;
  ownerId!: string;
  owner!: User;
  tasks: Task[] = [];
  createdAt!: Date;
}
