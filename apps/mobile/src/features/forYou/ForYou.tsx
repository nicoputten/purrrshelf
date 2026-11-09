import type { Recommendation, RecommendationRow } from '@purrshelf/contract';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Nap, PawLoader } from '@/components/motion';
import { PawPrint } from '@/components/motion/PawPrint';
import { useMe } from '@/features/settings/SettingsScreen';
import { errorMessage } from '@/lib/errors';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, fontSize, radius, space } from '@/theme/tokens';
import { CARD_WIDTH, COVER_HEIGHT, RecommendationCard } from './RecommendationCard';
import { rowTitle } from './reason';
import { useDismiss, useRecommendations } from './useRecommendations';

/** A short message with Undo, shown by the screen around For you. */
export interface Notice {
  message: string;
  onUndo: () => void;
}

export interface ForYouProps {
  /** Opens the book page for a card. */
  onOpen: (workId: string) => void;
  /** "Search for a book" on the empty state: focus the search field. */
  onSearch: () => void;
  /** Shows the snackbar after Not for me / Fewer by this author. */
  onNotice: (notice: Notice) => void;
}

/**
 * For you (APP-12, boards 10 and 12): up to three rows of suggestions under
 * the search bar. Free to look at: the broker never spends a search on these.
 */
export function ForYou({ onOpen, onSearch, onNotice }: ForYouProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const me = useMe();
  const recs = useRecommendations();
  const { dismiss, undo } = useDismiss();
  const [menuFor, setMenuFor] = useState<Recommendation | null>(null);
  const name = me.data?.displayName;
  const data = recs.data;

  const hide = (item: Recommendation, kind: 'book' | 'author') => {
    setMenuFor(null);
    const workId = item.work.id;
    dismiss.mutate({ workId, kind });
    onNotice({
      message:
        kind === 'book'
          ? t('forYou.hidden', { title: item.work.title })
          : t('forYou.fewer', { author: item.work.authors[0] ?? '' }),
      onUndo: () => undo.mutate(workId),
    });
  };

  let body;
  if (!data && recs.isError) {
    // METADATA_UNAVAILABLE and friends come translated from errors.*.
    body = (
      <View style={styles.state} accessibilityRole="alert">
        <AppText style={styles.center}>{errorMessage(recs.error, t)}</AppText>
        <Button label={t('forYou.retry')} variant="outline" onPress={() => void recs.refetch()} />
      </View>
    );
  } else if (!data) {
    body = (
      <View>
        <View style={styles.state}>
          <PawLoader />
          <AppText variant="muted">{t('forYou.loading')}</AppText>
        </View>
        <Skeleton />
      </View>
    );
  } else if (data.rows.length === 0) {
    body = (
      <View style={styles.state}>
        <Nap />
        <AppText style={styles.bold}>{t('forYou.emptyTitle')}</AppText>
        <AppText variant="muted" style={styles.center}>
          {data.readingData ? t('forYou.emptyHint') : t('forYou.emptyHintOwned')}
        </AppText>
        <Button label={t('forYou.searchForBook')} variant="outline" onPress={onSearch} />
      </View>
    );
  } else {
    body = (
      <View style={styles.rows}>
        {data.rows.map((row) => (
          <Row
            key={row.kind}
            row={row}
            readingData={data.readingData}
            onOpen={onOpen}
            onMore={setMenuFor}
          />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <View style={styles.titleRow}>
        <PawPrint color={colors.accent} size={22} />
        <AppText style={[styles.title, { color: colors.text }]} accessibilityRole="header">
          {name ? t('forYou.title', { name }) : t('forYou.titleNoName')}
        </AppText>
      </View>
      <AppText variant="muted">{t('forYou.subtitle')}</AppText>

      {data?.stale ? (
        <View style={styles.staleRow}>
          <AppText variant="muted" style={styles.flex}>
            {t('forYou.stale')}
          </AppText>
          <Button
            label={t('forYou.retry')}
            variant="text"
            compact
            onPress={() => void recs.refetch()}
          />
        </View>
      ) : null}
      {data && !data.readingData ? <KoboHint /> : null}
      {body}

      <CardMenu
        item={menuFor}
        onClose={() => setMenuFor(null)}
        onOpen={(id) => {
          setMenuFor(null);
          onOpen(id);
        }}
        onHide={hide}
      />
    </View>
  );
}

function Row({
  row,
  readingData,
  onOpen,
  onMore,
}: {
  row: RecommendationRow;
  readingData: boolean;
  onOpen: (workId: string) => void;
  onMore: (item: Recommendation) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { title, hint } = rowTitle(row, readingData, t);
  return (
    <View style={styles.row} accessibilityLabel={title}>
      <View style={styles.rowHead}>
        <AppText
          style={[styles.rowTitle, { color: colors.text }]}
          accessibilityRole="header"
          numberOfLines={1}
        >
          {title}
        </AppText>
        <AppText variant="muted" style={styles.hint}>
          {hint}
        </AppText>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cards}
      >
        {row.items.map((item) => (
          <RecommendationCard
            key={item.work.id}
            item={item}
            onOpen={() => onOpen(item.work.id)}
            onMore={() => onMore(item)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function KoboHint() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View
      style={[styles.hintCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <AppText style={styles.bold}>{t('forYou.koboTitle')}</AppText>
      <AppText variant="muted">{t('forYou.koboHint')}</AppText>
      {open ? (
        <AppText variant="muted">{t('forYou.koboHowAnswer')}</AppText>
      ) : (
        <Button label={t('forYou.koboHow')} variant="text" compact onPress={() => setOpen(true)} />
      )}
    </View>
  );
}

/** Grey card shapes while the first answer of the day is worked out. */
function Skeleton() {
  const { colors } = useTheme();
  return (
    <View
      style={styles.rows}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {[0, 1].map((r) => (
        <View key={r} style={styles.row}>
          <View style={[styles.skelTitle, { backgroundColor: colors.surfaceRaised }]} />
          <View style={styles.cards}>
            {[0, 1, 2].map((c) => (
              <View key={c} style={[styles.skelCover, { backgroundColor: colors.surfaceRaised }]} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

/** The ⋯ menu: Open book page / Not for me / Fewer by this author. */
function CardMenu({
  item,
  onClose,
  onOpen,
  onHide,
}: {
  item: Recommendation | null;
  onClose: () => void;
  onOpen: (workId: string) => void;
  onHide: (item: Recommendation, kind: 'book' | 'author') => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const options = item
    ? [
        {
          key: 'open',
          label: t('forYou.open'),
          color: colors.text,
          run: () => onOpen(item.work.id),
        },
        {
          key: 'book',
          label: t('forYou.notForMe'),
          color: colors.danger,
          run: () => onHide(item, 'book'),
        },
        ...(item.work.authors.length > 0
          ? [
              {
                key: 'author',
                label: t('forYou.fewerByAuthor'),
                color: colors.text,
                run: () => onHide(item, 'author'),
              },
            ]
          : []),
      ]
    : [];
  return (
    <Modal visible={item !== null} transparent animationType="fade" onRequestClose={onClose}>
      <View
        accessibilityViewIsModal
        style={[styles.scrim, { backgroundColor: `${colors.scrim}99` }]}
      >
        <Pressable
          accessibilityLabel={t('forYou.closeMenu')}
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />
        <View
          accessibilityRole="menu"
          accessibilityLabel={item?.work.title}
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
              <AppText style={[styles.optionText, { color: o.color }]}>{o.label}</AppText>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm, marginTop: space.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { fontFamily: fonts.heading, fontSize: 24, flexShrink: 1 },
  rows: { gap: space.lg, marginTop: space.sm },
  row: { gap: space.sm },
  rowHead: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  rowTitle: { fontFamily: fonts.heading, fontSize: 18, flexShrink: 1 },
  hint: { marginLeft: 'auto' },
  cards: { flexDirection: 'row', gap: space.md },
  state: { alignItems: 'center', gap: space.md, paddingVertical: space.xl },
  staleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  hintCard: { borderWidth: 1, borderRadius: radius.card, padding: space.lg, gap: space.xs },
  skelTitle: { width: 160, height: 16, borderRadius: radius.pill },
  skelCover: { width: CARD_WIDTH, height: COVER_HEIGHT, borderRadius: radius.cover },
  scrim: { flex: 1, justifyContent: 'flex-end', padding: space.lg },
  menu: { borderWidth: 1, borderRadius: radius.sheet, paddingVertical: space.sm },
  option: { minHeight: 52, justifyContent: 'center', paddingHorizontal: space.xl },
  optionText: { fontFamily: fonts.bodyBold, fontSize: fontSize.body },
  bold: { fontFamily: fonts.bodyBold },
  center: { textAlign: 'center' },
  flex: { flex: 1 },
});
