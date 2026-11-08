import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Copies of server data kept on the phone so screens work offline (APP-07).
 * Not secret, but tied to the account: cleared on logout.
 */
const PREFIX = 'purrshelf.offline.';

export const OfflineKeys = { library: 'library' } as const;
export type OfflineKey = (typeof OfflineKeys)[keyof typeof OfflineKeys];

export const offline = {
  get: (key: OfflineKey): Promise<string | null> => AsyncStorage.getItem(PREFIX + key),
  set: (key: OfflineKey, value: string): Promise<void> => AsyncStorage.setItem(PREFIX + key, value),
  clear: async (): Promise<void> => {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  },
};
