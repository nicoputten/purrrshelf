import type { ImportStatus, LibraryBookEntry } from '@purrshelf/contract';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chips } from '@/components/Chips';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { errorMessage } from '@/lib/errors';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius, space } from '@/theme/tokens';
import { useLibraryBooks } from '../library/useLibrary';
import {
  choiceOf,
  filterBooks,
  matchedSoFar,
  ownerChoices,
  type ImportFilter,
  type OwnerChoice,
} from './assign';
import { useAssignOwners, useImportStatus, useStartImport } from './useImport';

/** Rows shown at first, and added by "Show more", so a big library stays quick. */
export const PAGE = 50;

export interface ImportScreenProps {
  onBack: () => void;
}

/**
 * Import the existing Calibre library (BRK-09): scan it, then say whose each
 * book is, all shown books at once or one by one.
 */
export function ImportScreen({ onBack }: ImportScreenProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const status = useImportStatus();
  const start = useStartImport();
  const library = useLibraryBooks();
  const readers = status.data?.readers ?? [];
  const choices = ownerChoices(readers);
  const assign = useAssignOwners(readers);
  const [filter, setFilter] = useState<ImportFilter>('unassigned');
  const [limit, setLimit] = useState(PAGE);

  const books = library.data?.books ?? [];
  const shown = filterBooks(books, filter);
  const unassigned = books.filter((b) => b.owners.length === 0).length;
  const label = (c: OwnerChoice) => t(c.label.key, { name: c.label.name });
  const running = status.data?.running ?? false;

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
        <AppText variant="title" accessibilityRole="header">
          {t('import.title')}
        </AppText>
      </View>
      <AppText variant="muted">{t('import.intro')}</AppText>

      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        {status.data ? <Progress status={status.data} /> : null}
        <Button
          label={status.data?.startedAt ? t('import.scanAgain') : t('import.scan')}
          busy={start.isPending || running}
          onPress={() => start.mutate()}
        />
        {start.isError ? (
          <AppText accessibilityRole="alert">{errorMessage(start.error, t)}</AppText>
        ) : null}
        {status.isError ? (
          <AppText accessibilityRole="alert">{errorMessage(status.error, t)}</AppText>
        ) : null}
      </View>

      <Chips<ImportFilter>
        label={t('import.filterLabel')}
        value={filter}
        onChange={(f) => {
          setFilter(f);
          setLimit(PAGE);
        }}
        options={[
          { value: 'unassigned', label: t('import.unassigned', { n: unassigned }) },
          { value: 'all', label: t('import.all', { n: books.length }) },
        ]}
      />

      {assign.isError ? (
        <AppText accessibilityRole="alert">{errorMessage(assign.error, t)}</AppText>
      ) : null}

      {!library.data ? (
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
      ) : shown.length === 0 ? (
        <View style={styles.state}>
          <AppText variant="muted">
            {books.length === 0 ? t('import.emptyLibrary') : t('import.allAssigned')}
          </AppText>
        </View>
      ) : (
        <>
          {choices.length > 0 ? (
            <View style={styles.bulk}>
              <AppText variant="label">{t('import.bulk', { n: shown.length })}</AppText>
              <View style={styles.bulkButtons}>
                {choices.map((c) => (
                  <Button
                    key={c.key}
                    compact
                    variant="outline"
                    label={label(c)}
                    accessibilityLabel={t('import.bulkTo', { n: shown.length, who: label(c) })}
                    disabled={assign.isPending}
                    onPress={() =>
                      assign.mutate({ itemIds: shown.map((b) => b.itemId), ownerIds: c.ownerIds })
                    }
                  />
                ))}
              </View>
            </View>
          ) : null}
          {shown.slice(0, limit).map((book) => (
            <Row
              key={book.itemId}
              book={book}
              choices={choices}
              label={label}
              onAssign={(ownerIds) => assign.mutate({ itemIds: [book.itemId], ownerIds })}
            />
          ))}
          {shown.length > limit ? (
            <Button
              variant="outline"
              label={t('import.showMore', { n: shown.length - limit })}
              onPress={() => setLimit((l) => l + PAGE)}
            />
          ) : null}
        </>
      )}
    </Screen>
  );
}

function Progress({ status }: { status: ImportStatus }) {
  const { t } = useTranslation();
  if (!status.startedAt) return <AppText>{t('import.neverRun')}</AppText>;
  if (status.running) {
    return (
      <AppText accessibilityLiveRegion="polite">
        {t('import.matching', { done: matchedSoFar(status), total: status.toMatch })}
      </AppText>
    );
  }
  return (
    <View style={styles.summary}>
      <AppText>{t('import.found', { n: status.scanned, added: status.added })}</AppText>
      {status.toMatch > 0 ? (
        <AppText variant="muted">
          {t('import.matched', { matched: status.matched, unmatched: status.unmatched })}
        </AppText>
      ) : null}
      {status.failed > 0 ? (
        <AppText variant="muted">{t('import.failed', { n: status.failed })}</AppText>
      ) : null}
    </View>
  );
}

function Row({
  book,
  choices,
  label,
  onAssign,
}: {
  book: LibraryBookEntry;
  choices: OwnerChoice[];
  label: (c: OwnerChoice) => string;
  onAssign: (ownerIds: string[]) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { backgroundColor: colors.surface }]}>
      <AppText style={styles.title}>{book.title}</AppText>
      {book.authors.length > 0 ? (
        <AppText variant="muted">{book.authors.join(', ')}</AppText>
      ) : null}
      {choices.length > 0 ? (
        <Segmented<string>
          label={t('import.whose', { title: book.title })}
          value={choiceOf(book, choices)}
          options={choices.map((c) => ({ value: c.key, label: label(c) }))}
          onChange={(key) => {
            const choice = choices.find((c) => c.key === key);
            if (choice) onAssign(choice.ownerIds);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  card: { gap: space.md, padding: space.lg, borderRadius: radius.card },
  summary: { gap: 4 },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md },
  bulk: { gap: space.sm },
  bulkButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  row: { gap: space.sm, padding: space.md, borderRadius: radius.card },
  title: { fontFamily: fonts.bodyBold },
});
