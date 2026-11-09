import { useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { LibraryScreen } from '@/features/library/LibraryScreen';
import { libraryBooksKey } from '@/features/library/useLibrary';

export default function LibraryRoute() {
  const client = useQueryClient();
  const firstFocus = useRef(true);
  // Opening the tab again rechecks the library; the first time it loads anyway.
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) firstFocus.current = false;
      else void client.invalidateQueries({ queryKey: libraryBooksKey });
    }, [client]),
  );
  return (
    <LibraryScreen
      onOpen={(id) => router.push({ pathname: '/book/[id]', params: { id } })}
      onRequests={() => router.push('/requests')}
    />
  );
}
