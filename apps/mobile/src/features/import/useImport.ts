import type { ImportStatus, LibraryBooks, LibraryOwner } from '@purrshelf/contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useSession } from '@/session/session';
import { libraryBooksKey } from '../library/useLibrary';
import { withOwners } from './assign';

export const importStatusKey = ['import', 'status'] as const;
/** How often the screen asks for progress while books are being matched. */
export const POLL_MS = 2000;

/** The last import's progress; polled while it runs, and the library is reloaded when it ends. */
export function useImportStatus() {
  const call = useSession((s) => s.call);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: importStatusKey,
    queryFn: () => call('importStatus'),
    refetchInterval: (q) => (q.state.data?.running ? POLL_MS : false),
  });
  const running = query.data?.running ?? false;
  const wasRunning = useRef(running);
  useEffect(() => {
    if (wasRunning.current && !running) {
      void client.invalidateQueries({ queryKey: libraryBooksKey });
    }
    wasRunning.current = running;
  }, [running, client]);
  return query;
}

export function useStartImport() {
  const call = useSession((s) => s.call);
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => call('startImport'),
    onSuccess: (status: ImportStatus) => {
      client.setQueryData(importStatusKey, status);
      void client.invalidateQueries({ queryKey: libraryBooksKey });
    },
  });
}

/** Sets who owns books, one or many at a time (import review). */
export function useAssignOwners(readers: LibraryOwner[]) {
  const call = useSession((s) => s.call);
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { itemIds: string[]; ownerIds: string[] }) => call('assignOwners', input),
    onSuccess: (_result, { itemIds, ownerIds }) => {
      const library = client.getQueryData<LibraryBooks>(libraryBooksKey);
      if (library) {
        client.setQueryData(libraryBooksKey, withOwners(library, itemIds, ownerIds, readers));
      }
      void client.invalidateQueries({ queryKey: libraryBooksKey });
      void client.invalidateQueries({ queryKey: ['work'] });
      void client.invalidateQueries({ queryKey: ['discover'] });
    },
  });
}
