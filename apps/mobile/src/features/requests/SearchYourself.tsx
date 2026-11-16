import type { IndexerBudget, SearchAttemptView } from '@purrshelf/contract';
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { AppText } from '@/components/AppText';
import { PawIcon } from '@/components/TabIcons';
import { TextField } from '@/components/TextField';
import { EarsButton, Nap, PawLoader } from '@/components/motion';
import { i18n } from '@/i18n';
import { errorMessage } from '@/lib/errors';
import { Screen } from '@/components/Screen';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, fontSize, radius, sizes, space } from '@/theme/tokens';
import { defaultIndexer, firstWords, searchableIndexers, suggestWords } from './searchWords';
import { useIndexerBudgets, useManualSearch, useRequestSearches, useRequests } from './useRequests';

/** How many earlier searches "What we tried" shows. */
const TRIED_SHOWN = 4;

/** "nothing", "12 results" or "no answer" for one earlier search. */
export function triedOutcome(s: SearchAttemptView, t: TFunction): string {
  if (s.failed) return t('searchYourself.failed');
  if (s.resultCount === 0) return t('searchYourself.nothing');
  return t('searchYourself.results', { count: s.resultCount });
}

/**
 * Search it yourself (APP-18, canvas board 16): the reader's own words on
 * one indexer, one search, then Pick the right one with every result.
 */
