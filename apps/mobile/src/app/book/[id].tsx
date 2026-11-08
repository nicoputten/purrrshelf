import { router, useLocalSearchParams } from 'expo-router';
import { BookDetailScreen } from '@/features/book/BookDetailScreen';

export default function BookRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <BookDetailScreen
      id={id}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      onOpen={(workId) => router.push({ pathname: '/book/[id]', params: { id: workId } })}
    />
  );
}
