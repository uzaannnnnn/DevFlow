import { FC, ReactNode, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ErrorBoundary } from '../shared/ui/ErrorBoundary';
import { AuthProvider } from '../features/auth/AuthContext';

interface AppProvidersProps {
  children: ReactNode;
  queryClient?: QueryClient;
  skipInitialRefresh?: boolean;
}

export const AppProviders: FC<AppProvidersProps> = ({
  children,
  queryClient: customQueryClient,
  skipInitialRefresh = false,
}) => {
  const [defaultQueryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  const client = customQueryClient || defaultQueryClient;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={client}>
        <AuthProvider skipInitialRefresh={skipInitialRefresh}>
          <BrowserRouter>{children}</BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};
