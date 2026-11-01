import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import { workspaceApi } from './api';
import {
  Workspace,
  WorkspaceRole,
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
} from './types';
import { ApiClientError } from '../../shared/lib/api-client';

export interface WorkspaceContextType {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  activeRole: WorkspaceRole | null;
  isLoading: boolean;
  error: string | null;
  switchWorkspace: (workspaceId: string) => void;
  createWorkspace: (input: CreateWorkspaceInput) => Promise<Workspace>;
  updateWorkspace: (input: UpdateWorkspaceInput) => Promise<Workspace>;
  deleteWorkspace: () => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export interface WorkspaceProviderProps {
  children: ReactNode;
  initialWorkspaces?: Workspace[];
  initialActiveId?: string;
  skipAutoFetch?: boolean;
}

const ACTIVE_WS_STORAGE_KEY = 'devflow_active_workspace_id';

export const WorkspaceProvider: React.FC<WorkspaceProviderProps> = ({
  children,
  initialWorkspaces = [],
  initialActiveId,
  skipAutoFetch = false,
}) => {
  const { isAuthenticated } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>(initialWorkspaces);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(
    initialActiveId || (initialWorkspaces.length > 0 ? initialWorkspaces[0].id : null)
  );
  const [isLoading, setIsLoading] = useState<boolean>(!skipAutoFetch && isAuthenticated);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkspaces = useCallback(async () => {
    if (!isAuthenticated) {
      setWorkspaces([]);
      setActiveWorkspaceId(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const res = await workspaceApi.listWorkspaces();
      const list = res.data.workspaces || [];
      setWorkspaces(list);

      // Check stored preference or default to first
      const storedId = localStorage.getItem(ACTIVE_WS_STORAGE_KEY);
      if (storedId && list.some((w) => w.id === storedId)) {
        setActiveWorkspaceId(storedId);
      } else if (list.length > 0) {
        setActiveWorkspaceId(list[0].id);
        try {
          localStorage.setItem(ACTIVE_WS_STORAGE_KEY, list[0].id);
        } catch {
          // Ignore localStorage errors (e.g. in test envs)
        }
      } else {
        setActiveWorkspaceId(null);
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to fetch workspaces');
      }
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!skipAutoFetch && isAuthenticated) {
      fetchWorkspaces();
    } else if (!isAuthenticated) {
      setWorkspaces([]);
      setActiveWorkspaceId(null);
      setIsLoading(false);
    }
  }, [fetchWorkspaces, isAuthenticated, skipAutoFetch]);

  const switchWorkspace = (workspaceId: string) => {
    const target = workspaces.find((w) => w.id === workspaceId);
    if (target) {
      setActiveWorkspaceId(target.id);
      try {
        localStorage.setItem(ACTIVE_WS_STORAGE_KEY, target.id);
      } catch {
        // Ignore
      }
    }
  };

  const createWorkspace = async (input: CreateWorkspaceInput): Promise<Workspace> => {
    const res = await workspaceApi.createWorkspace(input);
    const created = res.data.workspace;
    setWorkspaces((prev) => [created, ...prev]);
    setActiveWorkspaceId(created.id);
    try {
      localStorage.setItem(ACTIVE_WS_STORAGE_KEY, created.id);
    } catch {
      // Ignore
    }
    return created;
  };

  const updateWorkspace = async (input: UpdateWorkspaceInput): Promise<Workspace> => {
    if (!activeWorkspaceId) {
      throw new Error('No active workspace selected');
    }
    const res = await workspaceApi.updateWorkspace(activeWorkspaceId, input);
    const updated = res.data.workspace;
    setWorkspaces((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
    return updated;
  };

  const deleteWorkspace = async (): Promise<void> => {
    if (!activeWorkspaceId) {
      throw new Error('No active workspace selected');
    }
    await workspaceApi.deleteWorkspace(activeWorkspaceId);
    const remaining = workspaces.filter((w) => w.id !== activeWorkspaceId);
    setWorkspaces(remaining);
    const nextActive = remaining.length > 0 ? remaining[0].id : null;
    setActiveWorkspaceId(nextActive);
    if (nextActive) {
      try {
        localStorage.setItem(ACTIVE_WS_STORAGE_KEY, nextActive);
      } catch {
        // Ignore
      }
    } else {
      try {
        localStorage.removeItem(ACTIVE_WS_STORAGE_KEY);
      } catch {
        // Ignore
      }
    }
  };

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) || null;
  const activeRole = activeWorkspace?.role || null;

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        activeWorkspace,
        activeRole,
        isLoading,
        error,
        switchWorkspace,
        createWorkspace,
        updateWorkspace,
        deleteWorkspace,
        refreshWorkspaces: fetchWorkspaces,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = (): WorkspaceContextType => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
};

