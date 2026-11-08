import { screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ReleaseOption } from '@purrshelf/contract';
import { i18n } from '@/i18n';
import { setFetch, useSession } from '@/session/session';
import { apiError, bookRequest, fakeBroker, ok, releaseOption } from '@/test/fakeBroker';
import { renderWithProviders, resetApp } from '@/test/utils';
import { optionLabel, releaseAge, ReleasePickerScreen } from './ReleasePicker';

jest.setTimeout(15_000);

const NOW = new Date('2026-01-01T12:00:00.000Z');

beforeEach(async () => {
  await resetApp();
  useSession.setState({
    status: 'ready',
    serverUrl: 'https://shelf.example.invalid',
    accessToken: 'access-1',
  });
});

const options = [
  releaseOption({ id: 'best', picked: true }),
  releaseOption({
    id: 'retail',
    title: 'Ilse Varenkamp - The Salt Road retail EPUB',
    score: 81,
    publishedAt: '2023-01-01T12:00:00.000Z',
  }),
  releaseOption({
    id: 'weak',
    title: 'The Salt Road MOBI',
    format: 'mobi',
    size: null,
    language: null,
    score: 40,
    authorMatch: false,
    publishedAt: null,
  }),
  releaseOption({
    id: 'pdf',
    title: 'The Salt Road PDF',
    format: 'pdf',
    score: 0,
    rejected: ['format_excluded'],
    titleMatch: false,
    authorMatch: false,
  }),
  releaseOption({
    id: 'nl',
    title: 'Ilse Varenkamp - De Zoutweg NL EPUB',
    language: 'nl',
    score: 0,
    rejected: ['language_mismatch'],
  }),
  releaseOption({
    id: 'old',
    score: 0,
    rejected: ['failed_before'],
    publishedAt: '2025-12-01T12:00:00.000Z',
  }),
];

function broker(routes: Parameters<typeof fakeBroker>[0] = {}) {
  const b = fakeBroker({
    'GET /requests': () => ok({ requests: [bookRequest({ status: 'downloading' })] }),
    'GET /requests/r1/releases': () => ok({ releases: options, acceptThreshold: 60 }),
    'POST /requests/r1/releases/retail': () =>
      ok(bookRequest({ status: 'downloading', progress: 0 })),
    ...routes,
  });
  setFetch(b.fetch);
  return b;
}

const render = (onBack = jest.fn()) =>
  renderWithProviders(<ReleasePickerScreen requestId="r1" onBack={onBack} now={NOW} />);

describe('Pick a release', () => {
  it('lists the releases with labels, ages and why, and says browsing is free', async () => {
    const b = broker();
    await render();
    expect(await screen.findByText('Best match · fetching')).toBeOnTheScreen();
    expect(screen.getByText('The Salt Road · 6 results')).toBeOnTheScreen();
    expect(screen.getByText(/Free to browse/)).toBeOnTheScreen();
    expect(screen.getByText('Good')).toBeOnTheScreen();
    expect(screen.getByText('3 years ago')).toBeOnTheScreen();
    expect(screen.getAllByText('EPUB · 1.4 MB · English · title and author match')).toHaveLength(2);
    expect(screen.getByText('Weaker match')).toBeOnTheScreen();
    expect(screen.getByText('MOBI · size unknown · title matches')).toBeOnTheScreen();
    expect(screen.getByText('3 left out')).toBeOnTheScreen();
    expect(
      screen.getByText('not an ebook format the Kobo reads, another language, failed before'),
    ).toBeOnTheScreen();
    expect(screen.queryByText('The Salt Road PDF')).toBeNull();
    // Only the list from the earlier search was asked for.
    expect(b.calls.map((c) => c.route)).not.toContain('POST /requests/r1/retry');
  });

  it('shows the left-out releases on request', async () => {
    broker();
    const user = userEvent.setup();
    await render();
    await user.press(await screen.findByRole('button', { name: 'Show them anyway' }));
    expect(screen.getByText('The Salt Road PDF')).toBeOnTheScreen();
    expect(screen.getByText('Language differs')).toBeOnTheScreen();
    expect(
      screen.getByText('PDF · 1.4 MB · English · not an ebook format the Kobo reads'),
    ).toBeOnTheScreen();
    const useButtons = screen.getAllByRole('button', { name: 'Use this one' });
    expect(useButtons.at(-1)).toBeDisabled();
    await user.press(screen.getByRole('button', { name: 'Hide them' }));
    expect(screen.queryByText('The Salt Road PDF')).toBeNull();
  });

  it('picks another release and goes back', async () => {
    const b = broker();
    const onBack = jest.fn();
    const user = userEvent.setup();
    await render(onBack);
    await screen.findByText('Good');
    await user.press(screen.getAllByRole('button', { name: 'Use this one' })[0]!);
    await waitFor(() => expect(onBack).toHaveBeenCalled());
    expect(b.calls.map((c) => c.route)).toContain('POST /requests/r1/releases/retail');
  });

  it('says why a pick was refused', async () => {
    broker({ 'POST /requests/r1/releases/retail': () => apiError(409, 'DOWNLOADS_NOT_SET_UP') });
    await render();
    await screen.findByText('Good');
    await userEvent.setup().press(screen.getAllByRole('button', { name: 'Use this one' })[0]!);
    expect(await screen.findByText(/Downloads are not set up on the server yet/)).toBeOnTheScreen();
  });

  it('says when there is nothing to pick from, or the list failed', async () => {
    broker({ 'GET /requests/r1/releases': () => ok({ releases: [], acceptThreshold: 60 }) });
    await render();
    expect(await screen.findByText(/found nothing to pick from/)).toBeOnTheScreen();
  });

  it('shows an error with Try again', async () => {
    broker({ 'GET /requests/r1/releases': () => apiError(404, 'NOT_FOUND') });
    const onBack = jest.fn();
    await render(onBack);
    expect(await screen.findByText('Not found.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();
  });
});

describe('labels', () => {
  const t = i18n.t.bind(i18n);
  it('ages releases', () => {
    expect(releaseAge('2026-01-01T08:00:00.000Z', NOW, t)).toBe('today');
    expect(releaseAge('2025-12-29T12:00:00.000Z', NOW, t)).toBe('3 days ago');
    expect(releaseAge('2025-10-01T12:00:00.000Z', NOW, t)).toBe('3 months ago');
    expect(releaseAge(null, NOW, t)).toBeNull();
  });
  it('labels a release below the bar that was not left out as weaker', () => {
    const o = releaseOption({ score: 59 }) as ReleaseOption;
    expect(optionLabel(o, 60, t)).toBe('Weaker match');
  });
});
