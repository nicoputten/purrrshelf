import type { SearchLanguage } from '@purrshelf/contract';
import { useCallback, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { BudgetPill } from '@/components/BudgetPill';
import { Button } from '@/components/Button';
import { Chips } from '@/components/Chips';
import { Logo } from '@/components/Logo';
import { Screen } from '@/components/Screen';
import { SearchField, type SearchInput } from '@/components/SearchField';
import { Snackbar } from '@/components/Snackbar';
import { Nap, PawLoader } from '@/components/motion';
import { useActivity } from '@/features/activity/useActivity';
import { ForYou, type Notice } from '@/features/forYou/ForYou';
import { errorMessage } from '@/lib/errors';
import { fonts } from '@/theme/tokens';
import { SearchResult } from './SearchResult';
import {
  MIN_QUERY_LENGTH,
  SEARCH_DEBOUNCE_MS,
  useBookSearch,
  useDebounced,
  useSearchBudget,
} from './useBookSearch';

export interface SearchScreenProps {
  /** Opens a hit; Book detail (APP-04) passes this in. */
  onOpen?: (workId: string) => void;
  /** Opens the Add sheet (APP-03). */
  onAdd?: (workId: string) => void;
  /** Opens a For you card's book page (APP-12), which then shows the reason. */
  onOpenForYou?: (workId: string) => void;
}

const noop = () => undefined;

/**
 * Search (home): one field, language chips, results with covers and badges
 * (APP-02). With no search going, For you fills the space (APP-12).
 */
export function SearchScreen({ onOpen, onAdd, onOpenForYou }: SearchScreenProps) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [language, setLanguage] = useState<SearchLanguage>('any');
  const debounced = useDebounced(text, SEARCH_DEBOUNCE_MS);
  // Pressing search on the keyboard skips the debounce.
  const query = submitted === text ? text : debounced;
  const search = useBookSearch(query, language);
  const budget = useSearchBudget();
  const openRequests = useActivity((s) => s.openSheet);
  const hits = search.data?.hits ?? [];
  const active = query.trim().length >= MIN_QUERY_LENGTH;
  // Sniffing while the first results load, while new results replace the old
  // ones, and while the typing pause before a search runs.
  const waiting = text.trim() !== query.trim() && text.trim().length >= MIN_QUERY_LENGTH;
  const sniffing = search.isPending || search.isPlaceholderData || waiting;
  const bold = <AppText style={styles.bold} />;
  const field = useRef<SearchInput>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const clearNotice = useCallback(() => setNotice(null), []);

  return (
    <Screen
      overlay={
        notice ? (
          <Snackbar
            message={notice.message}
            actionLabel={t('forYou.undo')}
            onAction={notice.onUndo}
            onDone={clearNotice}
          />
        ) : null
      }
    >
      <View style={styles.header}>
        <Logo />
        <BudgetPill budget={budget} onPress={openRequests} />
      </View>
      <AppText variant="display" accessibilityRole="header">
        {t('home.heading')}
      </AppText>
      <SearchField
        label={t('search.label')}
        placeholder={t('search.placeholder')}
        value={text}
        onChangeText={setText}
        onSubmit={() => setSubmitted(text)}
        inputRef={field}
      />
      <Chips<SearchLanguage>
        label={t('search.languageLabel')}
        value={language}
        onChange={setLanguage}
        options={[
          { value: 'any', label: t('search.anyLanguage') },
          { value: 'en', label: 'English' },
          { value: 'nl', label: 'Nederlands' },
        ]}
      />

      {!active && !waiting ? (
        <ForYou
          onOpen={onOpenForYou ?? onOpen ?? noop}
          onSearch={() => field.current?.focus()}
          onNotice={setNotice}
        />
      ) : search.isError && !search.data ? (
        <View style={styles.state} accessibilityRole="alert">
          <AppText>{errorMessage(search.error, t)}</AppText>
          <Button
            label={t('search.retry')}
            variant="outline"
            onPress={() => void search.refetch()}
          />
        </View>
      ) : sniffing ? (
        <View style={styles.state}>
          <PawLoader />
          <AppText variant="muted">{t('search.searching')}</AppText>
        </View>
      ) : hits.length === 0 ? (
        <View style={styles.state}>
          <Nap />
          <AppText style={styles.bold}>{t('search.noResultsTitle')}</AppText>
          <AppText variant="muted">{t('search.noResultsHint')}</AppText>
        </View>
      ) : (
        <>
          <AppText variant="muted" accessibilityLiveRegion="polite">
            <Trans i18nKey="search.found" count={hits.length} components={{ b: bold }} />
          </AppText>
          <View style={styles.list}>
            {hits.map((hit) => (
              <SearchResult
                key={hit.id}
                hit={hit}
                {...(onOpen ? { onPress: () => onOpen(hit.id) } : {})}
                {...(onAdd ? { onAdd: () => onAdd(hit.id) } : {})}
              />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  state: { alignItems: 'center', gap: 12, paddingVertical: 24 },
  list: { gap: 12 },
  bold: { fontFamily: fonts.bodyBold },
});
