export interface CommentAuthor {
  id: string;
  email: string;
  name?: string | null;
  avatar_url?: string | null;
}

export interface Comment {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  author: CommentAuthor;
  created_at: string;
  updated_at: string;
}

export interface CreateCommentInput {
  body: string;
}
