import type { MyReading } from '@purrshelf/contract';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius } from '@/theme/tokens';

const THUMB = 18;

/** What the progress block says; null when there is nothing to show. */
export function progressOf(
  reading: MyReading | null,
):
  | { key: 'book.progress.read'; percent: number }
  | { key: 'book.progress.finished' | 'book.progress.reading' }
  | null {
  if (!reading) return null;
  if (reading.status === 'finished') return { key: 'book.progress.finished' };
  if (reading.progressPercent !== null && reading.progressPercent > 0) {
    const percent = Math.min(100, Math.max(1, Math.round(reading.progressPercent)));
    return { key: 'book.progress.read', percent };
  }
  return reading.status === 'reading' ? { key: 'book.progress.reading' } : null;
}

/**
 * "You've read 42%" with a bar and a paw thumb (APP-08, canvas board 2).
 * From my Kobo's sync data in CWA; nothing for an unread book or an unlinked Kobo.
 */
export function ReadingProgress({ reading }: { reading: MyReading | null }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const progress = progressOf(reading);
  if (!progress) return null;
  const percent =
    progress.key === 'book.progress.read'
      ? progress.percent
      : progress.key === 'book.progress.finished'
        ? 100
        : null;
  const label =
    progress.key === 'book.progress.read'
      ? t(progress.key, { percent: progress.percent })
      : t(progress.key);
  return (
    <View style={styles.wrap}>
      <AppText style={styles.label}>{label}</AppText>
      {percent !== null ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={t('book.progress.label')}
          accessibilityValue={{ min: 0, max: 100, now: percent }}
          style={[styles.track, { backgroundColor: colors.surfaceRaised }]}
        >
          <View style={[styles.fill, { backgroundColor: colors.accent, width: `${percent}%` }]} />
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[
              styles.thumb,
              {
                left: `${percent}%`,
                backgroundColor: colors.accent,
                borderColor: colors.background,
              },
            ]}
          >
            <AppText style={[styles.paw, { color: colors.onAccent }]}>🐾</AppText>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  label: { fontFamily: fonts.bodyBold },
  track: { height: 8, borderRadius: radius.pill, justifyContent: 'center' },
  fill: { height: 8, borderRadius: radius.pill },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    marginLeft: -THUMB / 2,
    borderRadius: THUMB / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paw: { fontSize: 9, lineHeight: 11 },
});
