import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { BooksIcon, PawIcon, SlidersIcon, YarnIcon } from '@/components/TabIcons';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';

export default function TabsLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();
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
        options={{ title: t('tabs.settings'), tabBarIcon: SlidersIcon }}
      />
    </Tabs>
  );
}
