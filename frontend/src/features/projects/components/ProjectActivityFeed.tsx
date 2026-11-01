import React, { useState } from 'react';
import { useProjectActivities } from '../useProjects';
import { ActivityItem } from '../types';
import { LoadingSpinner } from '../../../shared/ui/LoadingSpinner';
import {
  Activity,
  PlusCircle,
  ArrowRightCircle,
  UserPlus,
  UserMinus,
  MessageSquare,
  Trash2,
  Calendar,
  Flag,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export interface ProjectActivityFeedProps {
  projectId: string;
}

const PAGE_SIZE = 20;

export const ProjectActivityFeed: React.FC<ProjectActivityFeedProps> = ({ projectId }) => {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useProjectActivities(projectId, {
    page,
    page_size: PAGE_SIZE,
  });

  if (isLoading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center gap-3" data-testid="activity-loading">
        <LoadingSpinner size="md" />
        <span className="text-sm text-slate-400">Loading project activities...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-950/40 border border-red-900/60 rounded-xl text-red-300">
        <p className="text-sm">Failed to load activity feed: {error.message}</p>
      </div>
    );
  }

  const activities = data?.activities || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

  if (activities.length === 0) {
    return (
      <div className="p-12 text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/30">
        <Activity className="w-8 h-8 text-slate-600 mx-auto mb-2" />
        <p className="text-sm font-medium text-slate-400">No activity yet</p>
        <p className="text-xs text-slate-500 mt-1">
          Actions taken on tasks in this project will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="project-activity-feed">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <Activity className="w-4 h-4 text-indigo-400" />
          <span>Audit Trail ({total})</span>
        </h3>
        {totalPages > 1 && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1 rounded hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="p-1 rounded hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {activities.map((item) => (
          <ActivityRow key={item.id} activity={item} />
        ))}
      </div>
    </div>
  );
};

const ActivityRow: React.FC<{ activity: ActivityItem }> = ({ activity }) => {
  const actorName = activity.actor?.name || activity.actor?.email?.split('@')[0] || 'User';
  const timeFormatted = formatTimeAgo(activity.created_at);

  return (
    <div
      className="p-3.5 bg-slate-900/60 border border-slate-800/80 rounded-lg flex items-start gap-3 hover:border-slate-700/60 transition-colors"
      data-testid={`activity-item-${activity.id}`}
    >
      <div className="mt-0.5">{getActivityIcon(activity.action)}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-slate-300 leading-relaxed">
          <span className="font-semibold text-slate-200">{actorName}</span>{' '}
          {renderActionContent(activity)}
        </div>
        <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
          <span>{timeFormatted}</span>
          {activity.task_identifier && (
            <>
              <span>•</span>
              <span className="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-[10px] text-slate-400">
                {activity.task_identifier}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

function getActivityIcon(action: string) {
  switch (action) {
    case 'task_created':
      return <PlusCircle className="w-4 h-4 text-emerald-400" />;
    case 'task_status_changed':
      return <ArrowRightCircle className="w-4 h-4 text-blue-400" />;
    case 'task_assigned':
      return <UserPlus className="w-4 h-4 text-indigo-400" />;
    case 'task_unassigned':
      return <UserMinus className="w-4 h-4 text-slate-400" />;
    case 'task_priority_changed':
      return <Flag className="w-4 h-4 text-amber-400" />;
    case 'task_due_date_changed':
      return <Calendar className="w-4 h-4 text-purple-400" />;
    case 'comment_added':
      return <MessageSquare className="w-4 h-4 text-teal-400" />;
    case 'task_deleted':
      return <Trash2 className="w-4 h-4 text-red-400" />;
    default:
      return <Activity className="w-4 h-4 text-slate-400" />;
  }
}

function renderActionContent(activity: ActivityItem) {
  const meta = activity.metadata || {};
  const taskLabel = activity.task_identifier ? (
    <span className="font-semibold text-slate-200">{activity.task_identifier}</span>
  ) : (
    <span>a task</span>
  );

  switch (activity.action) {
    case 'task_created':
      return (
        <span>
          created task {taskLabel}
          {activity.task_title ? ` "${activity.task_title}"` : ''}
        </span>
      );
    case 'task_status_changed':
      return (
        <span>
          changed status of {taskLabel} from{' '}
          <span className="text-amber-300 font-medium capitalize">
            {String(meta.old_status || '').replace('_', ' ')}
          </span>{' '}
          to{' '}
          <span className="text-emerald-300 font-medium capitalize">
            {String(meta.new_status || '').replace('_', ' ')}
          </span>
        </span>
      );
    case 'task_priority_changed':
      return (
        <span>
          changed priority of {taskLabel} from{' '}
          <span className="text-slate-300 font-medium capitalize">{String(meta.old_priority || '')}</span>{' '}
          to{' '}
          <span className="text-indigo-300 font-medium capitalize">{String(meta.new_priority || '')}</span>
        </span>
      );
    case 'task_assigned':
      return (
        <span>
          assigned {taskLabel} to{' '}
          <span className="text-slate-200 font-semibold">{meta.assignee_name || 'a member'}</span>
        </span>
      );
    case 'task_unassigned':
      return <span>unassigned {taskLabel}</span>;
    case 'comment_added':
      return <span>commented on {taskLabel}</span>;
    case 'task_deleted':
      return <span>deleted task {taskLabel}</span>;
    case 'task_due_date_changed':
      return <span>updated due date for {taskLabel}</span>;
    default:
      return <span>performed {activity.action.replace(/_/g, ' ')}</span>;
  }
}

function formatTimeAgo(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  } catch {
    return 'recently';
  }
}
