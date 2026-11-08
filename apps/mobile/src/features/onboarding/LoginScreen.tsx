import { zodResolver } from '@hookform/resolvers/zod';
import { LoginRequest } from '@purrshelf/contract';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import type { z } from 'zod';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Logo } from '@/components/Logo';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { errorMessage } from '@/lib/errors';
import { useSession } from '@/session/session';

type Form = z.input<typeof LoginRequest>;

/** Onboarding step 2: log in to the chosen server. */
export function LoginScreen() {
  const { t } = useTranslation();
  const serverUrl = useSession((s) => s.serverUrl);
  const login = useSession((s) => s.login);
  const changeServer = useSession((s) => s.changeServer);
  const [loginError, setLoginError] = useState<string>();
  const { control, handleSubmit, formState } = useForm<Form>({
    resolver: zodResolver(LoginRequest),
    defaultValues: { username: '', password: '' },
  });

  const onSubmit = handleSubmit(async ({ username, password }) => {
    setLoginError(undefined);
    try {
      await login(username, password);
    } catch (err) {
      setLoginError(errorMessage(err, t));
    }
  });

  const host = serverUrl ? serverUrl.replace(/^https?:\/\//, '') : '';

  return (
    <Screen>
      <Logo />
      <AppText variant="display">{t('onboarding.loginTitle')}</AppText>
      <View style={styles.server}>
        <AppText variant="muted" style={styles.flex} numberOfLines={1}>
          {t('onboarding.connectedTo', { server: host })}
        </AppText>
        <Button
          variant="text"
          label={t('onboarding.changeServer')}
          onPress={() => void changeServer()}
        />
      </View>
      <Controller
        control={control}
        name="username"
        render={({ field, fieldState }) => (
          <TextField
            label={t('onboarding.usernameLabel')}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error ? t('errors.required') : undefined}
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field, fieldState }) => (
          <TextField
            label={t('onboarding.passwordLabel')}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            onSubmitEditing={() => void onSubmit()}
            error={fieldState.error ? t('errors.required') : undefined}
          />
        )}
      />
      {loginError ? (
        <AppText accessibilityRole="alert" style={styles.error}>
          {loginError}
        </AppText>
      ) : null}
      <Button
        label={t('onboarding.login')}
        busy={formState.isSubmitting}
        onPress={() => void onSubmit()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  server: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  error: { fontSize: 15 },
});
