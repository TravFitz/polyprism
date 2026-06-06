import type { Post } from "./Post.js";
import type { User } from "./User.js";

export type Comment = {
  id: string;
  content: string;
  postId: string;
  post: Post;
  authorId: string;
  author: User;
  createdAt: Date;
};
