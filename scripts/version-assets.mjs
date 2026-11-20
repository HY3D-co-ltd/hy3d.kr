import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const docs = fileURLToPath(new URL('../docs/', import.meta.url));
const checkOnly = process.argv.includes('--check');
if (process.argv.slice(2).some(argument => argument !== '--check')) throw new Error('Usage: node scripts/version-assets.mjs [--check]');
const versions = new Map();
const changes = [];
const normalize = source => source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
const hash = source => createHash('sha256').update(normalize(source)).digest('hex').slice(0, 12);

for (const name of ['content.js', 'business-content.js', 'styles.css', 'business.css']) {
  versions.set(name, hash(await readFile(path.join(docs, name), 'utf8')));
}
for (const name of ['favicon.ico', 'favicon.png']) {
  versions.set(name, createHash('sha256').update(await readFile(path.join(docs, 'assets', name))).digest('hex').slice(0, 12));
}

function versioned(reference) {
  const [withQuery, fragment] = reference.split('#', 2);
  const [pathname, search = ''] = withQuery.split('?', 2);
  const name = pathname.split('/').at(-1);
  if (!versions.has(name) || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(reference)) return reference;
  const query = new URLSearchParams(search.replaceAll('&amp;', '&'));
  query.set('v', versions.get(name));
  return pathname + '?' + query.toString() + (fragment === undefined ? '' : '#' + fragment);
}

async function update(file, previous, next) {
  if (normalize(previous) === normalize(next)) return;
  changes.push(path.relative(docs, file).split(path.sep).join('/'));
  if (!checkOnly) await writeFile(file, normalize(next));
}

const appFile = path.join(docs, 'app.js');
const appBefore = await readFile(appFile, 'utf8');
const imported = new Set();
const appAfter = appBefore.replace(/(\bfrom\s*["'])(\.\/(?:business-content|content)\.js(?:\?[^"']*)?)(["'])/g, (_, before, reference, after) => {
  imported.add(reference.split('?')[0]);
  return before + versioned(reference) + after;
});
if (imported.size !== 2) throw new Error('Expected both content modules in app.js imports.');
await update(appFile, appBefore, appAfter);
versions.set('app.js', hash(appAfter));

async function htmlFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await htmlFiles(full));
    else if (entry.name.endsWith('.html')) files.push(full);
  }
  return files;
}

const pages = await htmlFiles(docs);
for (const file of pages) {
  const before = await readFile(file, 'utf8');
  const after = before.replace(/(<(?:script|link)\b[^>]*?\b(?:src|href)=["'])([^"']+)(["'])/gi, (_, open, reference, close) => open + versioned(reference) + close);
  await update(file, before, after);
}

if (checkOnly && changes.length) {
  console.error('Asset versions are stale in: ' + changes.join(', ') + '. Run npm run sync-copy.');
  process.exitCode = 1;
} else {
  console.log((checkOnly ? 'Verified' : 'Versioned') + ' shared modules and styles across ' + pages.length + ' HTML pages; ' + changes.length + ' file(s) ' + (checkOnly ? 'need changes.' : 'updated.'));
}
