import { StorageKeys } from '@/lib/storage';
import { resetApp, secureStore } from '@/test/utils';
import { usePreferences } from './preferences';

beforeEach(resetApp);

describe('preferences', () => {
  it('defaults to following the phone', () => {
    expect(usePreferences.getState()).toMatchObject({ theme: 'system', language: 'system' });
  });

  it('persists and reloads choices', async () => {
    await usePreferences.getState().setTheme('light');
    await usePreferences.getState().setLanguage('nl');
    usePreferences.setState({ theme: 'system', language: 'system' });
    await usePreferences.getState().load();
    expect(usePreferences.getState()).toMatchObject({ theme: 'light', language: 'nl' });
  });

  it.each(['not json', JSON.stringify({ theme: 'purple', language: 'fr' })])(
    'survives bad stored data: %s',
    async (raw) => {
      secureStore.set(StorageKeys.preferences, raw);
      await usePreferences.getState().load();
      expect(usePreferences.getState()).toMatchObject({ theme: 'system', language: 'system' });
    },
  );
});
