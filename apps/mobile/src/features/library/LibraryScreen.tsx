import type { LibraryBookEntry } from '@purrshelf/contract';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { BookCover } from '@/components/BookCover';
import { Button } from '@/components/Button';
import { Chips } from '@/components/Chips';
import { Screen } from '@/components/Screen';
import { errorMessage } from '@/lib/errors';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, fontSize, radius, space } from '@/theme/tokens';
import {
  isShared,
  readLabel,
  tabCounts,
  visibleBooks,
  type LibraryTab,
  type LibraryView,
} from './library';
import { useLibraryBooks } from './useLibrary';

export interface LibraryScreenProps {
  /** Opens a book that has a work id; the book page is keyed by work. */
  onOpen: (workId: string) => void;
}

const COLUMNS = 3;
const GAP = 12;
/** Screen's horizontal padding on each side. */
const PADDING = space.xl;

/** Library (APP-07, canvas board 6): Mine / Partner's / All, filters and a cover grid. */
export function LibraryScreen({ onOpen }: LibraryScreenProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<LibraryTab>('mine');
  const [view, setView] = useState<LibraryView>('recent');
  const library = useLibraryBooks();
  const books = library.data?.books;
  const counts = tabCounts(books ?? []);
  const cellWidth = Math.floor((width - PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS);

  return (
    <Screen>
      <AppText variant="display" accessibilityRole="header">
        {t('library.title')}
      </AppText>
      <Chips<LibraryTab>
        label={t('library.tabsLabel')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'mine', label: t('library.mine', { n: counts.mine }) },
          { value: 'partner', label: t('library.partner', { n: counts.partner }) },
          { value: 'all', label: t('library.all', { n: counts.all }) },
        ]}
      />
      <Chips<LibraryView>
        label={t('library.viewLabel')}
        value={view}
        onChange={setView}
        options={[
          { value: 'recent', label: t('library.recent') },
          { value: 'unread', label: t('library.unread') },
          { value: 'onKobo', label: t('library.onKobo') },
          { value: 'series', label: t('library.series') },
        ]}
      />

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
            <ActivityIndicator color={colors.accent} />
          </View>
        )
      ) : (
        <Grid
          books={visibleBooks(books, tab, view)}
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
      {book.reading?.progressPercent ? (
        <View style={[styles.bar, { backgroundColor: colors.surfaceRaised }]}>
          <View
            style={[
              styles.barFill,
              {
                backgroundColor: colors.accent,
                width: `${Math.min(100, Math.max(0, book.reading.progressPercent))}%`,
              },
            ]}
          />
        </View>
      ) : null}
      {status ? (
        <AppText variant="muted" style={styles.status}>
          {status}
        </AppText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  status: { fontSize: fontSize.tiny },
});
