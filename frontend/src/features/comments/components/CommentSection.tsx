import React, { useState } from 'react';
import { useComments, useCreateCommentMutation } from '../useComments';
import { LoadingSpinner } from '../../../shared/ui/LoadingSpinner';
import { MessageSquare, Send, AlertCircle } from 'lucide-react';

export interface CommentSectionProps {
  taskId: string;
}

export const CommentSection: React.FC<CommentSectionProps> = ({ taskId }) => {
  const [commentBody, setCommentBody] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const { data, isLoading, error } = useComments(taskId);
  const createMutation = useCreateCommentMutation(taskId);

  const comments = data?.comments || [];

  const formatTimestamp = (dateStr: string) => {
    return new Date(dateStr).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = commentBody.trim();
    if (!trimmed) {
      setValidationError('Comment cannot be empty');
      return;
    }
    if (trimmed.length > 5000) {
      setValidationError('Comment cannot exceed 5000 characters');
      return;
    }

    setValidationError(null);
    try {
      await createMutation.mutateAsync({ body: trimmed });
      setCommentBody('');
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Failed to post comment');
    }
  };

  return (
    <div className="space-y-3.5 pt-4 border-t border-line" data-testid="comment-section">
      <div className="flex items-center justify-between">
        <h3 className="text-2xs font-semibold text-muted uppercase tracking-wider flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5 text-accent" />
          <span>Comments ({comments.length})</span>
        </h3>
      </div>

      {/* Comment List */}
      {isLoading ? (
        <div className="py-6 flex flex-col items-center justify-center gap-2 text-muted">
          <LoadingSpinner size="sm" />
          <span className="text-xs">Loading comments...</span>
        </div>
      ) : error ? (
        <div className="p-3 rounded-md bg-danger-soft border border-danger/25 text-danger text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Failed to load comments</span>
        </div>
      ) : comments.length === 0 ? (
        <div className="py-6 text-center text-2xs text-muted italic bg-subtle/40 rounded-md border border-line">
          No comments yet. Start the conversation!
        </div>
      ) : (
        <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1" data-testid="comment-list">
          {comments.map((comment) => (
            <div
              key={comment.id}
              className="p-3 rounded-md bg-subtle/50 border border-line space-y-1.5"
              data-testid={`comment-item-${comment.id}`}
            >
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-surface border border-line text-ink flex items-center justify-center text-2xs font-bold">
                    {comment.author.name
                      ? comment.author.name[0].toUpperCase()
                      : comment.author.email[0].toUpperCase()}
                  </div>
                  <span className="font-medium text-ink">
                    {comment.author.name || comment.author.email}
                  </span>
                </div>
                <span className="text-2xs text-muted font-mono">
                  {formatTimestamp(comment.created_at)}
                </span>
              </div>
              <p className="text-xs text-ink-2 whitespace-pre-wrap pl-7">
                {comment.body}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Add Comment Form */}
      <form onSubmit={handleSubmit} className="space-y-2 pt-2" data-testid="add-comment-form">
        {validationError && (
          <p className="text-2xs text-danger">{validationError}</p>
        )}
        <div className="relative">
          <textarea
            value={commentBody}
            onChange={(e) => {
              setCommentBody(e.target.value);
              if (validationError) setValidationError(null);
            }}
            placeholder="Write a comment..."
            rows={2}
            className="w-full px-3 py-2 pr-12 rounded-md bg-surface border border-line text-xs text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent resize-none"
            data-testid="comment-input"
          />
          <button
            type="submit"
            disabled={createMutation.isPending || !commentBody.trim()}
            className="absolute right-2 bottom-2.5 p-1.5 rounded-md bg-ink text-surface hover:bg-ink/90 active:bg-ink disabled:opacity-40 transition-colors"
            title="Post comment"
            data-testid="submit-comment-button"
          >
            {createMutation.isPending ? (
              <LoadingSpinner size="sm" className="text-surface" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
