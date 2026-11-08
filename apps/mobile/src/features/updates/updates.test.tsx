import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { AppRelease } from '@purrshelf/contract';
import { setFetch, useSession } from '@/session/session';
import { fakeBroker } from '@/test/fakeBroker';
import { renderWithProviders, resetApp } from '@/test/utils';
import { updaterNative, type DownloadedApk } from './native';
import { UpdateSection } from './UpdateSection';
import { installedVersionCode, QUIET_CHECK_INTERVAL_MS, useAppUpdate } from './updates';

const SERVER = 'https://books.example.invalid';
const release = (version = '1.2.0', code = 1_002_000): AppRelease => ({
  version,
  versionCode: code,
  sha256: 'a'.repeat(64),
  size: 1234,
  notes: 'Purrs louder now',
  publishedAt: '2026-11-08T12:00:00.000Z',
});

let apk: DownloadedApk & { removed: boolean };
let downloads: { url: string; headers: Record<string, string> }[];

function broker(latest: () => { status: number; body: unknown }) {
  const { fetch, calls } = fakeBroker({ 'GET /app/latest': latest });
  setFetch(fetch);
  return calls;
}

beforeEach(async () => {
  await resetApp();
  useSession.setState({ status: 'ready', serverUrl: SERVER, accessToken: 'access-1' });
  useAppUpdate.setState({
    status: 'idle',
    release: null,
    progress: 0,
    failure: null,
    errorCode: null,
    checkedAt: null,
  });
  downloads = [];
  apk = {
    contentUri: 'content://app.purrshelf.FileSystemFileProvider/cache/purrshelf-update.apk',
    sha256: jest.fn(async () => 'a'.repeat(64)),
    remove: jest.fn(() => {
      apk.removed = true;
    }),
    removed: false,
  };
  jest.spyOn(updaterNative, 'installedVersion').mockReturnValue('1.0.0');
  jest.spyOn(updaterNative, 'download').mockImplementation(async (url, headers, onProgress) => {
    downloads.push({ url, headers });
    onProgress(0.5);
    return apk;
  });
  jest.spyOn(updaterNative, 'install').mockResolvedValue(undefined);
});

// Only undo our own spies: restoreAllMocks would also wipe the mocks from jest.setup.ts.
afterEach(() => {
  for (const name of ['installedVersion', 'download', 'install'] as const) {
    (updaterNative[name] as jest.Mock).mockRestore?.();
  }
});

describe('installedVersionCode', () => {
  it('reads the baked-in version, and treats an unknown one as 0', () => {
    expect(installedVersionCode()).toBe(1_000_000);
    jest.spyOn(updaterNative, 'installedVersion').mockReturnValue(null);
    expect(installedVersionCode()).toBe(0);
  });
});

