import { FC, ReactNode, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ErrorBoundary } from '../shared/ui/ErrorBoundary';

interface AppProvidersProps {
  children: ReactNode;
  queryClient?: QueryClient;
}

export const AppProviders: FC<AppProvidersProps> = ({
  children,
  queryClient: customQueryClient,
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
        <BrowserRouter>{children}</BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};
