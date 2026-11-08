import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import * as Reanimated from 'react-native-reanimated';
import '@/i18n';
import { resetApp } from '@/test/utils';
import { DELIVERED, DELIVERED_STILL_MS, Delivered } from './Delivered';
import { EarsButton } from './EarsButton';
import { Nap } from './Nap';
import { PawLoader } from './PawLoader';
import { SWAT, SWAT_STILL_MS, Swat } from './Swat';
import { keyframes } from './timeline';
import { Trot } from './Trot';
import { resetOneShots, takeOneShot } from './useMotion';

const reducedMotion = Reanimated.useReducedMotion as jest.Mock;
const impact = Haptics.impactAsync as jest.Mock;
const notify = Haptics.notificationAsync as jest.Mock;

// The one-shots run on timers; every test here drives them by hand.
jest.useFakeTimers();

let withRepeat: jest.SpyInstance;

beforeEach(async () => {
  await resetApp();
  reducedMotion.mockReturnValue(false);
  impact.mockClear();
  notify.mockClear();
  withRepeat = jest.spyOn(Reanimated, 'withRepeat');
});

afterEach(() => withRepeat.mockRestore());

const style = (testID: string) => screen.getByTestId(testID).props.style;
const flat = (s: unknown): Record<string, unknown> =>
  Array.isArray(s) ? Object.assign({}, ...s.map(flat)) : ((s as Record<string, unknown>) ?? {});

describe('one-shot memory', () => {
  beforeEach(() => resetOneShots());

  it('only remembers the first event it sees, then plays each new one once', () => {
    expect(takeOneShot('swat:r1', 'rel-1')).toBe(false); // already happened when we looked
    expect(takeOneShot('swat:r1', 'rel-1')).toBe(false); // re-render
    expect(takeOneShot('swat:r1', null)).toBe(false); // download failed
    expect(takeOneShot('swat:r1', 'rel-2')).toBe(true); // picked another
    expect(takeOneShot('swat:r1', 'rel-2')).toBe(false);
    expect(takeOneShot('swat:r1', null)).toBe(false);
    expect(takeOneShot('swat:r1', 'rel-2')).toBe(false); // never twice for one event
  });

  it('plays the first change after a request is seen without an event', () => {
    expect(takeOneShot('swat:r2', null)).toBe(false);
    expect(takeOneShot('swat:r2', 'rel-1')).toBe(true);
  });

  it('keeps scopes apart', () => {
    takeOneShot('swat:a', null);
    takeOneShot('swat:b', null);
    expect(takeOneShot('swat:a', 'x')).toBe(true);
    expect(takeOneShot('swat:b', 'x')).toBe(true);
  });
});

describe('keyframes', () => {
  it('holds a value without an animation and needs no animation for a still scene', () => {
    expect(keyframes([[100, 0]])).toBe(0);
    expect(keyframes([[100, 1]], 1)).toBe(1);
  });
});

describe('PawLoader', () => {
  it('replaces the spinner with three stepping paws', async () => {
    await render(<PawLoader label />);
    expect(screen.getByRole('progressbar', { name: 'Sniffing out books…' })).toBeOnTheScreen();
    expect(screen.getByText('Sniffing out books…')).toBeOnTheScreen();
    expect(withRepeat).toHaveBeenCalledTimes(3);
  });

  it('shows three still, full paws with reduced motion', async () => {
    reducedMotion.mockReturnValue(true);
    await render(<PawLoader />);
    expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeOnTheScreen();
    for (const i of [0, 1, 2]) {
      expect(flat(style(`paw-${i}`))).toMatchObject({ opacity: 1, transform: [{ scale: 1 }] });
    }
    expect(withRepeat).not.toHaveBeenCalled();
  });
});

describe('Nap', () => {
  it('breathes and floats Zs', async () => {
    await render(<Nap />);
    expect(screen.getAllByText('z', { includeHiddenElements: true })).toHaveLength(3);
    expect(withRepeat).toHaveBeenCalledTimes(4);
  });

  it('is a still cat with three still Zs with reduced motion', async () => {
    reducedMotion.mockReturnValue(true);
    await render(<Nap />);
    expect(screen.getAllByText('z', { includeHiddenElements: true })).toHaveLength(3);
    expect(withRepeat).not.toHaveBeenCalled();
  });
});

