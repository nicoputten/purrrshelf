import type { Recommendation } from '@purrshelf/contract';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { PawPrint } from '@/components/motion/PawPrint';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, fontSize, radius } from '@/theme/tokens';
import { bannerText } from './forYou';

/** Ginger banner on a book opened from For you: why it was suggested (APP-13, board 11). */
export function ForYouBanner({ item }: { item: Recommendation }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="text"
      style={[styles.banner, { backgroundColor: colors.gingerBg }]}
    >
      <PawPrint color={colors.accent} size={18} />
      <AppText style={[styles.text, { color: colors.onGingerBg }]}>{bannerText(item, t)}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.card - 4,
  },
  text: { flex: 1, fontFamily: fonts.bodyBold, fontSize: fontSize.small },
});
