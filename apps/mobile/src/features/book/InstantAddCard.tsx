import type { LibraryState } from '@purrshelf/contract';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { AppText } from '@/components/AppText';
import { EarsButton } from '@/components/motion';
import { errorMessage } from '@/lib/errors';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, fontSize, radius } from '@/theme/tokens';
import { useInstantAdd } from './useInstantAdd';
import { useKobos } from './useKobos';

function Tick({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 12L10 17L19 7"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Action card for a partner's book opened from For you (APP-13, board 11):
 * the file is already in the library, so adding is instant and free.
 */
export function InstantAddCard({ library, partner }: { library: LibraryState; partner: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const kobos = useKobos(library.itemId);
  const add = useInstantAdd(library.itemId);
  const [send, setSend] = useState(true);
  // Only offer the Kobo when mine is set up; otherwise the book goes to the library only.
  const myKobo = kobos.data?.kobos.find((k) => k.me && k.state !== 'not_set_up') ?? null;

  const fact = (children: React.ReactNode) => (
    <View style={styles.fact}>
      <View style={[styles.tick, { backgroundColor: colors.successBg }]}>
        <Tick size={12} color={colors.success} />
      </View>
      <AppText style={[styles.factText, { color: colors.text }]}>{children}</AppText>
    </View>
  );

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      {fact(
        <>
          <AppText style={styles.strong}>{t('book.forYou.instant')}</AppText>{' '}
          {t('book.forYou.instantFile', { name: partner })}
        </>,
      )}
      {fact(t('book.forYou.noBudget'))}
      {myKobo ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: send }}
          onPress={() => setSend((s) => !s)}
          style={[styles.toggle, { backgroundColor: colors.background }]}
        >
          <View
            style={[
              styles.box,
              send
                ? { backgroundColor: colors.accent, borderColor: colors.accent }
                : { borderColor: colors.border },
            ]}
          >
            {send ? <Tick size={14} color={colors.onAccent} /> : null}
          </View>
          <AppText style={[styles.toggleText, { color: colors.text }]}>
            {t('book.forYou.alsoSend')}
          </AppText>
        </Pressable>
      ) : null}
      <EarsButton
        label={t('book.addToMyLibrary')}
        busy={add.isPending}
        onPress={() => add.mutate({ sendTo: send && myKobo ? myKobo.userId : null })}
      />
      {add.isError ? (
        <AppText accessibilityRole="alert" style={{ color: colors.danger }}>
          {errorMessage(add.error, t)}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10, padding: 16, borderRadius: radius.card },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tick: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  factText: { flex: 1, fontSize: fontSize.body },
  strong: { fontFamily: fonts.bodyBold },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: radius.card - 6,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleText: { flex: 1, fontFamily: fonts.bodyBold, fontSize: fontSize.body },
});
