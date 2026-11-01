import React, { useState, useRef, useEffect } from 'react';
import { useWorkspace } from '../WorkspaceContext';
import { CreateWorkspaceModal } from './CreateWorkspaceModal';
import { ChevronDown, Plus, Check, Briefcase } from 'lucide-react';
import { WorkspaceRole } from '../types';

const getRoleBadgeClass = (role?: WorkspaceRole | null): string => {
  switch (role) {
    case 'owner':
      return 'bg-accent-soft text-accent border-accent/25';
    case 'admin':
      return 'bg-info-soft text-info border-info/25';
    case 'member':
      return 'bg-success-soft text-success border-success/25';
    case 'viewer':
      return 'bg-subtle text-muted border-line';
    default:
      return 'bg-subtle text-muted border-line';
  }
};

export const WorkspaceSwitcher: React.FC = () => {
  const { workspaces, activeWorkspace, activeRole, switchWorkspace } = useWorkspace();
  const [isOpen, setIsOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <>
      <div className="relative inline-block text-left" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-haspopup="true"
          aria-expanded={isOpen}
          className="flex items-center gap-2.5 px-3 py-1.5 rounded-md bg-surface border border-line hover:border-line-strong text-ink text-sm font-medium transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          data-testid="workspace-switcher-trigger"
        >
          <div className="w-5 h-5 rounded bg-subtle text-ink-2 flex items-center justify-center font-bold text-xs border border-line">
            <Briefcase className="w-3.5 h-3.5" />
          </div>
          <span className="truncate max-w-[140px] text-left">
            {activeWorkspace ? activeWorkspace.name : 'Select Workspace'}
          </span>
          {activeRole && (
            <span
              className={`text-2xs uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded border ${getRoleBadgeClass(
                activeRole
              )}`}
              data-testid="active-role-badge"
            >
              {activeRole}
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {isOpen && (
          <div
            className="absolute left-0 mt-2 w-64 origin-top-left rounded-md bg-surface border border-line shadow-modal py-1 z-50 text-ink"
            role="menu"
            aria-orientation="vertical"
            data-testid="workspace-dropdown"
          >
            <div className="px-3 py-2 text-2xs font-semibold text-muted uppercase tracking-wider border-b border-line">
              Workspaces ({workspaces.length})
            </div>

            <div className="max-h-56 overflow-y-auto py-1">
              {workspaces.map((ws) => {
                const isSelected = activeWorkspace?.id === ws.id;
                return (
                  <button
                    key={ws.id}
                    type="button"
                    onClick={() => {
                      switchWorkspace(ws.id);
                      setIsOpen(false);
                    }}
                    role="menuitem"
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left transition-colors hover:bg-subtle ${
                      isSelected ? 'bg-subtle/80 text-ink font-semibold' : 'text-ink-2'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="truncate">{ws.name}</span>
                      {ws.role && (
                        <span
                          className={`text-2xs uppercase font-semibold px-1 py-0.2 rounded border ${getRoleBadgeClass(
                            ws.role
                          )}`}
                        >
                          {ws.role}
                        </span>
                      )}
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-accent shrink-0" />}
                  </button>
                );
              })}

              {workspaces.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted">No workspaces found</div>
              )}
            </div>

            <div className="border-t border-line pt-1">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setIsModalOpen(true);
                }}
                role="menuitem"
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-accent hover:text-accent/90 hover:bg-subtle transition-colors font-medium"
                data-testid="create-workspace-trigger"
              >
                <Plus className="w-4 h-4" />
                <span>Create Workspace</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <CreateWorkspaceModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
};

