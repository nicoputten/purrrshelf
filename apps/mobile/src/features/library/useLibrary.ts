import { LibraryBooks } from '@purrshelf/contract';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { OfflineKeys, offline } from '@/lib/offline';
import { useSession } from '@/session/session';

export const libraryBooksKey = ['library', 'books'] as const;

function parseSaved(raw: string | null): LibraryBooks | null {
  if (!raw) return null;
  try {
    const parsed = LibraryBooks.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * The shared library, with the last copy from the server kept on the phone:
 * it shows straight away and stays readable offline (APP-07).
 */
export function useLibraryBooks() {
  const call = useSession((s) => s.call);
  const [saved, setSaved] = useState<LibraryBooks | null>(null);
  useEffect(() => {
    let live = true;
    void offline.get(OfflineKeys.library).then((raw) => {
      if (live) setSaved(parseSaved(raw));
    });
    return () => {
      live = false;
    };
  }, []);
  const query = useQuery({
    queryKey: libraryBooksKey,
    queryFn: async () => {
      const books = await call('libraryBooks');
      await offline.set(OfflineKeys.library, JSON.stringify(books));
      return books;
    },
  });
  return {
    query,
    data: query.data ?? saved ?? undefined,
    /** Showing the saved copy because the server could not be reached. */
    offline: !query.data && query.isError && saved !== null,
  };
}
