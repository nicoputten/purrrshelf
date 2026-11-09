import type { ChartEntry } from '@purrshelf/contract';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Badge, type BadgeTone } from '@/components/Badge';
import { BookCover } from '@/components/BookCover';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, fontSize, radius, sizes, space } from '@/theme/tokens';
import type { EntryChip } from './useCharts';

export const ROW_COVER = { width: 52, height: 78 } as const;

const chipTone: Record<EntryChip['kind'], BadgeTone> = {
  library: 'success',
  instant: 'partner',
  request: 'mine',
};

/** A dashed "?" card for a chart book no metadata provider knows. */
export function UnknownCover({ width, height }: { width: number; height: number }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.unknown, { width, height, borderColor: colors.border }]}
    >
      <AppText style={[styles.unknownMark, { color: colors.textMuted }]}>?</AppText>
    </View>
  );
}

interface ChartRowProps {
  entry: ChartEntry;
  chip: EntryChip | null;
  onOpen: (workId: string) => void;
  onSearch: (entry: ChartEntry) => void;
  onMore: (entry: ChartEntry) => void;
}

/**
 * One ranked book (board 13): a big rank number (ginger for 1 to 3), cover,
 * title, author, at most one state chip and a ⋯ menu. Tapping opens the book
 * page; a book nobody knows says "Search for it" and runs that search.
 */
export function ChartRow({ entry, chip, onOpen, onSearch, onMore }: ChartRowProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { work } = entry;
  const top = entry.rank <= 3;
  const author = entry.authors.join(', ') || t('top10.unknownAuthor');
  const label = [
    t('top10.rank', { rank: entry.rank }),
    entry.title,
    author,
    chip?.label,
    work ? null : t('top10.searchForIt'),
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View style={[styles.row, { borderBottomColor: colors.surface }]} testID={`rank-${entry.rank}`}>
      <AppText
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={[
          styles.rank,
          top ? { fontSize: 40, color: colors.accent } : { fontSize: 30, color: colors.textMuted },
        ]}
      >
        {entry.rank}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => (work ? onOpen(work.id) : onSearch(entry))}
        style={styles.main}
      >
        {work ? (
          <BookCover workId={work.id} title={entry.title} {...ROW_COVER} />
        ) : (
          <UnknownCover {...ROW_COVER} />
        )}
        <View style={styles.text}>
          <AppText numberOfLines={2} style={[styles.title, { color: colors.text }]}>
            {entry.title}
          </AppText>
          <AppText variant="muted" numberOfLines={1}>
            {author}
          </AppText>
          {chip ? (
            <View style={styles.chip}>
              <Badge label={chip.label} tone={chipTone[chip.kind]} />
            </View>
          ) : null}
          {work ? null : (
            <AppText style={[styles.link, { color: colors.accent }]}>
              {t('top10.searchForIt')}
            </AppText>
          )}
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('top10.more', { title: entry.title })}
        hitSlop={{ left: 4, right: 4 }}
        onPress={() => onMore(entry)}
        style={styles.more}
      >
        <AppText style={[styles.moreText, { color: colors.textMuted }]}>⋯</AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
  },
  rank: { width: 44, textAlign: 'center', fontFamily: fonts.heading, lineHeight: 44 },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, minWidth: 0 },
  text: { flex: 1, gap: space.xs, minWidth: 0 },
  title: { fontFamily: fonts.headingMedium, fontSize: fontSize.body, lineHeight: 18 },
  chip: { flexDirection: 'row' },
  link: { fontFamily: fonts.bodyBold, fontSize: fontSize.small },
  // 36 wide + 4 hit slop each side = a 44 px target.
  more: { width: 36, minHeight: sizes.touch, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontFamily: fonts.bodyBold, fontSize: 18 },
  unknown: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: radius.cover - 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unknownMark: { fontFamily: fonts.heading, fontSize: 22 },
});
