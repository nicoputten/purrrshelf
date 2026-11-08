import type { BookRequest, PickedRelease } from '@purrshelf/contract';
import type { TFunction } from 'i18next';
import { languageName } from '@/features/search/SearchResult';

export type StepState = 'done' | 'current' | 'pending' | 'failed';

export interface Step {
  key: 'sniff' | 'pick' | 'download' | 'import' | 'kobo';
  label: string;
  detail?: string;
  state: StepState;
}

/** "1.4 MB", "820 KB". */
export function formatSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

/** "EPUB · 1.4 MB · English". */
export function releaseLine(release: Omit<PickedRelease, 'id' | 'title'>, t: TFunction): string {
  const parts: string[] = [];
  if (release.format) parts.push(release.format.toUpperCase());
  parts.push(release.size !== null ? formatSize(release.size) : t('picker.unknownSize'));
  if (release.language && release.language !== 'other') parts.push(languageName(release.language));
  return parts.join(' · ');
}

/** Where the request is on the way: 0 sniff, 1 pick, 2 download, 3 import, 4 on the Kobo. */
function position(status: BookRequest['status']): number {
  switch (status) {
    case 'searching':
    case 'waiting_budget':
    case 'not_found':
      return 0;
    case 'choose_release':
      return 1;
    case 'downloading':
    case 'download_failed':
      return 2;
    case 'importing':
    case 'import_failed':
      return 3;
    default:
      return 4;
  }
}

/** The five steps of the Requests card (canvas board 4). */
export function requestSteps(request: BookRequest, myId: string | undefined, t: TFunction): Step[] {
  const at = position(request.status);
  const failed = ['not_found', 'download_failed', 'import_failed'].includes(request.status);
  const state = (i: number): StepState =>
    i < at ? 'done' : i === at ? (failed ? 'failed' : at === 4 ? 'done' : 'current') : 'pending';
  const forMe = myId !== undefined && request.pushTo.includes(myId);
  const lastLabel =
    request.pushTo.length === 0 || request.status === 'in_library'
      ? t('requests.steps.library')
      : forMe
        ? t('requests.steps.kobo')
        : t('requests.steps.koboOther');

  const sniff: Step =
    request.status === 'waiting_budget'
      ? { key: 'sniff', label: t('requests.steps.waiting'), state: 'current' }
      : at === 0 && request.status === 'searching'
        ? { key: 'sniff', label: t('requests.steps.sniffing'), state: 'current' }
        : {
            key: 'sniff',
            label: t('requests.steps.sniff'),
            ...(request.searches > 0
              ? {
                  detail:
                    request.searches === 1
                      ? t('requests.steps.firstTry')
                      : t('requests.steps.foundAfter', { count: request.searches }),
                }
              : {}),
            state: state(0),
          };
  const pick: Step = {
    key: 'pick',
    label:
      request.status === 'choose_release' ? t('requests.steps.choose') : t('requests.steps.pick'),
    ...(request.release ? { detail: releaseLine(request.release, t) } : {}),
    state: state(1),
  };
  const download: Step = {
    key: 'download',
    label: t('requests.steps.download'),
    ...(request.status === 'downloading' ? { detail: `${request.progress ?? 0}%` } : {}),
    state: state(2),
  };
  return [
    sniff,
    pick,
    download,
    { key: 'import', label: t('requests.steps.import'), state: state(3) },
    { key: 'kobo', label: lastLabel, state: state(4) },
  ];
}
