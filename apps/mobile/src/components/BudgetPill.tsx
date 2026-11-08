import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, fontSize, radius, sizes } from '@/theme/tokens';
import { AppText } from './AppText';
import { PawIcon } from './TabIcons';

export interface Budget {
  left: number;
  limit: number;
}

/**
 * "21 / 25 left" with a paw, linking to Requests. Shows nothing until the
 * broker reports the indexer budget (BRK-04).
 */
export function BudgetPill({ budget, onPress }: { budget: Budget | null; onPress: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (!budget) return null;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={t('search.budgetA11y', { ...budget })}
      onPress={onPress}
      style={[styles.pill, { backgroundColor: colors.surfaceRaised }]}
    >
      <PawIcon color={colors.accent} size={16} />
      <AppText style={[styles.text, { color: colors.text }]}>
        {t('search.budget', { ...budget })}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: sizes.touch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
  },
  text: { fontFamily: fonts.bodyBold, fontSize: fontSize.small },
});
