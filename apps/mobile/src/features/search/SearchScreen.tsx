import type { SearchLanguage } from '@purrshelf/contract';
import { router } from 'expo-router';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { BudgetPill } from '@/components/BudgetPill';
import { Button } from '@/components/Button';
import { Chips } from '@/components/Chips';
import { Logo } from '@/components/Logo';
import { Screen } from '@/components/Screen';
import { SearchField } from '@/components/SearchField';
import { errorMessage } from '@/lib/errors';
import { useTheme } from '@/theme/ThemeProvider';
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
}

/** Search (home): one field, language chips, results with covers and badges (APP-02). */
export function SearchScreen({ onOpen, onAdd }: SearchScreenProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [language, setLanguage] = useState<SearchLanguage>('any');
  const debounced = useDebounced(text, SEARCH_DEBOUNCE_MS);
  // Pressing search on the keyboard skips the debounce.
  const query = submitted === text ? text : debounced;
  const search = useBookSearch(query, language);
  const budget = useSearchBudget();
  const hits = search.data?.hits ?? [];
  const active = query.trim().length >= MIN_QUERY_LENGTH;
  const bold = <AppText style={styles.bold} />;

  return (
    <Screen>
      <View style={styles.header}>
        <Logo />
        <BudgetPill budget={budget} onPress={() => router.navigate('/requests')} />
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

      {!active ? (
        <AppText variant="muted">
          <Trans i18nKey="search.freeHint" components={{ b: bold }} />
        </AppText>
      ) : search.isError && !search.data ? (
        <View style={styles.state} accessibilityRole="alert">
          <AppText>{errorMessage(search.error, t)}</AppText>
          <Button
            label={t('search.retry')}
            variant="outline"
            onPress={() => void search.refetch()}
          />
        </View>
      ) : search.isPending ? (
        <View style={styles.state}>
          <ActivityIndicator color={colors.accent} />
          <AppText variant="muted">{t('search.searching')}</AppText>
        </View>
      ) : hits.length === 0 ? (
        <View style={styles.state}>
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
