import type { WorkSummary } from '@purrshelf/contract';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { BookCover } from '@/components/BookCover';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, fontSize, radius } from '@/theme/tokens';
import { libraryBadges } from './badges';

const LANGUAGE_NAMES: Record<string, string> = { en: 'English', nl: 'Nederlands' };

export function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code.toUpperCase();
}

/** "Multatuli · Lantern Keepers #2" or "Multatuli · Nederlands". */
export function secondLine(hit: WorkSummary, t: TFunction): string {
  const parts: string[] = [];
  if (hit.authors.length) parts.push(hit.authors.slice(0, 2).join(', '));
  if (hit.series) {
    parts.push(
      hit.series.position !== null
        ? t('search.seriesPosition', { name: hit.series.name, position: hit.series.position })
        : hit.series.name,
    );
  } else if (hit.language) {
    parts.push(languageName(hit.language));
  }
  return parts.join(' · ');
}

export function SearchResult({ hit, onPress }: { hit: WorkSummary; onPress?: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const badges = libraryBadges(hit.library, t);
  const line = secondLine(hit, t);
  const body = (
    <>
      <BookCover workId={hit.id} title={hit.title} width={56} height={84} size="s" />
      <View style={styles.text}>
        <AppText numberOfLines={2} style={[styles.title, { color: colors.text }]}>
          {hit.title}
        </AppText>
        {line ? (
          <AppText variant="muted" numberOfLines={1}>
            {line}
          </AppText>
        ) : null}
        {badges.length ? (
          <View style={styles.badges}>
            {badges.map((b) => (
              <Badge key={b.label} {...b} />
            ))}
          </View>
        ) : null}
      </View>
    </>
  );
  const style = [styles.card, { backgroundColor: colors.surface }];
  const label = [hit.title, line, ...badges.map((b) => b.label)].filter(Boolean).join(', ');
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={style}
    >
      {body}
    </Pressable>
  ) : (
    <View accessible accessibilityLabel={label} style={style}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 14,
    padding: 12,
    borderRadius: radius.card,
    alignItems: 'center',
  },
  text: { flex: 1, gap: 4 },
  title: { fontFamily: fonts.heading, fontSize: fontSize.card },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
});
