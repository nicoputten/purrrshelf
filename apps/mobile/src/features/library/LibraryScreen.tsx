import type { LibraryBookEntry } from '@purrshelf/contract';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { BookCover } from '@/components/BookCover';
import { Button } from '@/components/Button';
import { Dropdown } from '@/components/Dropdown';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { Nap, PawLoader } from '@/components/motion';
import { errorMessage } from '@/lib/errors';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, fontSize, radius, space } from '@/theme/tokens';
import {
  barPercent,
  isShared,
  readLabel,
  tabCounts,
  visibleBooks,
  type LibraryFilter,
  type LibrarySort,
  type LibraryTab,
} from './library';
import { useLibraryBooks } from './useLibrary';

export interface LibraryScreenProps {
  /** Opens a book that has a work id; the book page is keyed by work. */
  onOpen: (workId: string) => void;
  /** Opens the full list of my requests (APP-14: Requests is no longer a tab). */
  onRequests?: () => void;
}

const COLUMNS = 3;
const GAP = 12;
/** Screen's horizontal padding on each side. */
const PADDING = space.xl;

/**
 * Library (APP-07, canvas board 6). Two rows of filters: whose books
 * (Mine / Partner's / All), then a filter and a sort dropdown; then a cover
 * grid with the title under each cover.
 */
export function LibraryScreen({ onOpen, onRequests }: LibraryScreenProps) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<LibraryTab>('mine');
  const [filter, setFilter] = useState<LibraryFilter>('any');
  const [sort, setSort] = useState<LibrarySort>('recent');
  const library = useLibraryBooks();
  const books = library.data?.books;
  const counts = tabCounts(books ?? []);
  const cellWidth = Math.floor((width - PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS);

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="display" accessibilityRole="header">
          {t('library.title')}
        </AppText>
        {onRequests ? (
          <Button label={t('library.requests')} variant="outline" compact onPress={onRequests} />
        ) : null}
      </View>
      <Segmented<LibraryTab>
        label={t('library.tabsLabel')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'mine', label: t('library.mine', { n: counts.mine }) },
          { value: 'partner', label: t('library.partner', { n: counts.partner }) },
          { value: 'all', label: t('library.all', { n: counts.all }) },
        ]}
      />
      <View style={styles.menus}>
        <Dropdown<LibraryFilter>
          label={t('library.filterLabel')}
          closeLabel={t('library.closeMenu')}
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'any', label: t('library.anyBook') },
            { value: 'unread', label: t('library.unread') },
            { value: 'reading', label: t('library.reading') },
            { value: 'finished', label: t('library.finished') },
            { value: 'onKobo', label: t('library.onKobo') },
          ]}
        />
        <Dropdown<LibrarySort>
          label={t('library.sortLabel')}
          closeLabel={t('library.closeMenu')}
          value={sort}
          onChange={setSort}
          options={[
            { value: 'recent', label: t('library.recent') },
            { value: 'title', label: t('library.byTitle') },
            { value: 'author', label: t('library.byAuthor') },
            { value: 'series', label: t('library.series') },
          ]}
        />
      </View>

      {library.offline ? (
        <AppText variant="muted" accessibilityRole="alert">
          {t('library.offline')}
        </AppText>
      ) : null}

      {!books ? (
        library.query.isError ? (
          <View style={styles.state} accessibilityRole="alert">
            <AppText>{errorMessage(library.query.error, t)}</AppText>
            <Button
              label={t('search.retry')}
              variant="outline"
              onPress={() => void library.query.refetch()}
            />
          </View>
        ) : (
          <View style={styles.state}>
            <PawLoader />
          </View>
        )
      ) : (
        <Grid
          books={visibleBooks(books, tab, filter, sort)}
          empty={t(`library.empty.${tab}`)}
          cellWidth={cellWidth}
          onOpen={onOpen}
        />
      )}
    </Screen>
  );
}

function Grid({
  books,
  empty,
  cellWidth,
  onOpen,
}: {
  books: LibraryBookEntry[];
  empty: string;
  cellWidth: number;
  onOpen: (workId: string) => void;
}) {
  if (books.length === 0) {
    return (
      <View style={styles.state}>
        <Nap />
        <AppText variant="muted">{empty}</AppText>
      </View>
    );
  }
  return (
    <View style={styles.grid}>
      {books.map((b) => (
        <Cell key={b.itemId} book={b} width={cellWidth} onOpen={onOpen} />
      ))}
    </View>
  );
}

function Cell({
  book,
  width,
  onOpen,
}: {
  book: LibraryBookEntry;
  width: number;
  onOpen: (workId: string) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const label = readLabel(book);
  const status = label
    ? label.key === 'library.percentRead'
      ? t(label.key, { percent: label.percent })
      : t(label.key)
    : null;
  const shared = isShared(book);
  const bar = barPercent(book.reading);
  const { workId } = book;
  const a11y = [
    book.title,
    book.authors.join(', '),
    book.onMyKobo ? t('search.onYourKobo') : null,
    shared ? t('library.both') : null,
    status,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      disabled={!workId}
      onPress={() => workId && onOpen(workId)}
      style={[styles.cell, { width }]}
    >
      <View>
        <BookCover workId={workId ?? book.itemId} title={book.title} width={width} height={150} />
        {shared ? (
          <View style={styles.badgeLeft}>
            <Badge label={t('library.both')} tone="partner" />
          </View>
        ) : null}
        {book.onMyKobo ? (
          <View
            style={[styles.koboBadge, { backgroundColor: colors.successBg }]}
            accessibilityElementsHidden
          >
            <AppText style={[styles.koboText, { color: colors.success }]}>
              {t('library.koboBadge')}
            </AppText>
          </View>
        ) : null}
      </View>
      {bar !== null ? (
        <View style={[styles.bar, { backgroundColor: colors.surfaceRaised }]}>
          <View
            style={[
              styles.barFill,
              {
                backgroundColor: colors.accent,
                width: `${bar}%`,
              },
            ]}
          />
        </View>
      ) : null}
      <AppText numberOfLines={2} style={styles.title}>
        {book.title}
      </AppText>
      {status && label?.key !== 'library.unread' ? (
        <AppText variant="muted" numberOfLines={1} style={styles.status}>
          {status}
        </AppText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  state: { alignItems: 'center', gap: 12, paddingVertical: 40 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  cell: { gap: 6 },
  badgeLeft: { position: 'absolute', top: 6, left: 6 },
  koboBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  koboText: { fontFamily: fonts.bodyBold, fontSize: fontSize.tiny },
  bar: { height: 4, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: 4 },
  title: { fontFamily: fonts.bodySemiBold, fontSize: fontSize.small, lineHeight: 17 },
  status: { fontSize: fontSize.tiny },
  menus: { flexDirection: 'row', flexWrap: 'nowrap', gap: 8 },
});
