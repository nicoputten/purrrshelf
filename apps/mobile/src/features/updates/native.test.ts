import { digest } from 'expo-crypto';
import { File } from 'expo-file-system';
import { startActivityAsync } from 'expo-intent-launcher';
import { updaterNative } from './native';

const FileMock = File as unknown as jest.Mock & { createDownloadTask: jest.Mock };

function fakeFile(exists: boolean) {
  return {
    exists,
    contentUri: 'content://provider/cache/purrshelf-update.apk',
    delete: jest.fn(),
    bytes: jest.fn(async () => new Uint8Array([1, 2, 3])),
  };
}

describe('updaterNative', () => {
  it('downloads into the cache with progress and hashes the file', async () => {
    const leftover = fakeFile(true);
    const downloaded = fakeFile(true);
    FileMock.mockImplementation(() => leftover);
    FileMock.createDownloadTask = jest.fn((_url, _dest, opts) => ({
      downloadAsync: async () => {
        opts.onProgress({ bytesWritten: 50, totalBytes: -1 });
        opts.onProgress({ bytesWritten: 50, totalBytes: 100 });
        return downloaded;
      },
    }));
    (digest as jest.Mock).mockResolvedValue(new Uint8Array([0, 15, 255]).buffer);
    const progress: number[] = [];

    const apk = await updaterNative.download(
      'https://books.example.invalid/api/v1/app/latest.apk',
      { authorization: 'Bearer t' },
      (p) => progress.push(p),
    );

    expect(leftover.delete).toHaveBeenCalled();
    expect(FileMock.createDownloadTask).toHaveBeenCalledWith(
      'https://books.example.invalid/api/v1/app/latest.apk',
      leftover,
      expect.objectContaining({ headers: { authorization: 'Bearer t' } }),
    );
    expect(progress).toEqual([0.5]);
    expect(apk.contentUri).toBe(downloaded.contentUri);
    expect(await apk.sha256()).toBe('000fff');
    apk.remove();
    expect(downloaded.delete).toHaveBeenCalled();
  });

  it('fails when the download is paused', async () => {
    FileMock.mockImplementation(() => fakeFile(false));
    FileMock.createDownloadTask = jest.fn(() => ({ downloadAsync: async () => null }));
    await expect(
      updaterNative.download('https://x.example.invalid/a.apk', {}, jest.fn()),
    ).rejects.toThrow('paused');
  });

  it('opens the Android installer with read access to the file', async () => {
    await updaterNative.install('content://provider/cache/purrshelf-update.apk');
    expect(startActivityAsync).toHaveBeenCalledWith('android.intent.action.VIEW', {
      data: 'content://provider/cache/purrshelf-update.apk',
      type: 'application/vnd.android.package-archive',
      flags: 1,
    });
  });

  it('reads the version baked into the build', () => {
    expect(typeof updaterNative.installedVersion()).toMatch(/string|object/);
  });
});
