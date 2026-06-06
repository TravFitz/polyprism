import { Role } from "./enums/Role.js";
import type { Project } from "./Project.js";
import type { Task } from "./Task.js";

export class User {
  id!: string;
  email!: string;
  displayName!: string;
  role: Role = Role.CONTRIBUTOR;
  active: boolean = true;
  joinedAt!: Date;
  ownedProjects: Project[] = [];
  assignedTasks: Task[] = [];
}
