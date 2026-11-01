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
    <div className="space-y-4 pt-4 border-t border-slate-800" data-testid="comment-section">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
          <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
          <span>Comments ({comments.length})</span>
        </h3>
      </div>

      {/* Comment List */}
      {isLoading ? (
        <div className="py-6 flex flex-col items-center justify-center gap-2 text-slate-400">
          <LoadingSpinner size="sm" />
          <span className="text-xs">Loading comments...</span>
        </div>
      ) : error ? (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Failed to load comments</span>
        </div>
      ) : comments.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-500 italic bg-slate-950/20 rounded-xl border border-slate-800/40">
          No comments yet. Start the conversation!
        </div>
      ) : (
        <div className="space-y-3 max-h-60 overflow-y-auto pr-1" data-testid="comment-list">
          {comments.map((comment) => (
            <div
              key={comment.id}
              className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-1.5"
              data-testid={`comment-item-${comment.id}`}
            >
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-300 flex items-center justify-center text-[10px] font-bold">
                    {comment.author.name
                      ? comment.author.name[0].toUpperCase()
                      : comment.author.email[0].toUpperCase()}
                  </div>
                  <span className="font-medium text-slate-200">
                    {comment.author.name || comment.author.email}
                  </span>
                </div>
                <span className="text-[11px] text-slate-500">
                  {formatTimestamp(comment.created_at)}
                </span>
              </div>
              <p className="text-xs text-slate-300 whitespace-pre-wrap pl-7">
                {comment.body}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Add Comment Form */}
      <form onSubmit={handleSubmit} className="space-y-2 pt-2" data-testid="add-comment-form">
        {validationError && (
          <p className="text-xs text-rose-400">{validationError}</p>
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
            className="w-full px-3 py-2 pr-12 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            data-testid="comment-input"
          />
          <button
            type="submit"
            disabled={createMutation.isPending || !commentBody.trim()}
            className="absolute right-2.5 bottom-3.5 p-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 transition-colors"
            title="Post comment"
            data-testid="submit-comment-button"
          >
            {createMutation.isPending ? (
              <LoadingSpinner size="sm" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
