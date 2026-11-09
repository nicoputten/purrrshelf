import { router, useLocalSearchParams } from 'expo-router';
import { useAddSheet } from '@/features/add/useAddSheet';
import { SearchScreen } from '@/features/search/SearchScreen';

export default function SearchRoute() {
  const openAdd = useAddSheet((s) => s.open);
  // `q` comes from Top 10's "Search for it" (APP-15).
  const { q } = useLocalSearchParams<{ q?: string }>();
  return (
    <SearchScreen
      {...(q ? { query: q } : {})}
      onOpen={(id) => router.push({ pathname: '/book/[id]', params: { id } })}
      onAdd={openAdd}
      onOpenForYou={(id) =>
        router.push({ pathname: '/book/[id]', params: { id, from: 'for-you' } })
      }
    />
  );
}
