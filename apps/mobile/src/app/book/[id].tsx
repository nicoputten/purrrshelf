import { router, useLocalSearchParams } from 'expo-router';
import { useAddSheet } from '@/features/add/useAddSheet';
import { BookDetailScreen } from '@/features/book/BookDetailScreen';
import { FROM_FOR_YOU } from '@/features/book/forYou';

export default function BookRoute() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const openAdd = useAddSheet((s) => s.open);
  return (
    <BookDetailScreen
      id={id}
      fromForYou={from === FROM_FOR_YOU}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      onOpen={(workId) => router.push({ pathname: '/book/[id]', params: { id: workId } })}
      onAdd={openAdd}
    />
  );
}