export function SearchYourselfScreen({
  requestId,
  onBack,
  onResults,
}: {
  requestId: string;
  onBack: () => void;
  /** The search found something: show the picker for the reader's results. */
  onResults: (search: { words: string; indexer: string }) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const requests = useRequests();
  const request = requests.data?.requests.find((r) => r.id === requestId);
  const tried = useRequestSearches(requestId);
  const budget = useIndexerBudgets();
  const search = useManualSearch();
  const [words, setWords] = useState<string | null>(null);
  const [indexerId, setIndexerId] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);

  const suggestions = request ? suggestWords(request.title, request.authors) : [];
  const triedList = tried.data?.searches ?? [];
  const current =
    words ??
    (tried.isPending
      ? ''
      : firstWords(
          suggestions,
          triedList.map((s) => s.words),
        ));
  const indexers = searchableIndexers(budget.data);
  const indexer = indexers.find((i) => i.indexerId === indexerId) ?? defaultIndexer(indexers);
  const noneLeft = indexer !== null && indexer.searches.left === 0;
  const bold = <AppText style={styles.bold} />;

  const go = () => {
    if (!indexer || !current.trim()) return;
    setEmpty(false);
    search.mutate(
      { id: requestId, words: current.trim(), indexerId: indexer.indexerId },
      {
        onSuccess: ({ resultCount }) => {
          if (resultCount === 0) setEmpty(true);
          else onResults({ words: current.trim(), indexer: indexer.name });
        },
      },
    );
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('book.back')}
          onPress={onBack}
          style={[styles.back, { backgroundColor: colors.surface }]}
        >
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path
              d="M15 5L8 12L15 19"
              stroke={colors.text}
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Pressable>
        <View style={styles.fill}>
          <AppText variant="title" accessibilityRole="header">
            {t('searchYourself.title')}
          </AppText>
          {request ? (
            <AppText variant="muted" numberOfLines={1}>
              {[request.title, request.authors[0]].filter(Boolean).join(' · ')}
            </AppText>
          ) : null}
        </View>
      </View>

      {triedList.length > 0 ? (
        <View style={[styles.card, { backgroundColor: colors.surfaceMuted }]}>
          <AppText style={[styles.section, { color: colors.textMuted }]}>
            {t('searchYourself.tried')}
          </AppText>
          {triedList.slice(0, TRIED_SHOWN).map((s, i) => (
            <View key={`${s.createdAt}-${i}`} style={styles.triedRow}>
              <AppText style={[styles.fill, { color: colors.text }]} numberOfLines={1}>
                “{s.words}” · {s.indexerName}
              </AppText>
              <AppText variant="muted">{triedOutcome(s, t)}</AppText>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.group}>
        <TextField
          label={t('searchYourself.words')}
          value={current}
          onChangeText={(text) => {
            setWords(text);
            setEmpty(false);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={go}
        />
        {suggestions.length > 0 ? (
          <View style={styles.chips}>
            <AppText variant="muted">{t('searchYourself.try')}</AppText>
            {suggestions
              .filter((s) => s !== current)
              .slice(0, 3)
              .map((s) => (
                <Pressable
                  key={s}
                  accessibilityRole="button"
                  accessibilityLabel={s}
                  onPress={() => {
                    setWords(s);
                    setEmpty(false);
                  }}
                  style={[styles.chip, { borderColor: colors.border }]}
                >
                  <AppText style={[styles.chipText, { color: colors.text }]}>{s}</AppText>
                </Pressable>
              ))}
          </View>
        ) : null}
        <AppText variant="muted">{t('searchYourself.tip')}</AppText>
      </View>

      {budget.isPending ? null : indexers.length === 0 ? (
        <AppText accessibilityRole="alert">{t('searchYourself.noIndexer')}</AppText>
      ) : (
        <View style={styles.group}>
          <AppText style={[styles.bold, { color: colors.text }]}>
            {t('searchYourself.lookOn')}
          </AppText>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={t('searchYourself.lookOn')}
            style={styles.indexers}
          >
            {indexers.map((i) => (
              <IndexerOption
                key={i.indexerId}
                indexer={i}
                selected={i.indexerId === indexer?.indexerId}
                onPress={() => setIndexerId(i.indexerId)}
                t={t}
              />
            ))}
          </View>
        </View>
      )}

      {indexer ? (
        <View style={[styles.cost, { backgroundColor: colors.surfaceRaised }]}>
          <PawIcon color={colors.accent} size={20} />
          <AppText style={styles.fill}>
            <Trans
              i18nKey="searchYourself.cost"
              values={{ indexer: indexer.name }}
              components={{ b: bold }}
            />
          </AppText>
        </View>
      ) : null}

      {search.isError ? (
        <AppText accessibilityRole="alert" style={{ color: colors.danger }}>
          {errorMessage(search.error, t)}
        </AppText>
      ) : null}

      {search.isPending ? (
        <View style={styles.state}>
          <PawLoader />
          <AppText variant="muted">{t('searchYourself.sniffing')}</AppText>
        </View>
      ) : empty ? (
        <View style={styles.state} accessibilityRole="alert">
          <Nap size={96} />
          <AppText style={[styles.bold, { color: colors.text }]}>
            {t('searchYourself.nothingFound')}
          </AppText>
          <AppText variant="muted">{t('searchYourself.nothingFoundText')}</AppText>
        </View>
      ) : null}

      <EarsButton
        label={
          noneLeft && indexer
            ? t('searchYourself.noneLeft', {
                indexer: indexer.name,
                time: new Date(indexer.searches.nextFreeAt).toLocaleTimeString(i18n.language, {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              })
            : t('searchYourself.go')
        }
        onPress={go}
        busy={search.isPending}
        disabled={!indexer || noneLeft || !current.trim()}
      />
    </Screen>
  );
}

function IndexerOption({
  indexer,
  selected,
  onPress,
  t,
}: {
  indexer: IndexerBudget;
  selected: boolean;
  onPress: () => void;
  t: TFunction;
}) {
  const { colors } = useTheme();
  const left = t('searchYourself.left', {
    left: indexer.searches.left,
    limit: indexer.searches.limit,
  });
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${indexer.name}, ${left}`}
      onPress={onPress}
      style={[
        styles.indexer,
        { backgroundColor: colors.surface },
        selected
          ? { borderWidth: 2, borderColor: colors.accent }
          : { borderWidth: 1, borderColor: colors.border },
      ]}
    >
      <AppText style={[styles.bold, { color: colors.text, fontSize: fontSize.body }]}>
        {indexer.name}
      </AppText>
      <AppText variant="muted">{left}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  back: {
    width: sizes.touch,
    height: sizes.touch,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { gap: space.sm, padding: space.lg, borderRadius: radius.card },
  section: { fontFamily: fonts.bodyBold, fontSize: fontSize.tiny, letterSpacing: 0.5 },
  triedRow: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  group: { gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipText: { fontFamily: fonts.bodySemiBold, fontSize: fontSize.small },
  indexers: { flexDirection: 'row', gap: 10 },
  indexer: { flex: 1, gap: 2, padding: space.md, borderRadius: 16, minHeight: sizes.touch },
  cost: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'flex-start',
    padding: space.md,
    borderRadius: 16,
  },
  bold: { fontFamily: fonts.bodyBold },
  state: { alignItems: 'center', gap: space.sm, paddingVertical: space.md },
});
