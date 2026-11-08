import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Logo } from '@/components/Logo';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { errorMessage } from '@/lib/errors';
import { useSession } from '@/session/session';

const Form = z.object({ url: z.string().trim().min(1, 'required') });
type Form = z.infer<typeof Form>;

/** Onboarding step 1: the server address. There is deliberately no default. */
export function ServerScreen() {
  const { t } = useTranslation();
  const connect = useSession((s) => s.connect);
  const [serverError, setServerError] = useState<string>();
  const { control, handleSubmit, formState } = useForm<Form>({
    resolver: zodResolver(Form),
    defaultValues: { url: '' },
  });

  const onSubmit = handleSubmit(async ({ url }) => {
    setServerError(undefined);
    try {
      await connect(url);
    } catch (err) {
      setServerError(errorMessage(err, t));
    }
  });

  return (
    <Screen>
      <Logo />
      <AppText variant="display">{t('onboarding.serverTitle')}</AppText>
      <AppText variant="muted">{t('onboarding.serverIntro')}</AppText>
      <Controller
        control={control}
        name="url"
        render={({ field, fieldState }) => (
          <TextField
            label={t('onboarding.serverLabel')}
            placeholder={t('onboarding.serverPlaceholder')}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            inputMode="url"
            returnKeyType="go"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            onSubmitEditing={() => void onSubmit()}
            error={fieldState.error ? t('errors.required') : serverError}
          />
        )}
      />
      <Button
        label={formState.isSubmitting ? t('common.checking') : t('onboarding.connect')}
        busy={formState.isSubmitting}
        onPress={() => void onSubmit()}
      />
    </Screen>
  );
}
