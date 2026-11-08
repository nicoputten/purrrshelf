import {
  MAX_SEARCHES_PER_INDEXER,
  type BookLanguage,
  type BookRequest,
  type Reader,
} from '@purrshelf/contract';
import { useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { AppText } from '@/components/AppText';
import { BookCover } from '@/components/BookCover';
import { Button } from '@/components/Button';
import { CatEars } from '@/components/CatEars';
import { Segmented } from '@/components/Segmented';
import { PawIcon } from '@/components/TabIcons';
import { useWork } from '@/features/book/useWork';
import { useAddRequest, useReaders } from '@/features/requests/useRequests';
import { i18n } from '@/i18n';
import { errorMessage } from '@/lib/errors';
import { usePreferences } from '@/session/preferences';
import { useSession } from '@/session/session';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, fontSize, radius, sizes, space } from '@/theme/tokens';
import { useAddSheet } from './useAddSheet';

/** The work's own language when it is one we fetch, else the last pick, else the app language. */
export function defaultLanguage(
  workLanguage: string | null,
  remembered: BookLanguage | null,
  appLanguage: string,
): BookLanguage {
  if (workLanguage === 'en' || workLanguage === 'nl') return workLanguage;
  if (remembered) return remembered;
  return appLanguage === 'nl' ? 'nl' : 'en';
}

/** "Your Kobo" for me, "Reader Two's Kobo" for anyone else. */
export function koboLabel(reader: Reader, t: TFunction): string {
  return reader.me ? t('add.yourKobo') : t('add.readerKobo', { name: reader.displayName });
}

/** Searches left today over all indexers, and how many one add can cost at most. */
function useCost() {
  const call = useSession((s) => s.call);
  const budget = useQuery({ queryKey: ['budget'], queryFn: () => call('budget') });
  if (!budget.data) return null;
  const active = budget.data.indexers.filter((i) => i.searches.limit > 0).length;
  return {
    left: budget.data.searches.left,
    limit: budget.data.searches.limit,
    max: Math.max(1, active) * MAX_SEARCHES_PER_INDEXER,
  };
}

/** Mounted once at the root: shows the Add sheet whenever a screen opens it. */
export function AddSheetHost({ onAdded }: { onAdded: (request: BookRequest) => void }) {
  const workId = useAddSheet((s) => s.workId);
  const close = useAddSheet((s) => s.close);
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Modal visible={workId !== null} transparent animationType="slide" onRequestClose={close}>
      <View style={[styles.scrim, { backgroundColor: `${colors.scrim}CC` }]}>
        <Pressable accessibilityLabel={t('add.notNow')} style={styles.fill} onPress={close} />
        {workId ? (
          <AddSheet
            key={workId}
            workId={workId}
            onClose={close}
            onAdded={(request) => {
              close();
              onAdded(request);
            }}
          />
        ) : null}
      </View>
    </Modal>
  );
}

