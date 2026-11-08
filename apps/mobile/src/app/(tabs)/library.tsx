import { router } from 'expo-router';
import { LibraryScreen } from '@/features/library/LibraryScreen';

export default function LibraryRoute() {
  return <LibraryScreen onOpen={(id) => router.push({ pathname: '/book/[id]', params: { id } })} />;
}
