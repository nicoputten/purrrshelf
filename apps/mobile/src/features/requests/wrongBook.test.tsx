import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { BookRequest } from '@purrshelf/contract';
import { setFetch, useSession } from '@/session/session';
import { apiError, bookRequest, fakeBroker, ok } from '@/test/fakeBroker';
import { renderWithProviders, resetApp } from '@/test/utils';
import { canCallWrongBook, useWrongBookSheet, WrongBookSheet } from './WrongBookSheet';

jest.setTimeout(15_000);

beforeEach(async () => {
  await resetApp();
  useSession.setState({
    status: 'ready',
    serverUrl: 'https://shelf.example.invalid',
    accessToken: 'access-1',
  });
});

const delivered = BookRequest.parse(
  bookRequest({
    status: 'pushed',
    title: 'Lantern: The Story of Old Wick',
    release: {
      id: 'rel-1',
      title: 'Ilse Varenkamp - Lantern Repair Manual',
      format: 'epub',
      size: 1_400_000,
      language: 'en',
    },
    updatedAt: '2026-01-01T12:00:00.000Z',
  }),
);

describe('when "Wrong book?" is offered', () => {
  const now = new Date('2026-01-05T12:00:00.000Z');
  it('only for a book in the library, for 7 days', () => {
    expect(canCallWrongBook(delivered, now)).toBe(true);
    expect(canCallWrongBook({ ...delivered, status: 'in_library' }, now)).toBe(true);
    expect(canCallWrongBook({ ...delivered, status: 'downloading' }, now)).toBe(false);
    expect(canCallWrongBook(delivered, new Date('2026-01-09T12:00:01.000Z'))).toBe(false);
  });

  it('opens and closes one sheet for the whole app', () => {
    useWrongBookSheet.getState().open(delivered);
    expect(useWrongBookSheet.getState().request?.id).toBe('r1');
    useWrongBookSheet.getState().close();
    expect(useWrongBookSheet.getState().request).toBeNull();
  });
});

describe('Wrong book? sheet', () => {
  function broker(reply = () => ok(bookRequest({ status: 'choose_release' }))) {
    const b = fakeBroker({ 'POST /requests/r1/wrong-book': reply });
    setFetch(b.fetch);
    return b;
  }

  it('names both books, says what happens and defaults to searching myself', async () => {
    const b = broker();
    const onDone = jest.fn();
    const user = userEvent.setup();
    await renderWithProviders(
      <WrongBookSheet request={delivered} onClose={jest.fn()} onDone={onDone} />,
    );
    expect(
      screen.getByText(/We fetched “Ilse Varenkamp - Lantern Repair Manual”/),
    ).toBeOnTheScreen();
    expect(screen.getByText('It’s deleted from the library.')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: /^Search it myself/ })).toBeChecked();
    await user.press(screen.getByRole('button', { name: 'Remove and search' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('search_myself'));
    expect(b.calls[0]?.body).toEqual({ then: 'search_myself' });
  });

  it('can just remove it, or let Purrshelf look again', async () => {
    const b = broker();
    const onDone = jest.fn();
    const user = userEvent.setup();
    await renderWithProviders(
      <WrongBookSheet request={delivered} onClose={jest.fn()} onDone={onDone} />,
    );
    await user.press(screen.getByRole('radio', { name: /^Just remove it/ }));
    await user.press(screen.getByRole('button', { name: 'Remove it' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('remove_only'));
    await user.press(screen.getByRole('radio', { name: /^Let Purrshelf look again/ }));
    expect(screen.getByText('Same as Add · up to 4 searches')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Remove and search' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('search_again'));
    expect(b.calls.map((c) => c.body)).toEqual([{ then: 'remove_only' }, { then: 'search_again' }]);
  });

  it('does not promise a delete for a book that was already in the library', async () => {
    broker();
    await renderWithProviders(
      <WrongBookSheet
        request={{ ...delivered, release: null }}
        onClose={jest.fn()}
        onDone={jest.fn()}
      />,
    );
    expect(screen.getByText(/You asked for/)).toBeOnTheScreen();
    expect(screen.queryByText('It’s deleted from the library.')).toBeNull();
  });

  it('keeps it, and says why the broker refused', async () => {
    broker(() => apiError(502, 'LIBRARY_UNAVAILABLE'));
    const onClose = jest.fn();
    const onDone = jest.fn();
    const user = userEvent.setup();
    await renderWithProviders(
      <WrongBookSheet request={delivered} onClose={onClose} onDone={onDone} />,
    );
    await user.press(screen.getByRole('button', { name: 'Remove and search' }));
    expect(await screen.findByRole('alert')).toBeOnTheScreen();
    expect(onDone).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Keep it' }));
    expect(onClose).toHaveBeenCalled();
  });
});
