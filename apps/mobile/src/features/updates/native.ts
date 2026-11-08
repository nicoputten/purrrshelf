import Constants from 'expo-constants';
import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { startActivityAsync } from 'expo-intent-launcher';

/** A downloaded APK in the app's cache. */
export interface DownloadedApk {
  /** content:// URI the Android installer can read. */
  contentUri: string;
  sha256: () => Promise<string>;
  remove: () => void;
}

/** Android's FLAG_GRANT_READ_URI_PERMISSION, so the installer may read our file. */
const GRANT_READ_URI_PERMISSION = 1;

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The parts of the updater that touch the phone (APP-10). Tests replace this
 * module; everything else lives in `updates.ts`.
 */
export const updaterNative = {
  /** The installed app's version, baked in from package.json at build time. */
  installedVersion(): string | null {
    return Constants.expoConfig?.version ?? null;
  },

  async download(
    url: string,
    headers: Record<string, string>,
    onProgress: (fraction: number) => void,
  ): Promise<DownloadedApk> {
    const destination = new File(Paths.cache, 'purrshelf-update.apk');
    if (destination.exists) destination.delete();
    const task = File.createDownloadTask(url, destination, {
      headers,
      onProgress: ({ bytesWritten, totalBytes }) => {
        if (totalBytes > 0) onProgress(Math.min(1, bytesWritten / totalBytes));
      },
    });
    const file = await task.downloadAsync();
    if (!file) throw new Error('download paused');
    return {
      contentUri: file.contentUri,
      sha256: async () => toHex(await digest(CryptoDigestAlgorithm.SHA256, await file.bytes())),
      remove: () => {
        if (file.exists) file.delete();
      },
    };
  },

  /** Opens Android's installer. Android asks once to allow installs from Purrshelf. */
  async install(contentUri: string): Promise<void> {
    await startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      type: 'application/vnd.android.package-archive',
      flags: GRANT_READ_URI_PERMISSION,
    });
  },
};
