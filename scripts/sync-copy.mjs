import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { copy } from '../docs/content.js';

const file = fileURLToPath(new URL('../docs/index.html', import.meta.url));
const text = copy.ko;
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
let html = await readFile(file, 'utf8');
html = html.replace(/(<([a-z\d]+)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>)[^<]*(<\/\2>)/g, (match, open, tag, key, close) => {
  if (!(key in text)) throw new Error(`Missing translation: ${key}`);
  return open + escape(text[key]) + close;
});
html = html.replace(/<[^>]+data-i18n-(alt|aria)="[^"]+"[^>]*>/g, tag => {
  const [, kind, key] = tag.match(/data-i18n-(alt|aria)="([^"]+)"/);
  const attribute = kind === 'alt' ? 'alt' : 'aria-label';
  return tag.replace(new RegExp(`\\b${attribute}="[^"]*"`), `${attribute}="${escape(text[key])}"`);
});
html = html.replace(/<title>[^<]*<\/title>/, `<title>${escape(text.pageTitle)}</title>`);
html = html.replace(/(<meta name="description" content=")[^"]*(">)/, (_, open, close) => open + escape(text.metaDescription) + close);
html = html.replace(/(<meta property="og:description" content=")[^"]*(">)/, (_, open, close) => open + escape(text.metaDescription) + close);
await writeFile(file, html);
console.log('Korean HTML fallback synchronized with content.js.');
