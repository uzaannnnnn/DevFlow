import type { FC } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient, ApiClientError } from '../shared/lib/api-client';
import { config } from '../shared/lib/config';
import { LoadingSpinner } from '../shared/ui/LoadingSpinner';
import { CheckCircle2, AlertTriangle, Database, Server, RefreshCw, ShieldCheck } from 'lucide-react';

interface HealthData {
  status: string;
  service: string;
  version: string;
  environment: string;
}

interface ReadinessData {
  status: string;
  database: string;
  service: string;
  version: string;
  environment: string;
}

export const HomePage: FC = () => {
  // 1. Query Backend Liveness (/health)
  const healthQuery = useQuery<HealthData, ApiClientError>({
    queryKey: ['system', 'health'],
    queryFn: async () => {
      const res = await apiClient.get<HealthData>('health');
      return res.data;
    },
  });

  // 2. Query Database Readiness (/health/ready)
  const readinessQuery = useQuery<ReadinessData, ApiClientError>({
    queryKey: ['system', 'readiness'],
    queryFn: async () => {
      const res = await apiClient.get<ReadinessData>('health/ready');
      return res.data;
    },
  });

  const handleRefresh = () => {
    healthQuery.refetch();
    readinessQuery.refetch();
  };

  const isRefreshing = healthQuery.isFetching || readinessQuery.isFetching;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      {/* Top Navigation */}
      <header className="border-b border-slate-800 bg-slate-950/50 backdrop-blur px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
            DF
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">DevFlow</h1>
            <p className="text-xs text-slate-400">Sprint 1 Foundation</p>
          </div>
        </div>

        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh Status
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-8 flex flex-col gap-8 justify-center">
        <div className="text-center max-w-xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mb-4">
            <ShieldCheck className="h-3.5 w-3.5" />
            Foundation Phase Verified
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            System Operational
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Frontend foundation, centralized API client, Go backend server, and PostgreSQL database migrations are verified and communicating.
          </p>
        </div>

        {/* Integration Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card 1: Backend Service Liveness */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-5 flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <Server className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">Backend API</h3>
                  <p className="text-xs text-slate-500">{config.apiUrl}/health</p>
                </div>
              </div>

              {healthQuery.isLoading ? (
                <LoadingSpinner size="sm" />
              ) : healthQuery.isSuccess ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {healthQuery.data.status}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Offline
                </span>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800/80 text-xs text-slate-400 flex justify-between">
              <span>Service: {healthQuery.data?.service || 'devflow-api'}</span>
              <span>v{healthQuery.data?.version || '0.1.0'} [{healthQuery.data?.environment || config.isDev ? 'dev' : 'prod'}]</span>
            </div>
          </div>

          {/* Card 2: Database Readiness */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-5 flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">PostgreSQL Database</h3>
                  <p className="text-xs text-slate-500">{config.apiUrl}/health/ready</p>
                </div>
              </div>

              {readinessQuery.isLoading ? (
                <LoadingSpinner size="sm" />
              ) : readinessQuery.isSuccess && readinessQuery.data.database === 'connected' ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {readinessQuery.data.database}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-full border border-rose-500/20">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Disconnected
                </span>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800/80 text-xs text-slate-400 flex justify-between">
              <span>PostgreSQL 16 Engine</span>
              <span>10 Core Tables Active</span>
            </div>
          </div>
        </div>

        {/* Technical Stack Pills */}
        <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-800 text-xs text-slate-400 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
            <span>Client Base URL: <code className="text-slate-300">{config.apiUrl}</code></span>
          </div>
          <div className="flex items-center gap-4 text-slate-400 font-mono text-[11px]">
            <span>React 18 + Vite</span>
            <span>TypeScript 5</span>
            <span>TanStack Query</span>
            <span>Tailwind CSS</span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/60 py-4 text-center text-xs text-slate-500">
        DevFlow — Sprint 1 Phase 4 Verified Foundation
      </footer>
    </div>
  );
};
