import { renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { useAppUpdate } from './updates';
import { useUpdateChecks } from './useUpdateChecks';

describe('useUpdateChecks', () => {
  it('checks on launch and on return, and installs a prepared update when the app is left', async () => {
    const check = jest.fn(async () => undefined);
    const prepare = jest.fn(async () => undefined);
    const installQuietly = jest.fn(async () => undefined);
    useAppUpdate.setState({ check, prepare, installQuietly });
    let listener: ((state: AppStateStatus) => void) | undefined;
    const remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, fn) => {
      listener = fn as (state: AppStateStatus) => void;
      return { remove } as never;
    });

    const { unmount } = await renderHook(() => useUpdateChecks());
    await Promise.resolve();
    expect(check).toHaveBeenCalledWith({ quiet: true });

    listener!('background');
    expect(installQuietly).toHaveBeenCalled();
    listener!('active');
    expect(check).toHaveBeenCalledTimes(2);

    await unmount();
    expect(remove).toHaveBeenCalled();
  });
});
