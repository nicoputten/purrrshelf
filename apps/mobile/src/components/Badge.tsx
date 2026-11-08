import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, fontSize, radius } from '@/theme/tokens';
import { AppText } from './AppText';

export type BadgeTone = 'success' | 'partner' | 'mine' | 'neutral';

/** Small pill: "On your Kobo", "Partner has it", "Yours". */
export function Badge({ label, tone }: { label: string; tone: BadgeTone }) {
  const { colors } = useTheme();
  const palette = {
    success: [colors.successBg, colors.success],
    partner: [colors.partnerBg, colors.partner],
    mine: [colors.mineBg, colors.mine],
    neutral: [colors.surfaceRaised, colors.textMuted],
  } as const;
  const [bg, fg] = palette[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <AppText style={[styles.label, { color: fg }]}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  label: { fontFamily: fonts.bodyBold, fontSize: fontSize.tiny },
});
