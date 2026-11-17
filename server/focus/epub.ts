import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import type { FocusChapter } from '../../shared/focus';

// Reads EPUB files: a zip with an OPF package (metadata, file list, reading order) and XHTML chapters.

export class EpubError extends Error {}

/** Every file in a zip, by path. Reads the central directory, so it handles data descriptors too. */
function readZip(buffer: Buffer): Map<string, () => Buffer> {
  const END_SIGNATURE = 0x06054b50;
  const ENTRY_SIGNATURE = 0x02014b50;
  const searchFrom = Math.max(0, buffer.length - 65_557);
  let endOffset = -1;
  for (let offset = buffer.length - 22; offset >= searchFrom; offset--) {
    if (buffer.readUInt32LE(offset) === END_SIGNATURE) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset === -1) throw new EpubError('This file is not a valid EPUB (no zip directory).');

  const entryCount = buffer.readUInt16LE(endOffset + 10);
  let offset = buffer.readUInt32LE(endOffset + 16);
  const files = new Map<string, () => Buffer>();

  for (let index = 0; index < entryCount; index++) {
    if (buffer.readUInt32LE(offset) !== ENTRY_SIGNATURE) throw new EpubError('This EPUB has a damaged zip directory.');
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);

    files.set(name, () => {
      const dataStart = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
      const data = buffer.subarray(dataStart, dataStart + compressedSize);
      return method === 0 ? Buffer.from(data) : inflateRawSync(data);
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  mdash: '—', ndash: '–', hellip: '…', shy: '', copy: '©', eacute: 'é', egrave: 'è', aacute: 'á', iacute: 'í',
  oacute: 'ó', uacute: 'ú', ntilde: 'ñ', ouml: 'ö', uuml: 'ü', auml: 'ä', szlig: 'ß', ccedil: 'ç', times: '×',
};

const decodeEntities = (text: string) =>
  text.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const isHex = code[1] === 'x' || code[1] === 'X';
      const point = parseInt(code.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'))?.[2];

const stripTags = (html: string) => decodeEntities(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

const firstTagText = (xml: string, tag: string) => {
  const match = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? stripTags(match[1]) : '';
};

const BLOCK_TAGS = 'p|div|h[1-6]|li|blockquote|section|article|tr|dt|dd|pre|figcaption|aside';

/** The readable paragraphs of an XHTML chapter: block elements become paragraphs; tags and notes go. */
function paragraphsOf(xhtml: string): string[] {
  const body = xhtml.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? xhtml;
  const text = body
    .replace(/<(script|style|svg|math|head)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<sup\b[\s\S]*?<\/sup>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(new RegExp(`</?(?:${BLOCK_TAGS})\\b[^>]*>`, 'gi'), '\n')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(text)
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => /[\p{L}\p{N}]/u.test(line));
}

const resolveHref = (baseDir: string, href: string) =>
  path.posix.normalize(path.posix.join(baseDir, decodeURIComponent(href.split('#')[0])));

// Font obfuscation is not DRM; any other encrypted content is.
const FONT_OBFUSCATION = ['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC'];

function assertNotProtected(files: Map<string, () => Buffer>) {
  if (files.has('META-INF/rights.xml')) throw new EpubError('This EPUB is DRM-protected, so it can’t be read.');
  const encryption = files.get('META-INF/encryption.xml')?.().toString('utf8');
  if (!encryption) return;
  const algorithms = [...encryption.matchAll(/<(?:\w+:)?EncryptionMethod\b[^>]*>/gi)].map((match) => attr(match[0], 'Algorithm'));
  const hasDrm = algorithms.some((algorithm) => !algorithm || !FONT_OBFUSCATION.includes(algorithm));
  if (hasDrm) throw new EpubError('This EPUB is DRM-protected, so it can’t be read.');
}

export interface ParsedEpub {
  title: string;
  author: string;
  chapters: FocusChapter[];
  cover?: { data: Buffer; mediaType: string };
}

export function parseEpub(buffer: Buffer): ParsedEpub {
  const files = readZip(buffer);
  const read = (name: string) => {
    const file = files.get(name);
    if (!file) throw new EpubError(`This EPUB is missing ${name}.`);
    return file().toString('utf8');
  };

  assertNotProtected(files);

  const container = read('META-INF/container.xml');
  const rootTag = container.match(/<rootfile\b[^>]*>/i)?.[0];
  const opfPath = rootTag && attr(rootTag, 'full-path');
  if (!opfPath) throw new EpubError('This EPUB has no package file.');
  const opf = read(opfPath);
  const opfDir = path.posix.dirname(opfPath);

  const manifest = new Map<string, { href: string; mediaType: string; properties: string }>();
  for (const [tag] of opf.matchAll(/<item\b[^>]*>/gi)) {
    const id = attr(tag, 'id');
    const href = attr(tag, 'href');
    if (!id || !href) continue;
    manifest.set(id, { href: resolveHref(opfDir, href), mediaType: attr(tag, 'media-type') ?? '', properties: attr(tag, 'properties') ?? '' });
  }

  const spine = [...opf.matchAll(/<itemref\b[^>]*>/gi)]
    .map(([tag]) => manifest.get(attr(tag, 'idref') ?? ''))
    .filter((item) => item && /x?html/.test(item.mediaType));

  const titles = tocTitles(files, manifest, opf);

  const chapters: FocusChapter[] = [];
  for (const item of spine) {
    const xhtml = files.get(item!.href)?.().toString('utf8');
    if (!xhtml) continue;
    const paragraphs = paragraphsOf(xhtml);
    if (!paragraphs.length) continue;
    const title = titles.get(item!.href) || firstTagText(xhtml, 'h1') || firstTagText(xhtml, 'h2') || firstTagText(xhtml, 'title');
    // The heading usually repeats as the first paragraph; the reader shows the title already.
    const isTitleRepeated = Boolean(title) && paragraphs[0].toLowerCase() === title.toLowerCase();
    const body = isTitleRepeated ? paragraphs.slice(1) : paragraphs;
    if (!body.length) continue;
    chapters.push({ title: title || `Section ${chapters.length + 1}`, paragraphs: body });
  }
  if (!chapters.length) throw new EpubError('No readable text was found in this EPUB.');

  const coverItem =
    [...manifest.values()].find((item) => item.properties.split(/\s+/).includes('cover-image')) ??
    manifest.get(attr(opf.match(/<meta\b[^>]*name=["']cover["'][^>]*>/i)?.[0] ?? '', 'content') ?? '');
  const coverFile = coverItem && coverItem.mediaType.startsWith('image/') ? files.get(coverItem.href) : undefined;

  return {
    title: firstTagText(opf, 'dc:title'),
    author: firstTagText(opf, 'dc:creator'),
    chapters,
    ...(coverFile && coverItem && { cover: { data: coverFile(), mediaType: coverItem.mediaType } }),
  };
}

/** Chapter titles by file, from the EPUB 3 nav page or the EPUB 2 NCX. The first title per file wins. */
function tocTitles(
  files: Map<string, () => Buffer>,
  manifest: Map<string, { href: string; mediaType: string; properties: string }>,
  opf: string
): Map<string, string> {
  const titles = new Map<string, string>();
  const add = (baseDir: string, href: string | undefined, label: string) => {
    if (!href || !label) return;
    const file = resolveHref(baseDir, href);
    if (!titles.has(file)) titles.set(file, label);
  };

  const navItem = [...manifest.values()].find((item) => item.properties.split(/\s+/).includes('nav'));
  const nav = navItem && files.get(navItem.href)?.().toString('utf8');
  if (nav && navItem) {
    const toc = nav.match(/<nav\b[^>]*epub:type=["'][^"']*toc[^"']*["'][^>]*>([\s\S]*?)<\/nav>/i)?.[1] ?? nav;
    const baseDir = path.posix.dirname(navItem.href);
    for (const [, tag, label] of toc.matchAll(/(<a\b[^>]*>)([\s\S]*?)<\/a>/gi)) add(baseDir, attr(tag, 'href'), stripTags(label));
    if (titles.size) return titles;
  }

  const ncxId = attr(opf.match(/<spine\b[^>]*>/i)?.[0] ?? '', 'toc');
  const ncxItem = (ncxId && manifest.get(ncxId)) || [...manifest.values()].find((item) => item.mediaType === 'application/x-dtbncx+xml');
  const ncx = ncxItem && files.get(ncxItem.href)?.().toString('utf8');
  if (ncx && ncxItem) {
    const baseDir = path.posix.dirname(ncxItem.href);
    for (const [point] of ncx.matchAll(/<navPoint\b[\s\S]*?<content\b[^>]*>/gi)) {
      const label = firstTagText(point, 'text');
      const content = point.match(/<content\b[^>]*>/i)?.[0] ?? '';
      add(baseDir, attr(content, 'src'), label);
    }
  }
  return titles;
}
