import type { LibraryState, SimilarWorks, WorkDetail, WorkSeries } from '@purrshelf/contract';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { AppText } from '@/components/AppText';
import { Badge, type BadgeTone } from '@/components/Badge';
import { BookCover } from '@/components/BookCover';
import { Button } from '@/components/Button';
import { CatEars } from '@/components/CatEars';
import { Screen } from '@/components/Screen';
import { languageName } from '@/features/search/SearchResult';
import { errorMessage } from '@/lib/errors';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, fontSize, radius, sizes } from '@/theme/tokens';
import { positionLabel, seriesStates, type SeriesEntryState } from './series';
import { SimilarBooks } from './SimilarBooks';
import { useSimilarWorks, useWork, useWorkSeries } from './useWork';

export interface BookDetailProps {
  id: string;
  onBack: () => void;
  /** Opens another book (a series entry or a similar book). */
  onOpen: (workId: string) => void;
  /**
   * Adds a book to the library. Adding is always an explicit tap, never
   * automatic (APP-09); without a handler the "Add next" button is hidden.
   */
  onAdd?: (workId: string) => void;
}

/** "Lantern Keepers · 1/3 · English · EPUB". */
export function metaLine(work: WorkDetail): string {
  const parts: string[] = [];
  if (work.series) {
    const pos = positionLabel(work.series.position, work.series.total);
    parts.push(pos ? `${work.series.name} · ${pos}` : work.series.name);
  }
  if (work.language) parts.push(languageName(work.language));
  // The library stores EPUB (ADR 0016); a book we don't have has no format yet.
  if (work.library) parts.push('EPUB');
  return parts.join(' · ');
}

/** "Yours" and one "<name>'s" per other owner. */
export function ownerBadges(library: LibraryState | null, t: TFunction) {
  if (!library) return [];
  return [...library.owners]
    .sort((a, b) => Number(b.me) - Number(a.me))
    .map((o) => ({
      label: o.me ? t('book.yours') : t('book.ownerBook', { name: o.displayName }),
      tone: (o.me ? 'mine' : 'partner') as BadgeTone,
    }));
}

/** Book detail (APP-04, canvas board 2). */
export function BookDetailScreen({ id, onBack, onOpen, onAdd }: BookDetailProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const work = useWork(id);
  const series = useWorkSeries(id, Boolean(work.data?.series));
  const similar = useSimilarWorks(id, work.isSuccess);

  return (
    <Screen>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('book.back')}
          onPress={onBack}
          style={styles.iconButton}
        >
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
            <Path
              d="M15 5L8 12L15 19"
              stroke={colors.text}
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Pressable>
      </View>

      {work.isPending ? (
        <View style={styles.state}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : work.isError ? (
        <View style={styles.state} accessibilityRole="alert">
          <AppText>{errorMessage(work.error, t)}</AppText>
          <Button label={t('search.retry')} variant="outline" onPress={() => void work.refetch()} />
        </View>
      ) : (
        <BookDetail
          work={work.data}
          series={series.data}
          similar={similar.data}
          onOpen={onOpen}
          onAdd={onAdd}
          t={t}
        />
      )}
    </Screen>
  );
}

