import { router } from 'expo-router';
import { SettingsScreen } from '@/features/settings/SettingsScreen';

export default function SettingsRoute() {
  return <SettingsScreen onImport={() => router.push('/import')} />;
}
