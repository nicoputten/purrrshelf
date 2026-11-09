import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Screen } from '@/components/Screen';
import { Nap } from '@/components/motion';

/** The Top 10 tab (APP-14 adds the tab; APP-15 fills it). */
export default function Top10Route() {
  const { t } = useTranslation();
  return (
    <Screen>
      <AppText variant="display" accessibilityRole="header">
        {t('top10.title')}
      </AppText>
      <View style={styles.state}>
        <Nap size={96} />
        <AppText variant="muted">{t('top10.soon')}</AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ state: { alignItems: 'center', gap: 12, paddingVertical: 40 } });
