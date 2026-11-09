import type { ChartEntry, ChartRegion } from '@purrshelf/contract';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { BudgetPill } from '@/components/BudgetPill';
import { Button } from '@/components/Button';
import { Chips } from '@/components/Chips';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { Nap, PawLoader } from '@/components/motion';
import { useSearchBudget } from '@/features/search/useBookSearch';
import { errorMessage } from '@/lib/errors';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, fontSize, radius, space } from '@/theme/tokens';
import { ChartRow, ROW_COVER } from './ChartRow';
import {
  DEFAULT_GENRE,
  chipGenres,
  entryChip,
  findChart,
  formatUpdated,
  hasTrending,
  homeRegion,
  otherRegion,
  searchQueryFor,
  useCachedRequests,
  useCharts,
  type ChipGenre,
  type Source,
} from './useCharts';

/** A full list; fewer books than this gets "That's all N for today". */
const FULL_LIST = 10;

export interface Top10ScreenProps {
  /** The genre to show, e.g. from the Search teaser's "See all". */
  genre?: ChipGenre;
  /** Opens a book page. */
  onOpen: (workId: string) => void;
  /** Runs a free metadata search on the Search tab. */
  onSearch: (query: string) => void;
  /** The budget pill opens Requests. */
  onOpenRequests: () => void;
}

/**
 * Top 10 (APP-15, boards 13 and 15): ranked genre lists from Apple Books
 * bestsellers and Hardcover trending. Free to look at: nothing here spends a
 * search; only Add on the book page does.
 */
