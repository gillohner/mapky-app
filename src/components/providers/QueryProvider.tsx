import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { queryPersister } from "@/lib/offline/query-persister";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      // Per-query IDB persister. No-ops for queries that don't set
      // `meta.persist = true`; for the ones that do, hydrates from
      // IDB on first observer + writes back on every settle.
      persister: queryPersister.persisterFn,
    },
  },
});

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
