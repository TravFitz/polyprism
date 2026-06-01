import type { Comment } from "./Comment.js";
import type { Post } from "./Post.js";

export type User = {
  id: string;
  email: string;
  name: string;
  bio: string | null;
  createdAt: Date;
  posts: Post[];
  comments: Comment[];
};