describe('Trot', () => {
  it('reports the real progress and bobs while active', async () => {
    await render(<Trot progress={42} />);
    expect(screen.getByRole('progressbar')).toHaveAccessibilityValue({ now: 42 });
    expect(withRepeat).toHaveBeenCalledTimes(1);
  });

  it('does not bob when the download is not active', async () => {
    await render(<Trot progress={42} active={false} />);
    expect(withRepeat).not.toHaveBeenCalled();
  });

  it('jumps to the progress without a loop with reduced motion', async () => {
    reducedMotion.mockReturnValue(true);
    await render(<Trot progress={120} />);
    expect(screen.getByRole('progressbar')).toHaveAccessibilityValue({ now: 100 });
    expect(withRepeat).not.toHaveBeenCalled();
  });
});

describe('Swat', () => {
  it('taps twice, swats, lands, then collapses and reports done', async () => {
    const onDone = jest.fn();
    await render(<Swat title="The Salt Road" onDone={onDone} />);
    expect(screen.getByLabelText(/swats the book/)).toBeOnTheScreen();
    await act(async () => {
      jest.advanceTimersByTime(SWAT.tap2);
    });
    expect(impact.mock.calls).toEqual([['light'], ['light']]);
    await act(async () => {
      jest.advanceTimersByTime(SWAT.land - SWAT.tap2);
    });
    expect(impact).toHaveBeenLastCalledWith('medium');
    expect(onDone).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(SWAT.end + SWAT.collapse - SWAT.land);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(impact).toHaveBeenCalledTimes(3);
  });

  it('shows the end frame with reduced motion: book in the basket and "Got it!"', async () => {
    reducedMotion.mockReturnValue(true);
    const onDone = jest.fn();
    await render(<Swat title="The Salt Road" onDone={onDone} />);
    expect(flat(style('swat-book')).transform).toEqual([
      { translateX: 134 },
      { translateY: 110 },
      { rotate: '90deg' },
    ]);
    expect(flat(style('swat-badge'))).toMatchObject({ opacity: 1 });
    expect(screen.getByText('Got it!')).toBeOnTheScreen();
    expect(withRepeat).not.toHaveBeenCalled(); // no tail swish
    await act(async () => {
      jest.advanceTimersByTime(SWAT_STILL_MS - 1);
    });
    expect(onDone).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(impact.mock.calls).toEqual([['medium']]);
  });

  it('stops its timers when the card goes away mid-swat', async () => {
    const onDone = jest.fn();
    const view = await render(<Swat title="x" onDone={onDone} />);
    await view.unmount();
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(onDone).not.toHaveBeenCalled();
    expect(impact).not.toHaveBeenCalled();
  });
});

describe('Delivered', () => {
  it('drops the cover in, bursts four paws and buzzes success once', async () => {
    const onDone = jest.fn();
    await render(<Delivered workId="w-1" title="The Salt Road" onDone={onDone} />);
    expect(screen.getByLabelText('The book lands on the Kobo')).toBeOnTheScreen();
    expect(screen.getAllByTestId(/^confetti-/)).toHaveLength(4);
    await act(async () => {
      jest.advanceTimersByTime(DELIVERED.end + DELIVERED.collapse);
    });
    expect(notify.mock.calls).toEqual([['success']]);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('shows the cover on the e-reader without confetti with reduced motion', async () => {
    reducedMotion.mockReturnValue(true);
    const onDone = jest.fn();
    await render(<Delivered workId="w-1" title="The Salt Road" onDone={onDone} />);
    expect(screen.queryAllByTestId(/^confetti-/)).toHaveLength(0);
    expect(flat(style('delivered-cover'))).toMatchObject({
      opacity: 1,
      transform: [{ translateY: 0 }, { rotate: '0deg' }],
    });
    await act(async () => {
      jest.advanceTimersByTime(DELIVERED_STILL_MS);
    });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('EarsButton', () => {
  it('passes the press through at once and pops the ears', async () => {
    const spring = jest.spyOn(Reanimated, 'withSpring');
    const onPress = jest.fn();
    await render(<EarsButton label="Fetch it now" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Fetch it now' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(spring).toHaveBeenCalled();
    spring.mockRestore();
  });

  it('only presses with reduced motion', async () => {
    reducedMotion.mockReturnValue(true);
    const spring = jest.spyOn(Reanimated, 'withSpring');
    const onPress = jest.fn();
    await render(<EarsButton label="Send" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(spring).not.toHaveBeenCalled();
    expect(flat(style('ears')).transform).toEqual([{ translateY: 16 }]);
    spring.mockRestore();
  });
});
