import { router, useLocalSearchParams } from 'expo-router';
import { useAddSheet } from '@/features/add/useAddSheet';
import { BookDetailScreen } from '@/features/book/BookDetailScreen';

export default function BookRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const openAdd = useAddSheet((s) => s.open);
  return (
    <BookDetailScreen
      id={id}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      onOpen={(workId) => router.push({ pathname: '/book/[id]', params: { id: workId } })}
      onAdd={openAdd}
    />
  );
}
