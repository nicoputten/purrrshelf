import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useUpdateChecks } from '@/features/updates/useUpdateChecks';
import { useAppUpdate } from '@/features/updates/updates';
import { View } from 'react-native';
import { BooksIcon, CatFaceIcon, PodiumIcon, SearchIcon } from '@/components/TabIcons';
import { ActivityHost } from '@/features/activity/ActivityHost';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';

/** Search · Top 10 · Library · You (APP-14, ADR 0040); Requests lives in the activity pill. */
export default function TabsLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  useUpdateChecks();
  const updateReady = useAppUpdate((s) => s.status === 'available');
  return (
    <View style={{ flex: 1 }}>
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
        <Tabs.Screen name="index" options={{ title: t('tabs.search'), tabBarIcon: SearchIcon }} />
        <Tabs.Screen name="top10" options={{ title: t('tabs.top10'), tabBarIcon: PodiumIcon }} />
        <Tabs.Screen name="library" options={{ title: t('tabs.library'), tabBarIcon: BooksIcon }} />
        <Tabs.Screen
          name="settings"
          options={{
            title: t('tabs.settings'),
            tabBarIcon: CatFaceIcon,
            // A new app version waits in Settings (APP-10).
            ...(updateReady
              ? { tabBarBadge: 1, tabBarAccessibilityLabel: t('tabs.settingsUpdate') }
              : {}),
          }}
        />
      </Tabs>
      {/* Above the tab bar on every tab (board 13). */}
      <ActivityHost />
    </View>
  );
}
