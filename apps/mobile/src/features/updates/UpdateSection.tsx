import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius } from '@/theme/tokens';
import { updaterNative } from './native';
import { useAppUpdate } from './updates';

const MAX_NOTES = 600;

/** The "App" section of Settings: installed version, update check and install (APP-10). */
export function UpdateSection() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { status, release, progress, failure, errorCode, check, install } = useAppUpdate();
  const installed = updaterNative.installedVersion();
  const busy = status === 'downloading' || status === 'installing';

  return (
    <View style={styles.section}>
      <AppText variant="label">{t('updates.title')}</AppText>
      <AppText variant="muted">
        {t('updates.installed', { version: installed ?? t('updates.unknownVersion') })}
      </AppText>

      {release && status !== 'upToDate' && failure !== 'check' ? (
        <View
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.accent }]}
          accessibilityLabel={t('updates.available', { version: release.version })}
        >
          <AppText style={styles.heading}>
            {t('updates.available', { version: release.version })}
          </AppText>
          {release.notes ? (
            <AppText variant="muted" numberOfLines={8}>
              {release.notes.slice(0, MAX_NOTES)}
            </AppText>
          ) : null}
          <Button
            label={
              status === 'downloading'
                ? t('updates.downloading', { percent: Math.round(progress * 100) })
                : status === 'installing'
                  ? t('updates.installing')
                  : t('updates.update')
            }
            // Disabled rather than busy, so the progress stays readable.
            disabled={busy}
            onPress={() => void install()}
          />
          <AppText variant="muted">{t('updates.permissionHint')}</AppText>
        </View>
      ) : null}

      {status === 'upToDate' ? <AppText>{t('updates.upToDate')}</AppText> : null}
      {failure ? (
        <AppText accessibilityRole="alert" style={{ color: colors.danger }}>
          {failure === 'check' && errorCode
            ? t(`errors.${errorCode}`, { defaultValue: t('updates.failed.check') })
            : t(`updates.failed.${failure}`)}
        </AppText>
      ) : null}

      <Button
        variant="outline"
        label={t('updates.check')}
        busy={status === 'checking'}
        disabled={busy}
        onPress={() => void check()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  heading: { fontFamily: fonts.bodyBold },
  card: { gap: 8, padding: 16, borderRadius: radius.card, borderWidth: 1 },
});
