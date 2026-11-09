import { router } from 'expo-router';
import { useAddSheet } from '@/features/add/useAddSheet';
import { SearchScreen } from '@/features/search/SearchScreen';

export default function SearchRoute() {
  const openAdd = useAddSheet((s) => s.open);
  return (
    <SearchScreen
      onOpen={(id) => router.push({ pathname: '/book/[id]', params: { id } })}
      onAdd={openAdd}
      onOpenForYou={(id) =>
        router.push({ pathname: '/book/[id]', params: { id, from: 'for-you' } })
      }
    />
  );
}
