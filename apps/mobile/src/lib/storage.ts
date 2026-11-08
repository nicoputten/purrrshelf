import * as SecureStore from 'expo-secure-store';

/** Keys kept in the device's secure storage (Android Keystore). */
export const StorageKeys = {
  serverUrl: 'purrshelf.serverUrl',
  refreshToken: 'purrshelf.refreshToken',
  preferences: 'purrshelf.preferences',
} as const;

export type StorageKey = (typeof StorageKeys)[keyof typeof StorageKeys];

export const storage = {
  get: (key: StorageKey): Promise<string | null> => SecureStore.getItemAsync(key),
  set: (key: StorageKey, value: string): Promise<void> => SecureStore.setItemAsync(key, value),
  remove: (key: StorageKey): Promise<void> => SecureStore.deleteItemAsync(key),
};
