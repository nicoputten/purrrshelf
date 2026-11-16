import {
  MAX_SEARCHES_PER_INDEXER,
  type BookRequest,
  type WrongBookNext,
} from '@purrshelf/contract';
import { router } from 'expo-router';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { create } from 'zustand';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { CatEars } from '@/components/CatEars';
import { EarsButton } from '@/components/motion';
import { errorMessage } from '@/lib/errors';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, fontSize, radius, space } from '@/theme/tokens';
import { useWrongBook } from './useRequests';

/** "Wrong book?" stays on a finished request for this long (APP-19, board 16d). */
export const WRONG_BOOK_DAYS = 7;

/** The book reached the library and is recent enough to call it the wrong one. */
export function canCallWrongBook(request: BookRequest, now = new Date()): boolean {
  if (request.status !== 'pushed' && request.status !== 'in_library') return false;
  const age = now.getTime() - new Date(request.updatedAt).getTime();
  return age <= WRONG_BOOK_DAYS * 24 * 60 * 60_000;
}

interface WrongBookState {
  /** The request the sheet is open for; null while closed. */
  request: BookRequest | null;
  open: (request: BookRequest) => void;
  close: () => void;
}

/** One "Wrong book?" sheet for the whole app (book page, Requests). */
export const useWrongBookSheet = create<WrongBookState>((set) => ({
  request: null,
  open: (request) => set({ request }),
  close: () => set({ request: null }),
}));

export function WrongBookSheetHost() {
  const request = useWrongBookSheet((s) => s.request);
  const close = useWrongBookSheet((s) => s.close);
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Modal visible={request !== null} transparent animationType="slide" onRequestClose={close}>
      <View style={[styles.scrim, { backgroundColor: `${colors.scrim}CC` }]}>
        <Pressable accessibilityLabel={t('wrongBook.keep')} style={styles.fill} onPress={close} />
        {request ? (
          <WrongBookSheet
            key={request.id}
            request={request}
            onClose={close}
            onDone={(then) => {
              close();
              if (then === 'search_myself') {
                router.push({ pathname: '/request-search/[id]', params: { id: request.id } });
              } else if (then === 'search_again') {
                router.push('/requests');
              }
            }}
          />
        ) : null}
      </View>
    </Modal>
  );
}

const CHOICES: WrongBookNext[] = ['search_myself', 'search_again', 'remove_only'];

/** Wrong book? (APP-19, canvas board 16c). */
export function WrongBookSheet({
  request,
  onClose,
  onDone,
}: {
  request: BookRequest;
  onClose: () => void;
  onDone: (then: WrongBookNext) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const wrong = useWrongBook();
  const [then, setThen] = useState<WrongBookNext>('search_myself');
  const bold = <AppText style={styles.bold} />;
  const release = request.release?.title;

  const label = (c: WrongBookNext) =>
    c === 'search_myself'
      ? [t('wrongBook.searchMyself'), t('wrongBook.searchMyselfText')]
      : c === 'search_again'
        ? [
            t('wrongBook.searchAgain'),
            t('wrongBook.searchAgainText', { count: MAX_SEARCHES_PER_INDEXER }),
          ]
        : [t('wrongBook.removeOnly'), t('wrongBook.removeOnlyText')];

  return (
    <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: colors.surface }]}>
      <CatEars color={colors.surface} />
      <View style={[styles.handle, { backgroundColor: colors.border }]} />
      <View style={styles.group}>
        <AppText variant="title" accessibilityRole="header">
          {t('wrongBook.title')}
        </AppText>
        <AppText style={{ color: colors.textBody }}>
          <Trans
            i18nKey={release ? 'wrongBook.intro' : 'wrongBook.introNoRelease'}
            values={{ title: request.title, release }}
            components={{ b: bold }}
          />
        </AppText>
      </View>

      <View style={[styles.box, { backgroundColor: colors.surfaceRaised }]}>
        <AppText style={[styles.section, { color: colors.textMuted }]}>
          {t('wrongBook.what')}
        </AppText>
        {(release
          ? [t('wrongBook.offKobos'), t('wrongBook.deleted'), t('wrongBook.never')]
          : [t('wrongBook.offKobos')]
        ).map((line) => (
          <View key={line} style={styles.check}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Path
                d="M5 12L10 17L19 7"
                stroke={colors.success}
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
            <AppText style={[styles.fill, { color: colors.text }]}>{line}</AppText>
          </View>
        ))}
      </View>

      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t('wrongBook.then')}
        style={styles.group}
      >
        <AppText style={[styles.bold, { color: colors.text }]}>{t('wrongBook.then')}</AppText>
        {CHOICES.map((c) => {
          const [name, text] = label(c);
          const selected = c === then;
          return (
            <Pressable
              key={c}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${name}, ${text}`}
              onPress={() => setThen(c)}
              style={[
                styles.choice,
                selected
                  ? { borderWidth: 2, borderColor: colors.accent }
                  : { borderWidth: 1, borderColor: colors.border },
              ]}
            >
              <AppText style={[styles.bold, { color: colors.text, fontSize: fontSize.body }]}>
                {name}
              </AppText>
              <AppText variant="muted">{text}</AppText>
            </Pressable>
          );
        })}
      </View>

      {wrong.isError ? (
        <AppText accessibilityRole="alert" style={{ color: colors.danger }}>
          {errorMessage(wrong.error, t)}
        </AppText>
      ) : null}

      <EarsButton
        label={then === 'remove_only' ? t('wrongBook.confirmRemove') : t('wrongBook.confirm')}
        busy={wrong.isPending}
        celebrate={false}
        onPress={() => wrong.mutate({ id: request.id, then }, { onSuccess: () => onDone(then) })}
      />
      <Button label={t('wrongBook.keep')} variant="text" onPress={onClose} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    padding: space.xl,
    paddingTop: space.md,
    gap: space.lg,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: radius.pill },
  group: { gap: space.sm },
  box: { gap: space.sm, padding: space.lg, borderRadius: 16 },
  section: { fontFamily: fonts.bodyBold, fontSize: fontSize.tiny, letterSpacing: 0.5 },
  check: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  choice: { gap: 2, padding: space.md, borderRadius: 16 },
  bold: { fontFamily: fonts.bodyBold },
});
