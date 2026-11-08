import type { CoverSize } from '@purrshelf/contract';
import sharp from 'sharp';
import { COVER_SIZES } from './sizes.js';

/** Muted card colours from docs/design/design-choices.md, picked per book from its id. */
export const PLACEHOLDER_COLOURS = [
  '#4A5B3F',
  '#5B3F4F',
  '#3F4A5B',
  '#5B4A3F',
  '#3F5B54',
  '#57503A',
  '#4F3F5B',
  '#5B453F',
  '#3F535B',
];

export function colourFor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PLACEHOLDER_COLOURS[h % PLACEHOLDER_COLOURS.length] ?? '#3F4A5B';
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Greedy word wrap into at most `maxLines` lines, with an ellipsis when cut. */
export function wrap(text: string, perLine: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= perLine || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${(kept[maxLines - 1] ?? '').slice(0, perLine - 1)}…`;
    return kept;
  }
  return lines.map((l) => (l.length > perLine ? `${l.slice(0, perLine - 1)}…` : l));
}

/** SVG of the placeholder card: the title on a coloured card with cat ears. */
export function placeholderSvg(id: string, title: string, author: string | null): string {
  const w = 480;
  const h = 720;
  const titleLines = wrap(title || '?', 14, 5);
  const titleTspans = titleLines
    .map((l, i) => `<tspan x="240" dy="${i === 0 ? 0 : 58}">${escapeXml(l)}</tspan>`)
    .join('');
  const titleTop = 330 - ((titleLines.length - 1) * 58) / 2;
  const authorText = author
    ? `<text x="240" y="640" font-family="Nunito, sans-serif" font-size="30" fill="#F4EFEA" fill-opacity="0.75" text-anchor="middle">${escapeXml(wrap(author, 24, 1)[0] ?? '')}</text>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<rect width="${w}" height="${h}" rx="36" fill="${colourFor(id)}"/>
<path d="M150 110 L185 50 L220 110 Z M260 110 L295 50 L330 110 Z" fill="#F4EFEA" fill-opacity="0.35"/>
<text x="240" y="${titleTop}" font-family="Fredoka, sans-serif" font-weight="600" font-size="50" fill="#F4EFEA" text-anchor="middle">${titleTspans}</text>
${authorText}
</svg>`;
}

export async function renderPlaceholder(
  id: string,
  title: string,
  author: string | null,
  size: CoverSize,
): Promise<Buffer> {
  return sharp(Buffer.from(placeholderSvg(id, title, author)))
    .resize(COVER_SIZES[size])
    .webp({ quality: 80 })
    .toBuffer();
}
