import { appApkUrl, appVersionCode, ApiError, type AppRelease } from '@purrshelf/contract';
import { create } from 'zustand';
import { useSession } from '@/session/session';
import { updaterNative } from './native';

export type UpdateStatus =
  'idle' | 'checking' | 'upToDate' | 'available' | 'downloading' | 'installing' | 'failed';

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
  /** Downloads, verifies and hands the APK to Android's installer. */
  install: () => Promise<void>;
}

/** A quiet check (on launch) runs at most this often. */
export const QUIET_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** The installed app's versionCode, or 0 when unknown (a dev build), so any release is newer. */
export function installedVersionCode(): number {
  const version = updaterNative.installedVersion();
  return (version && appVersionCode(version)) || 0;
}

export const useAppUpdate = create<UpdateState>((set, get) => ({
  status: 'idle',
  release: null,
  progress: 0,
  failure: null,
  errorCode: null,
  checkedAt: null,

  check: async ({ quiet = false } = {}) => {
    const { status, checkedAt } = get();
    if (status === 'checking' || status === 'downloading' || status === 'installing') return;
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
    const { serverUrl } = useSession.getState();
    if (!release || !serverUrl) return;
    set({ status: 'downloading', progress: 0, failure: null, errorCode: null });
    let apk;
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
      return;
    }
    let sha256: string;
    try {
      sha256 = await apk.sha256();
    } catch {
      sha256 = '';
    }
    if (sha256 !== release.sha256) {
      apk.remove();
      set({ status: 'failed', failure: 'hash' });
      return;
    }
    set({ status: 'installing', progress: 1 });
    try {
      await updaterNative.install(apk.contentUri);
      // Back in the app: Android either replaced us (and restarted) or the user cancelled.
      set({ status: 'available' });
    } catch {
      set({ status: 'failed', failure: 'install' });
    }
  },
}));
