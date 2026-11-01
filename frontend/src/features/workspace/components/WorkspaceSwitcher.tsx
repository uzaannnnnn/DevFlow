import React, { useState, useRef, useEffect } from 'react';
import { useWorkspace } from '../WorkspaceContext';
import { CreateWorkspaceModal } from './CreateWorkspaceModal';
import { ChevronDown, Plus, Check, Briefcase } from 'lucide-react';
import { WorkspaceRole } from '../types';

const getRoleBadgeClass = (role?: WorkspaceRole | null): string => {
  switch (role) {
    case 'owner':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'admin':
      return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    case 'member':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'viewer':
      return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    default:
      return 'bg-slate-800 text-slate-400 border-slate-700';
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
          className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-100 text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          data-testid="workspace-switcher-trigger"
        >
          <div className="w-5 h-5 rounded bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold text-xs">
            <Briefcase className="w-3.5 h-3.5" />
          </div>
          <span className="truncate max-w-[140px] text-left">
            {activeWorkspace ? activeWorkspace.name : 'Select Workspace'}
          </span>
          {activeRole && (
            <span
              className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded border ${getRoleBadgeClass(
                activeRole
              )}`}
              data-testid="active-role-badge"
            >
              {activeRole}
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {isOpen && (
          <div
            className="absolute left-0 mt-2 w-64 origin-top-left rounded-lg bg-slate-900 border border-slate-800 shadow-xl py-1 z-50 text-slate-200"
            role="menu"
            aria-orientation="vertical"
            data-testid="workspace-dropdown"
          >
            <div className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
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
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left transition-colors hover:bg-slate-800/70 ${
                      isSelected ? 'bg-slate-800/40 text-indigo-300 font-semibold' : 'text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="truncate">{ws.name}</span>
                      {ws.role && (
                        <span
                          className={`text-[9px] uppercase font-bold px-1 py-0.2 rounded border ${getRoleBadgeClass(
                            ws.role
                          )}`}
                        >
                          {ws.role}
                        </span>
                      )}
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-indigo-400 shrink-0" />}
                  </button>
                );
              })}

              {workspaces.length === 0 && (
                <div className="px-3 py-2 text-xs text-slate-500">No workspaces found</div>
              )}
            </div>

            <div className="border-t border-slate-800 pt-1">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setIsModalOpen(true);
                }}
                role="menuitem"
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-indigo-400 hover:text-indigo-300 hover:bg-slate-800/70 transition-colors"
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

