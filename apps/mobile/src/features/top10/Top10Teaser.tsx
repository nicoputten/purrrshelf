import type { ChartEntry } from '@purrshelf/contract';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { BookCover } from '@/components/BookCover';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, fontSize, radius, sizes, space } from '@/theme/tokens';
import { UnknownCover } from './ChartRow';
import { DEFAULT_GENRE, findChart, homeRegion, searchQueryFor, useCharts } from './useCharts';

const COVER = { width: 96, height: 142 } as const;
const SHOWN = 3;

/**
 * The Top 10 teaser on the Search tab (board 15, last panel): the first three
 * books of the reader's top genre (or thrillers) in their language, and "See all".
 * Shows nothing while loading or when the charts are unavailable: For you
 * above it carries the screen.
 */
export function Top10Teaser() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { data } = useCharts();
  // The reader's most-finished genre this month (APP-17); thrillers when the
  // broker has none or today's chart has no list for it.
  const region = homeRegion(data);
  const top = data?.topGenre ?? null;
  const topChart = top ? findChart(data, 'apple', region, top) : undefined;
  const personal = Boolean(topChart && topChart.items.length > 0);
  const genre = personal && top ? top : DEFAULT_GENRE;
  const chart = personal ? topChart : findChart(data, 'apple', region, genre);
  if (!chart || chart.items.length === 0) return null;
  const genreName = t(`top10.teaserGenre.${genre}`);

  const open = (entry: ChartEntry) => {
    if (entry.work) {
      router.push({ pathname: '/book/[id]', params: { id: entry.work.id } });
    } else {
      router.navigate({ pathname: '/', params: { q: searchQueryFor(entry) } });
    }
  };

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <AppText
          style={[styles.title, { color: colors.text }]}
          accessibilityRole="header"
          numberOfLines={1}
        >
          {t('top10.teaserTitle', { genre: genreName })}
        </AppText>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('top10.seeAllA11y', { genre: genreName })}
          onPress={() => router.navigate({ pathname: '/top10', params: { genre } })}
          style={styles.seeAll}
        >
          <AppText style={[styles.link, { color: colors.accent }]}>{t('top10.seeAll')}</AppText>
        </Pressable>
      </View>
      {personal ? (
        <AppText variant="muted" style={styles.because}>
          {t('top10.yourTopGenre')}
        </AppText>
      ) : null}
      <View style={styles.covers}>
        {chart.items.slice(0, SHOWN).map((entry) => (
          <Pressable
            key={entry.rank}
            accessibilityRole="button"
            accessibilityLabel={[
              t('top10.rank', { rank: entry.rank }),
              entry.title,
              entry.authors[0],
            ]
              .filter(Boolean)
              .join(', ')}
            onPress={() => open(entry)}
            style={styles.cover}
          >
            {entry.work ? (
              <BookCover workId={entry.work.id} title={entry.title} size="m" {...COVER} />
            ) : (
              <UnknownCover {...COVER} />
            )}
            <AppText
              accessibilityElementsHidden
              importantForAccessibility="no"
              style={[styles.rank, { color: colors.accent, textShadowColor: colors.background }]}
            >
              {entry.rank}
            </AppText>
          </Pressable>
        ))}
      </View>
      <AppText variant="muted" style={styles.credit}>
        {t('top10.creditApple')}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm, marginTop: space.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { flex: 1, fontFamily: fonts.heading, fontSize: 18 },
  seeAll: { minHeight: sizes.touch, justifyContent: 'center' },
  link: { fontFamily: fonts.bodyBold, fontSize: fontSize.small },
  covers: { flexDirection: 'row', gap: 18, paddingLeft: space.sm },
  cover: { width: COVER.width, borderRadius: radius.cover },
  rank: {
    position: 'absolute',
    left: -6,
    bottom: -8,
    fontFamily: fonts.heading,
    fontSize: 48,
    lineHeight: 52,
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 0,
  },
  credit: { fontSize: fontSize.tiny },
  because: { fontSize: fontSize.small, marginTop: -space.sm },
});