describe('useAppUpdate', () => {
  it('finds a newer version and installs it after checking the hash', async () => {
    broker(() => ({ status: 200, body: release() }));
    await useAppUpdate.getState().check();
    expect(useAppUpdate.getState()).toMatchObject({ status: 'available', release: release() });

    await useAppUpdate.getState().install();
    expect(downloads).toEqual([
      { url: `${SERVER}/api/v1/app/latest.apk`, headers: { authorization: 'Bearer access-1' } },
    ]);
    expect(updaterNative.install).toHaveBeenCalledWith(apk.contentUri);
    expect(useAppUpdate.getState().failure).toBeNull();
  });

  it('says the app is up to date when the broker has the same version', async () => {
    broker(() => ({ status: 200, body: release('1.0.0', 1_000_000) }));
    await useAppUpdate.getState().check();
    expect(useAppUpdate.getState()).toMatchObject({ status: 'upToDate', release: null });
  });

  it('deletes a download whose hash does not match and never installs it', async () => {
    broker(() => ({ status: 200, body: release() }));
    await useAppUpdate.getState().check();
    (apk.sha256 as jest.Mock).mockResolvedValue('b'.repeat(64));
    await useAppUpdate.getState().install();
    expect(apk.removed).toBe(true);
    expect(updaterNative.install).not.toHaveBeenCalled();
    expect(useAppUpdate.getState()).toMatchObject({ status: 'failed', failure: 'hash' });
  });

  it('treats an unreadable download as a bad hash', async () => {
    broker(() => ({ status: 200, body: release() }));
    await useAppUpdate.getState().check();
    (apk.sha256 as jest.Mock).mockRejectedValue(new Error('out of memory'));
    await useAppUpdate.getState().install();
    expect(useAppUpdate.getState().failure).toBe('hash');
  });

  it('reports a failed download and a failed installer', async () => {
    broker(() => ({ status: 200, body: release() }));
    await useAppUpdate.getState().check();
    jest.spyOn(updaterNative, 'download').mockRejectedValueOnce(new Error('offline'));
    await useAppUpdate.getState().install();
    expect(useAppUpdate.getState().failure).toBe('download');

    jest.spyOn(updaterNative, 'install').mockRejectedValueOnce(new Error('no installer'));
    await useAppUpdate.getState().install();
    expect(useAppUpdate.getState().failure).toBe('install');
  });

  it('keeps quiet checks quiet and rare', async () => {
    const calls = broker(() => ({
      status: 503,
      body: { code: 'APP_UPDATE_UNAVAILABLE', message: 'off' },
    }));
    await useAppUpdate.getState().check({ quiet: true });
    expect(useAppUpdate.getState()).toMatchObject({ status: 'idle', failure: null });
    await useAppUpdate.getState().check({ quiet: true });
    expect(calls).toHaveLength(1);

    useAppUpdate.setState({ checkedAt: Date.now() - QUIET_CHECK_INTERVAL_MS - 1 });
    await useAppUpdate.getState().check({ quiet: true });
    expect(calls).toHaveLength(2);

    await useAppUpdate.getState().check();
    expect(useAppUpdate.getState()).toMatchObject({
      status: 'failed',
      failure: 'check',
      errorCode: 'APP_UPDATE_UNAVAILABLE',
    });
  });

  it('does nothing without a release', async () => {
    await useAppUpdate.getState().install();
    expect(downloads).toEqual([]);
  });
});

describe('UpdateSection', () => {
  it('shows download progress', async () => {
    await renderWithProviders(<UpdateSection />);
    await act(async () =>
      useAppUpdate.setState({ status: 'downloading', progress: 0.42, release: release() }),
    );
    expect(await screen.findByText('Downloading… 42%')).toBeTruthy();
  });

  it('shows the installed version and an update with its notes', async () => {
    broker(() => ({ status: 200, body: release() }));
    await renderWithProviders(<UpdateSection />);
    expect(await screen.findByText('Installed version: 1.0.0')).toBeTruthy();
    await fireEvent.press(screen.getByText('Check for updates'));
    expect(await screen.findByText('Version 1.2.0 is ready')).toBeTruthy();
    expect(screen.getByText('Purrs louder now')).toBeTruthy();
    expect(screen.getByText(/allow installs from Purrshelf/)).toBeTruthy();

    await fireEvent.press(screen.getByText('Update'));
    await waitFor(() => expect(updaterNative.install).toHaveBeenCalled());
    await waitFor(() => expect(useAppUpdate.getState().status).toBe('available'));
  });

  it('says when the app is up to date', async () => {
    broker(() => ({ status: 200, body: release('1.0.0', 1_000_000) }));
    await renderWithProviders(<UpdateSection />);
    await fireEvent.press(await screen.findByText('Check for updates'));
    expect(await screen.findByText('You have the newest version.')).toBeTruthy();
    expect(screen.getByText(/^Checked at /)).toBeTruthy();
  });

  it('translates a failed check and a damaged download', async () => {
    broker(() => ({ status: 503, body: { code: 'APP_UPDATE_UNAVAILABLE', message: 'off' } }));
    await renderWithProviders(<UpdateSection />);
    await fireEvent.press(await screen.findByText('Check for updates'));
    expect(
      await screen.findByText('No app update information right now. Try again later.'),
    ).toBeTruthy();

    await act(async () =>
      useAppUpdate.setState({ status: 'failed', failure: 'hash', release: release() }),
    );
    expect(
      await screen.findByText('The download was damaged, so it was deleted. Try again.'),
    ).toBeTruthy();
  });
});
