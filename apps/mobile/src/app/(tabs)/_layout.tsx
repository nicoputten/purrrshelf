import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useUpdateChecks } from '@/features/updates/useUpdateChecks';
import { useAppUpdate } from '@/features/updates/updates';
import { BooksIcon, PawIcon, SlidersIcon, YarnIcon } from '@/components/TabIcons';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';

export default function TabsLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  useUpdateChecks();
  const updateReady = useAppUpdate((s) => s.status === 'available');
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarStyle: {
          height: 72,
          backgroundColor: colors.surface,
          borderTopColor: colors.surfaceRaised,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontFamily: fonts.bodyBold, fontSize: 12 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.search'), tabBarIcon: PawIcon }} />
      <Tabs.Screen name="library" options={{ title: t('tabs.library'), tabBarIcon: BooksIcon }} />
      <Tabs.Screen name="requests" options={{ title: t('tabs.requests'), tabBarIcon: YarnIcon }} />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          tabBarIcon: SlidersIcon,
          // A new app version waits in Settings (APP-10).
          ...(updateReady
            ? { tabBarBadge: 1, tabBarAccessibilityLabel: t('tabs.settingsUpdate') }
            : {}),
        }}
      />
    </Tabs>
  );
}
