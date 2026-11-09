import { appApkUrl, appVersionCode, ApiError, type AppRelease } from '@purrshelf/contract';
import { create } from 'zustand';
import { usePreferences } from '@/session/preferences';
import { useSession } from '@/session/session';
import { updaterNative, type DownloadedApk } from './native';

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'upToDate'
  | 'available'
  | 'downloading'
  /** Downloaded and verified; installs when the app goes to the background (APP-11). */
  | 'ready'
  | 'installing'
  | 'failed';

/** Why an update failed, translated by the screen. */
export type UpdateFailure = 'check' | 'download' | 'hash' | 'install';

interface UpdateState {
  status: UpdateStatus;
  /** The newest release the broker knows about, when it is newer than this app. */
  release: AppRelease | null;
  /** 0–1 while downloading. */
  progress: number;
  failure: UpdateFailure | null;
  /** API error code when the check failed with one (e.g. APP_UPDATE_UNAVAILABLE). */
  errorCode: string | null;
  checkedAt: number | null;
  /** Asks the broker for the latest version. Quiet checks skip if one ran recently. */
  check: (opts?: { quiet?: boolean }) => Promise<void>;
  /** The Update button: downloads (unless ready), verifies and installs, showing Android's screen if needed. */
  install: () => Promise<void>;
  /**
   * Automatic updates: when Android will install without asking, download and
   * verify now, so {@link installQuietly} can finish when the app is left.
   */
  prepare: () => Promise<void>;
  /** Installs a prepared update without showing anything; falls back to the Update button. */
  installQuietly: () => Promise<void>;
}

/** A quiet check (on launch) runs at most this often. */
export const QUIET_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** The installed app's versionCode, or 0 when unknown (a dev build), so any release is newer. */
export function installedVersionCode(): number {
  const version = updaterNative.installedVersion();
  return (version && appVersionCode(version)) || 0;
}

/** The verified APK waiting for {@link UpdateState.installQuietly}. */
let prepared: { apk: DownloadedApk; versionCode: number } | null = null;

/** Test hook. */
export function resetPreparedUpdate(): void {
  prepared = null;
}

export const useAppUpdate = create<UpdateState>((set, get) => {
  /** Downloads and verifies the release's APK; sets the failure and returns null if that fails. */
  async function fetchApk(release: AppRelease): Promise<DownloadedApk | null> {
    const { serverUrl } = useSession.getState();
    if (!serverUrl) return null;
    set({ status: 'downloading', progress: 0, failure: null, errorCode: null });
    let apk: DownloadedApk;
    try {
      // A fresh call makes sure the access token is valid before the download uses it.
      await useSession.getState().call('appLatest');
      const token = useSession.getState().accessToken;
      apk = await updaterNative.download(
        appApkUrl(serverUrl),
        token ? { authorization: `Bearer ${token}` } : {},
        (progress) => set({ progress }),
      );
    } catch {
      set({ status: 'failed', failure: 'download' });
      return null;
    }
    let sha256 = '';
    try {
      sha256 = await apk.sha256();
    } catch {
      // Unreadable counts as damaged.
    }
    if (sha256 !== release.sha256) {
      apk.remove();
      set({ status: 'failed', failure: 'hash' });
      return null;
    }
    return apk;
  }

  return {
    status: 'idle',
    release: null,
    progress: 0,
    failure: null,
    errorCode: null,
    checkedAt: null,

    check: async ({ quiet = false } = {}) => {
      const { status, checkedAt } = get();
      if (['checking', 'downloading', 'ready', 'installing'].includes(status)) return;
      if (quiet && checkedAt !== null && Date.now() - checkedAt < QUIET_CHECK_INTERVAL_MS) return;
      set({ status: 'checking', failure: null, errorCode: null });
      try {
        const release = await useSession.getState().call('appLatest');
        const newer = release.versionCode > installedVersionCode();
        set({
          status: newer ? 'available' : 'upToDate',
          release: newer ? release : null,
          checkedAt: Date.now(),
        });
      } catch (err) {
        set({
          status: quiet ? 'idle' : 'failed',
          failure: quiet ? null : 'check',
          errorCode: err instanceof ApiError ? err.code : null,
          checkedAt: Date.now(),
        });
      }
    },

    install: async () => {
      const { release } = get();
      if (!release) return;
      const ready = prepared?.versionCode === release.versionCode ? prepared.apk : null;
      prepared = null;
      const apk = ready ?? (await fetchApk(release));
      if (!apk) return;
      set({ status: 'installing', progress: 1 });
      try {
        await updaterNative.install(apk, { allowPrompt: true });
        // Back in the app: Android either replaced us or the user cancelled.
        set({ status: 'available' });
      } catch {
        set({ status: 'failed', failure: 'install' });
      }
    },

    prepare: async () => {
      const { release, status } = get();
      if (!release || status !== 'available') return;
      if (!usePreferences.getState().autoUpdate || !updaterNative.canInstallWithoutPrompt()) return;
      const apk = await fetchApk(release);
      if (!apk) {
        // A failed background download shows nothing; the Update button still works.
        set({ status: 'available', failure: null });
        return;
      }
      prepared = { apk, versionCode: release.versionCode };
      set({ status: 'ready', progress: 1 });
    },

    installQuietly: async () => {
      if (get().status !== 'ready' || !prepared) return;
      const { apk } = prepared;
      set({ status: 'installing' });
      try {
        const result = await updaterNative.install(apk, { allowPrompt: false });
        if (result === 'needsUser') {
          prepared = { apk, versionCode: get().release?.versionCode ?? 0 };
          set({ status: 'available' });
        }
        // "installed": Android replaces the app and closes it.
      } catch {
        prepared = null;
        set({ status: 'available' });
      }
    },
  };
});
