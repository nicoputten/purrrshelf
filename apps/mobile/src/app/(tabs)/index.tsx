import { router } from 'expo-router';
import { SearchScreen } from '@/features/search/SearchScreen';

export default function SearchRoute() {
  return <SearchScreen onOpen={(id) => router.push({ pathname: '/book/[id]', params: { id } })} />;
}