function BookDetail({
  work,
  series,
  similar,
  onOpen,
  onAdd,
  t,
}: {
  work: WorkDetail;
  series: WorkSeries | undefined;
  similar: SimilarWorks | undefined;
  onOpen: (id: string) => void;
  onAdd: ((id: string) => void) | undefined;
  t: TFunction;
}) {
  const { colors } = useTheme();
  const meta = metaLine(work);
  const owners = ownerBadges(work.library, t);
  return (
    <>
      <View style={styles.hero}>
        <View>
          <CatEars color={colors.surfaceRaised} />
          <BookCover workId={work.id} title={work.title} width={112} height={168} size="l" />
        </View>
        <View style={styles.heroText}>
          <AppText accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
            {work.title}
          </AppText>
          {work.authors.length ? <AppText>{work.authors.join(', ')}</AppText> : null}
          {meta ? <AppText variant="muted">{meta}</AppText> : null}
          {owners.length ? (
            <View style={styles.badges}>
              {owners.map((b) => (
                <Badge key={b.label} {...b} />
              ))}
            </View>
          ) : null}
        </View>
      </View>

      {!work.library && onAdd ? (
        <Button label={t('add.addToLibrary')} onPress={() => onAdd(work.id)} />
      ) : null}

      {work.library ? (
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <AppText style={styles.section}>{t('book.devices')}</AppText>
          <View style={styles.deviceRow}>
            <AppText style={styles.deviceName}>{t('book.yourKobo')}</AppText>
            <AppText style={{ color: work.library.onMyKobo ? colors.success : colors.textMuted }}>
              {work.library.onMyKobo ? t('book.onDevice') : t('book.notOnDevice')}
            </AppText>
          </View>
        </View>
      ) : null}

      {work.description ? (
        <AppText style={{ color: colors.textBody }}>{work.description}</AppText>
      ) : null}

      {series && series.series && series.entries.length > 0 ? (
        <SeriesList series={series} currentId={work.id} onOpen={onOpen} onAdd={onAdd} t={t} />
      ) : null}

      {similar ? <SimilarBooks similar={similar} onOpen={onOpen} /> : null}
    </>
  );
}

const STATE_TONE: Record<SeriesEntryState, BadgeTone> = {
  thisBook: 'mine',
  inLibrary: 'success',
  addNext: 'neutral',
  add: 'neutral',
};

function SeriesList({
  series,
  currentId,
  onOpen,
  onAdd,
  t,
}: {
  series: WorkSeries;
  currentId: string;
  onOpen: (id: string) => void;
  onAdd: ((id: string) => void) | undefined;
  t: TFunction;
}) {
  const { colors } = useTheme();
  const states = seriesStates(series, currentId);
  const next = series.entries[states.indexOf('addNext')];
  return (
    <View style={styles.seriesWrap}>
      <AppText style={styles.section} accessibilityRole="header">
        {t('book.seriesTitle', { name: series.series?.name })}
      </AppText>
      {series.entries.map((entry, i) => {
        const state = states[i] ?? 'add';
        const label = t(`book.series.${state}`);
        const current = state === 'thisBook';
        return (
          <Pressable
            key={entry.work.id}
            accessibilityRole="button"
            accessibilityLabel={`${entry.position ?? ''} ${entry.work.title}, ${label}`.trim()}
            accessibilityState={{ selected: current }}
            disabled={current}
            onPress={() => onOpen(entry.work.id)}
            style={[styles.seriesRow, { backgroundColor: colors.surface }]}
          >
            <AppText style={[styles.position, { color: colors.textMuted }]}>
              {entry.position ?? '·'}
            </AppText>
            <BookCover workId={entry.work.id} title={entry.work.title} width={36} height={54} />
            <AppText numberOfLines={2} style={[styles.seriesTitle, { color: colors.text }]}>
              {entry.work.title}
            </AppText>
            <Badge label={label} tone={STATE_TONE[state]} />
          </Pressable>
        );
      })}
      {next && onAdd ? (
        <Button
          label={t('book.addNextInSeries', { title: next.work.title })}
          variant="outline"
          onPress={() => onAdd(next.work.id)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', justifyContent: 'space-between' },
  iconButton: {
    width: sizes.touch,
    height: sizes.touch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  state: { alignItems: 'center', gap: 12, paddingVertical: 40 },
  hero: { flexDirection: 'row', gap: 16, alignItems: 'flex-start', paddingTop: 12 },
  heroText: { flex: 1, gap: 6 },
  title: { fontFamily: fonts.heading, fontSize: fontSize.heading },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  card: { borderRadius: radius.card, padding: 16, gap: 10 },
  section: { fontFamily: fonts.heading, fontSize: fontSize.section },
  deviceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  deviceName: { fontFamily: fonts.bodyBold },
  seriesWrap: { gap: 8 },
  seriesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: radius.card - 4,
    minHeight: sizes.touch,
  },
  position: { width: 18, textAlign: 'center', fontFamily: fonts.bodyBold },
  seriesTitle: { flex: 1, fontFamily: fonts.headingMedium, fontSize: fontSize.body },
});
