import { readableReleaseNotes } from '@purrshelf/contract';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Segmented } from '@/components/Segmented';
import { usePreferences } from '@/session/preferences';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius } from '@/theme/tokens';
import { updaterNative } from './native';
import { useAppUpdate } from './updates';

const MAX_NOTES = 600;

/** The "App" section of Settings: installed version, update check, install and the automatic-update switch (APP-10, APP-11). */
export function UpdateSection() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const { status, release, progress, failure, errorCode, checkedAt, check, install } =
    useAppUpdate();
  const { autoUpdate, setAutoUpdate } = usePreferences();
  const installed = updaterNative.installedVersion();
  const busy = status === 'downloading' || status === 'installing';
  // Older brokers pass release-please Markdown through; tidy it here too (ADR 0033).
  const notes = release ? readableReleaseNotes(release.notes) : '';

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
          {status === 'ready' ? <AppText variant="muted">{t('updates.readyHint')}</AppText> : null}
          {notes ? (
            <AppText variant="muted" numberOfLines={8}>
              {notes.slice(0, MAX_NOTES)}
            </AppText>
          ) : null}
          <Button
            label={
              status === 'downloading'
                ? t('updates.downloading', { percent: Math.round(progress * 100) })
                : status === 'installing'
                  ? t('updates.installing')
                  : status === 'ready'
                    ? t('updates.updateNow')
                    : t('updates.update')
            }
            // Disabled rather than busy, so the progress stays readable.
            disabled={busy}
            onPress={() => void install()}
          />
          {status === 'ready' ? null : (
            <AppText variant="muted">{t('updates.permissionHint')}</AppText>
          )}
        </View>
      ) : null}

      {status === 'upToDate' ? <AppText>{t('updates.upToDate')}</AppText> : null}
      {/* The time shows that a repeated tap really checked again. */}
      {checkedAt !== null && (status === 'upToDate' || status === 'failed') ? (
        <AppText variant="muted">
          {t('updates.checkedAt', {
            time: new Date(checkedAt).toLocaleTimeString(i18n.language, {
              hour: '2-digit',
              minute: '2-digit',
            }),
          })}
        </AppText>
      ) : null}
      {failure ? (
        <AppText accessibilityRole="alert" style={{ color: colors.danger }}>
          {failure === 'check' && errorCode
            ? t(`errors.${errorCode}`, { defaultValue: t('updates.failed.check') })
            : t(`updates.failed.${failure}`)}
        </AppText>
      ) : null}

      <AppText variant="label">{t('updates.auto')}</AppText>
      <Segmented<'on' | 'off'>
        label={t('updates.auto')}
        value={autoUpdate ? 'on' : 'off'}
        onChange={(v) => void setAutoUpdate(v === 'on')}
        options={[
          { value: 'on', label: t('updates.autoOn') },
          { value: 'off', label: t('updates.autoOff') },
        ]}
      />
      <AppText variant="muted">{t('updates.autoHint')}</AppText>

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