/** Add to library (APP-03, canvas board 3). */
export function AddSheet({
  workId,
  onClose,
  onAdded,
}: {
  workId: string;
  onClose: () => void;
  onAdded: (request: BookRequest) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const work = useWork(workId);
  const readers = useReaders();
  const cost = useCost();
  const add = useAddRequest();
  const remembered = usePreferences((s) => s.bookLanguage);
  const setBookLanguage = usePreferences((s) => s.setBookLanguage);
  const [language, setLanguage] = useState<BookLanguage | null>(null);
  const [targets, setTargets] = useState<Set<string> | null>(null);

  const kobos = (readers.data?.readers ?? []).filter((r) => r.kobo);
  const chosenLanguage =
    language ?? defaultLanguage(work.data?.language ?? null, remembered, i18n.language);
  // My own Kobo is ticked until the reader changes the choice.
  const chosen = targets ?? new Set(kobos.filter((r) => r.me).map((r) => r.id));
  const inLibrary = Boolean(work.data?.library);
  const noIndexer = !inLibrary && cost !== null && cost.limit === 0;
  const bold = <AppText style={styles.bold} />;

  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setTargets(next);
  };

  const submit = () => {
    void setBookLanguage(chosenLanguage);
    add.mutate(
      {
        workId,
        language: chosenLanguage,
        pushTo: kobos.filter((r) => chosen.has(r.id)).map((r) => r.id),
      },
      { onSuccess: onAdded },
    );
  };

  return (
    <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: colors.surface }]}>
      <CatEars color={colors.surface} />
      <View style={[styles.handle, { backgroundColor: colors.border }]} />

      {work.isPending ? (
        <ActivityIndicator color={colors.accent} />
      ) : work.isError ? (
        <AppText accessibilityRole="alert">{errorMessage(work.error, t)}</AppText>
      ) : (
        <>
          <View style={styles.hero}>
            <BookCover workId={workId} title={work.data.title} width={56} height={84} size="s" />
            <View style={styles.heroText}>
              <AppText accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
                {inLibrary ? t('add.ownTitle') : t('add.title')}
              </AppText>
              <AppText numberOfLines={2}>
                {[work.data.title, work.data.authors.slice(0, 2).join(', ')]
                  .filter(Boolean)
                  .join(' · ')}
              </AppText>
            </View>
          </View>

          {inLibrary ? null : (
            <Segmented<BookLanguage>
              label={t('add.language')}
              value={chosenLanguage}
              onChange={setLanguage}
              options={[
                { value: 'en', label: 'English' },
                { value: 'nl', label: 'Nederlands' },
              ]}
            />
          )}

          <View style={styles.group}>
            <AppText style={styles.section}>{t('add.sendTo')}</AppText>
            {readers.isPending ? (
              <ActivityIndicator color={colors.accent} />
            ) : kobos.length === 0 ? (
              <AppText variant="muted">{t('add.noKobo')}</AppText>
            ) : (
              kobos.map((r) => (
                <Checkbox
                  key={r.id}
                  label={koboLabel(r, t)}
                  checked={chosen.has(r.id)}
                  onPress={() => toggle(r.id)}
                />
              ))
            )}
          </View>

          {inLibrary ? (
            <AppText variant="muted">{t('add.ownHint')}</AppText>
          ) : cost ? (
            <View style={[styles.cost, { backgroundColor: colors.surfaceRaised }]}>
              <PawIcon color={colors.accent} size={20} />
              <View style={styles.fill}>
                {noIndexer ? (
                  <AppText>{t('add.noIndexer')}</AppText>
                ) : (
                  <>
                    <AppText>
                      <Trans
                        i18nKey="add.cost"
                        values={{ max: cost.max }}
                        components={{ b: bold }}
                      />
                    </AppText>
                    <AppText variant="muted">
                      {t('add.left', { left: cost.left, limit: cost.limit })}
                    </AppText>
                  </>
                )}
              </View>
            </View>
          ) : null}

          {add.isError ? (
            <AppText accessibilityRole="alert" style={{ color: colors.danger }}>
              {errorMessage(add.error, t)}
            </AppText>
          ) : null}

          <Button
            label={inLibrary ? t('add.own') : t('add.fetch')}
            onPress={submit}
            busy={add.isPending}
            disabled={noIndexer || readers.isPending}
          />
          <Button label={t('add.notNow')} variant="text" onPress={onClose} />
        </>
      )}
    </View>
  );
}

function Checkbox({
  label,
  checked,
  onPress,
}: {
  label: string;
  checked: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.checkRow}
    >
      <View
        style={[
          styles.box,
          { borderColor: checked ? colors.accent : colors.border },
          checked && { backgroundColor: colors.accent },
        ]}
      >
        {checked ? (
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Path
              d="M5 12.5L10 17L19 7"
              stroke={colors.onAccent}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        ) : null}
      </View>
      <AppText style={[styles.checkLabel, { color: colors.text }]}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    padding: space.xl,
    paddingTop: space.md,
    gap: space.lg,
  },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: radius.pill },
  hero: { flexDirection: 'row', gap: space.lg, alignItems: 'center' },
  heroText: { flex: 1, gap: space.xs },
  title: { fontFamily: fonts.heading, fontSize: fontSize.heading },
  section: { fontFamily: fonts.bodyBold },
  group: { gap: space.xs },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: sizes.touch },
  box: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkLabel: { fontFamily: fonts.bodySemiBold, fontSize: fontSize.body },
  cost: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'flex-start',
    padding: space.lg,
    borderRadius: radius.card - 4,
  },
  bold: { fontFamily: fonts.bodyBold },
});
