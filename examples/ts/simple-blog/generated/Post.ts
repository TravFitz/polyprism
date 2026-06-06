import type { Comment } from "./Comment.js";
import type { PostStatus } from "./enums/PostStatus.js";
import type { User } from "./User.js";

export type Post = {
  id: string;
  title: string;
  content: string;
  status: PostStatus;
  authorId: string;
  author: User;
  comments: Comment[];
  createdAt: Date;
  updatedAt: Date;
};
