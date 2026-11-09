import type { LowOdds } from '@purrshelf/contract';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { AppText } from '@/components/AppText';
import { i18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, fontSize, sizes, space } from '@/theme/tokens';

const keys = {
  LOW_ODDS_NOT_FOUND: 'notFound',
  LOW_ODDS_NO_MATCH: 'noMatch',
  LOW_ODDS_NEW: 'new',
  LOW_ODDS_LANGUAGE: 'language',
  LOW_ODDS_RARE: 'rare',
} as const satisfies Record<LowOdds['code'], string>;

/** "2 November" / "2 november": day and month in the app language. */
export function dayMonth(iso: string, language: string): string {
  return new Date(iso).toLocaleDateString(language === 'nl' ? 'nl-NL' : 'en-GB', {
    day: 'numeric',
    month: 'long',
  });
}

/** Title and one line of text for a low-odds reason (board 3c). */
export function lowOddsText(lowOdds: LowOdds, t: TFunction): { title: string; body: string } {
  const key = keys[lowOdds.code];
  const date = lowOdds.notFoundAt ? dayMonth(lowOdds.notFoundAt, i18n.language) : '';
  return {
    title: t(`add.lowOdds.${key}.title`),
    body: t(`add.lowOdds.${key}.body`, { date }),
  };
}

/** The sleepy cat of the warning card: ears up, eyes closed. */
function SleepyCat({ color, eyes }: { color: string; eyes: string }) {
  return (
    <Svg width={40} height={28} viewBox="0 0 120 84" fill="none">
      <Path d="M10 80Q8 34 60 34Q112 34 110 80Z" fill={color} />
      <Path d="M24 48L29 22L46 38Z" fill={color} />
      <Path d="M96 48L91 22L74 38Z" fill={color} />
      <Path d="M42 58Q48 63 54 58" stroke={eyes} strokeWidth={4} strokeLinecap="round" />
      <Path d="M66 58Q72 63 78 58" stroke={eyes} strokeWidth={4} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * Why a search will probably come back empty (APP-16, boards 3b and 3c).
 * Shown above the Add button; it never blocks Add.
 */
export function LowOddsWarning({
  lowOdds,
  onEnglishEdition,
}: {
  lowOdds: LowOdds;
  /** Offered only for the language reason, when an English edition is known. */
  onEnglishEdition?: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { title, body } = lowOddsText(lowOdds, t);
  const showLink =
    lowOdds.code === 'LOW_ODDS_LANGUAGE' &&
    lowOdds.englishEditionWorkId !== null &&
    onEnglishEdition !== undefined;
  return (
    <View
      accessibilityRole="summary"
      testID="low-odds-warning"
      style={[
        styles.card,
        { backgroundColor: colors.warningSurface, borderColor: colors.warningBorder },
      ]}
    >
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <SleepyCat color={colors.warningText} eyes={colors.warningSurface} />
      </View>
      <View style={styles.text}>
        <AppText style={[styles.title, { color: colors.text }]}>{title}</AppText>
        <AppText style={[styles.body, { color: colors.warningText }]}>{body}</AppText>
        {showLink ? (
          <Pressable accessibilityRole="link" onPress={onEnglishEdition} style={styles.link}>
            <AppText style={[styles.linkText, { color: colors.warningLink }]}>
              {t('add.lowOdds.englishEdition')}
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'flex-start',
    padding: space.lg,
    borderRadius: 16,
    borderWidth: 1,
  },
  text: { flex: 1, gap: space.xs },
  title: { fontFamily: fonts.bodyBold, fontSize: fontSize.body },
  body: { fontFamily: fonts.body, fontSize: fontSize.small, lineHeight: 19 },
  link: { minHeight: sizes.touch, justifyContent: 'center' },
  linkText: { fontFamily: fonts.bodyBold, fontSize: fontSize.small },
});