export function Top10Screen({ genre: wanted, onOpen, onSearch, onOpenRequests }: Top10ScreenProps) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const charts = useCharts();
  const budget = useSearchBudget();
  const requests = useCachedRequests();
  const [genre, setGenre] = useState<ChipGenre>(wanted ?? DEFAULT_GENRE);
  // Bestsellers by default for everyone; Trending (English, global) only when picked.
  const [source, setSource] = useState<Source>('apple');
  const [pickedRegion, setPickedRegion] = useState<ChartRegion | null>(null);
  const [menuFor, setMenuFor] = useState<ChartEntry | null>(null);

  // A new genre from the route ("See all" on Search) wins over the chip.
  const [lastWanted, setLastWanted] = useState(wanted);
  if (wanted !== lastWanted) {
    setLastWanted(wanted);
    if (wanted) setGenre(wanted);
  }

  const data = charts.data;
  const region = pickedRegion ?? homeRegion(data);
  const other = region ? otherRegion(data, region) : null;
  const trending = hasTrending(data);
  const chart = data ? findChart(data, source, region, genre) : null;
  // A failed refresh keeps the last answer on screen (react-query holds it).
  const stale = !!data && (data.stale || charts.isError);
  const retry = () => void charts.refetch();
  const search = (entry: ChartEntry) => onSearch(searchQueryFor(entry));

  let body;
  if (!data && charts.isError) {
    body = (
      <View style={styles.state} accessibilityRole="alert">
        <AppText style={styles.center}>{errorMessage(charts.error, t)}</AppText>
        <Button label={t('top10.retry')} variant="outline" onPress={retry} />
      </View>
    );
  } else if (!data) {
    body = (
      <View style={styles.list}>
        <View style={styles.loading}>
          <PawLoader size={20} />
          <AppText variant="muted">{t('top10.loading')}</AppText>
        </View>
        <Skeleton />
      </View>
    );
  } else if (!chart || chart.items.length === 0) {
    body = (
      <View style={styles.state}>
        <Nap />
        <AppText style={[styles.emptyTitle, { color: colors.text }]} accessibilityRole="header">
          {t('top10.emptyTitle', { genre: t(`top10.genre.${genre}`) })}
        </AppText>
        <AppText variant="muted" style={styles.center}>
          {source === 'apple' && trending ? t('top10.emptyHint') : t('top10.emptyHintTrending')}
        </AppText>
        {source === 'apple' && trending ? (
          <Button label={t('top10.showTrending')} onPress={() => setSource('hardcover')} />
        ) : null}
      </View>
    );
  } else {
    body = (
      <View>
        <View style={stale ? styles.faded : undefined}>
          {chart.items.map((entry) => (
            <ChartRow
              key={`${entry.rank}-${entry.title}`}
              entry={entry}
              chip={entryChip(entry, requests, t)}
              onOpen={onOpen}
              onSearch={search}
              onMore={setMenuFor}
            />
          ))}
        </View>
        {chart.items.length < FULL_LIST ? (
          <AppText variant="muted" style={styles.fewer}>
            {t('top10.fewer', { count: chart.items.length })}
          </AppText>
        ) : null}
      </View>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="title" accessibilityRole="header">
          {t('top10.title')}
        </AppText>
        <BudgetPill budget={budget} onPress={onOpenRequests} />
      </View>

      {trending ? (
        <Segmented<Source>
          label={t('top10.sourceLabel')}
          value={source}
          onChange={setSource}
          options={[
            { value: 'apple', label: t('top10.bestsellers') },
            { value: 'hardcover', label: t('top10.trending') },
          ]}
        />
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chipContent}
      >
        <Chips<ChipGenre>
          label={t('top10.genreLabel')}
          value={genre}
          onChange={setGenre}
          options={chipGenres.map((g) => ({ value: g, label: t(`top10.genre.${g}`) }))}
        />
      </ScrollView>

      {source === 'apple' && region && other ? (
        <View style={styles.language}>
          <AppText variant="muted" style={styles.flex}>
            {t('top10.chart')}{' '}
            <AppText style={[styles.bold, { color: colors.text }]}>
              {t(`top10.region.${region}`)}
            </AppText>
          </AppText>
          <Button
            label={t(`top10.switchTo.${other}`)}
            variant="outline"
            compact
            onPress={() => setPickedRegion(other)}
          />
        </View>
      ) : null}

      {stale ? (
        <View
          accessibilityRole="alert"
          style={[styles.staleRow, { backgroundColor: colors.surfaceRaised }]}
        >
          <AppText style={[styles.flex, { color: colors.text }]}>{t('top10.stale')}</AppText>
          <Button label={t('top10.retry')} variant="text" compact onPress={retry} />
        </View>
      ) : null}

      {body}

      {data ? (
        <AppText variant="muted" style={styles.credit}>
          {source === 'apple' ? t('top10.creditApple') : t('top10.creditHardcover')}
          {' · '}
          {t(stale ? 'top10.lastUpdated' : 'top10.updated', {
            time: formatUpdated(data.updatedAt, i18n.language),
          })}
        </AppText>
      ) : null}

      <RowMenu
        entry={menuFor}
        onClose={() => setMenuFor(null)}
        onOpen={(id) => {
          setMenuFor(null);
          onOpen(id);
        }}
        onSearch={(entry) => {
          setMenuFor(null);
          search(entry);
        }}
      />
    </Screen>
  );
}

/** Grey rank rows while the first charts of the day are fetched. */
function Skeleton() {
  const { colors } = useTheme();
  const grey = { backgroundColor: colors.surfaceRaised };
  return (
    <View
      style={styles.list}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={styles.skelRow}>
          <View style={[styles.skelRank, grey]} />
          <View style={[styles.skelCover, grey]} />
          <View style={styles.skelText}>
            <View style={[styles.skelTitle, grey]} />
            <View style={[styles.skelAuthor, grey]} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** The ⋯ menu: Open book page, or Search for it for a book nobody knows. */
function RowMenu({
  entry,
  onClose,
  onOpen,
  onSearch,
}: {
  entry: ChartEntry | null;
  onClose: () => void;
  onOpen: (workId: string) => void;
  onSearch: (entry: ChartEntry) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const work = entry?.work ?? null;
  const options = entry
    ? work
      ? [{ key: 'open', label: t('top10.open'), run: () => onOpen(work.id) }]
      : [{ key: 'search', label: t('top10.searchForIt'), run: () => onSearch(entry) }]
    : [];
  return (
    <Modal visible={entry !== null} transparent animationType="fade" onRequestClose={onClose}>
      <View
        accessibilityViewIsModal
        style={[styles.scrim, { backgroundColor: `${colors.scrim}99` }]}
      >
        <Pressable
          accessibilityLabel={t('top10.closeMenu')}
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />
        <View
          accessibilityRole="menu"
          accessibilityLabel={entry?.title}
          style={[styles.menu, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          {options.map((o) => (
            <Pressable
              key={o.key}
              accessibilityRole="menuitem"
              accessibilityLabel={o.label}
              onPress={o.run}
              style={styles.option}
            >
              <AppText style={[styles.optionText, { color: colors.text }]}>{o.label}</AppText>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chipScroll: { marginRight: -space.xl, flexGrow: 0 },
  chipContent: { paddingRight: space.xl },
  language: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  staleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderRadius: radius.button,
    paddingVertical: space.xs,
    paddingLeft: space.md,
  },
  list: { gap: space.md },
  loading: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  state: { alignItems: 'center', gap: space.md, paddingVertical: space.xl },
  emptyTitle: { fontFamily: fonts.heading, fontSize: fontSize.sheetTitle, textAlign: 'center' },
  faded: { opacity: 0.85 },
  fewer: { marginTop: space.md },
  credit: { fontSize: fontSize.tiny },
  skelRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  skelRank: { width: 44, height: 30, borderRadius: 8 },
  skelCover: { ...ROW_COVER, borderRadius: radius.cover - 3 },
  skelText: { gap: space.sm },
  skelTitle: { width: 150, height: 14, borderRadius: 7 },
  skelAuthor: { width: 90, height: 12, borderRadius: 6 },
  scrim: { flex: 1, justifyContent: 'flex-end', padding: space.lg },
  menu: { borderWidth: 1, borderRadius: radius.sheet, paddingVertical: space.sm },
  option: { minHeight: 52, justifyContent: 'center', paddingHorizontal: space.xl },
  optionText: { fontFamily: fonts.bodyBold, fontSize: fontSize.body },
  bold: { fontFamily: fonts.bodyBold },
  center: { textAlign: 'center' },
  flex: { flex: 1 },
});
