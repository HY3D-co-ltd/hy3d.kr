import { readFile, readdir, lstat, access } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const site = path.join(root, 'docs');
const languages = ['ko', 'en'];
const businessSlugs = ['manufacturing', 'education', 'ai'];
const failures = [];
let checks = 0;
const assert = (condition, message) => {
  checks += 1;
  if (!condition) failures.push(message);
};
const label = file => path.relative(site, file).split(path.sep).join('/');

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    const info = await lstat(full);
    assert(!info.isSymbolicLink(), `Symbolic links are not published: ${label(full)}`);
    if (info.isSymbolicLink()) continue;
    if (entry.isDirectory()) files.push(...await listFiles(full));
    else files.push(full);
  }
  return files;
}

const decode = value => value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (_, entity) => {
  const names = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  if (entity[0] === '#') return String.fromCodePoint(parseInt(entity.slice(entity[1]?.toLowerCase() === 'x' ? 2 : 1), entity[1]?.toLowerCase() === 'x' ? 16 : 10));
  return names[entity.toLowerCase()];
});

function attributes(source) {
  const result = {};
  const expression = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of source.matchAll(expression)) result[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4] ?? '');
  return result;
}

function tags(html) {
  return [...html.matchAll(/<([a-z][\w:-]*)\b((?:"[^"]*"|'[^']*'|[^'">])*)>/gi)]
    .map(match => ({ name: match[1].toLowerCase(), attrs: attributes(match[2]), end: match.index + match[0].length }));
}

const publicAddresses = [
  '경기도 안산시 상록구 한양대학로 55, 창업보육센터 204호',
  '경기도 화성시 매화2길 26, 하이스퀘어 A동',
  'Room 204, Business Incubation Center, 55 Hanyangdaehak-ro, Sangnok-gu, Ansan-si, Gyeonggi-do, South Korea',
  'Bldg. A, Hi Square, 26 Maehwa 2-gil, Hwaseong-si, Gyeonggi-do, South Korea',
];

function checkPublicNumbers(text, location) {
  let remaining = text;
  for (const address of publicAddresses) remaining = remaining.replaceAll(address, ' ');
  remaining = remaining
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, ' ')
    .replace(/\b0\d{1,2}-\d{3,4}-\d{4}\b/g, ' ')
    .replace(/\+82\d{8,10}\b/g, ' ')
    .replace(/HY3D|3D/gi, ' ')
    .replace(/\b(?:19|20)\d{2}\b/g, ' ');
  assert(!/\d/.test(remaining), `Review unapproved numeric claims in ${location}; only public contacts, addresses, years, and brand/product names are allowed.`);
}

function checkPublicSource(text, location) {
  const forbidden = [
    /(?:(?:^|[\s"'(])[a-z]:[\\/]|file:\/\/|\/(?:Users|home|workspace)\/)/i,
    /(?:localhost|127\.0\.0\.1|appgprj_|\.chatgpt\.site|\.openai[\\/])/i,
    /(?:대외비|영업이익|가동률|원가|마진율|설계 데이터|상담 데이터|operating profit|profit margin|unit cost)/i,
  ];
  assert(!forbidden.some(pattern => pattern.test(text)), `Private source details or internal business information found in ${location}.`);
}

function checkTranslations(copy, location) {
  const complete = copy && languages.every(language => copy[language] && typeof copy[language] === 'object');
  assert(complete, `Both Korean and English content must exist in ${location}.`);
  if (!complete) return false;
  assert(JSON.stringify(Object.keys(copy.ko).sort()) === JSON.stringify(Object.keys(copy.en).sort()), `Korean and English translation keys differ in ${location}.`);
  for (const language of languages) {
    for (const [key, value] of Object.entries(copy[language])) {
      const entry = `${location}.${language}.${key}`;
      assert(typeof value === 'string' && value.trim().length > 0, `Empty or invalid translation: ${entry}`);
      if (typeof value !== 'string') continue;
      checkPublicNumbers(value, entry);
      checkPublicSource(value, entry);
      if (language === 'en') assert(!/[가-힣]/.test(value), `Untranslated Korean in English content: ${entry}`);
    }
  }
  return true;
}

async function validate() {
  await access(path.join(site, 'index.html'));
  const files = await listFiles(site);
  const fileSet = new Set(files.map(file => path.resolve(file)));
  const allowedExtensions = new Set(['.html', '.css', '.js', '.webp', '.png', '.jpg', '.jpeg', '.svg', '.ico', '.woff', '.woff2', '.txt', '.xml', '.webmanifest']);
  for (const file of files) {
    const relative = label(file);
    const basename = path.basename(file);
    assert(allowedExtensions.has(path.extname(file).toLowerCase()) || ['.nojekyll', 'CNAME'].includes(basename), `Unexpected published file: ${relative}`);
    assert(!relative.split('/').some(part => part.startsWith('.') && part !== '.nojekyll'), `Hidden development file in published directory: ${relative}`);
  }

  const htmlFiles = files.filter(file => path.extname(file) === '.html');
  const documents = new Map();
  for (const file of htmlFiles) {
    const html = await readFile(file, 'utf8');
    const elements = tags(html);
    const ids = elements.filter(element => element.attrs.id).map(element => element.attrs.id);
    assert(ids.length === new Set(ids).size, `Duplicate element IDs in ${label(file)}`);
    documents.set(path.resolve(file), { html, elements, ids: new Set(ids) });
  }

  async function checkReference(reference, source, kind) {
    if (!reference || /^(?:https?:|mailto:|tel:|data:)/i.test(reference)) return;
    if (/^[a-z][a-z\d+.-]*:/i.test(reference)) {
      assert(false, `Unsupported URL in ${label(source)} (${kind}).`);
      return;
    }
    assert(!reference.startsWith('/'), `Use a relative path for GitHub Pages project hosting: ${reference} in ${label(source)}`);
    let resource;
    let fragment;
    try {
      const url = new URL(reference, pathToFileURL(source));
      fragment = decodeURIComponent(url.hash.slice(1));
      url.hash = '';
      url.search = '';
      resource = fileURLToPath(url);
    } catch {
      assert(false, `Invalid reference in ${label(source)} (${kind}).`);
      return;
    }
    const relative = path.relative(site, resource);
    assert(relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), `Reference leaves published directory in ${label(source)} (${kind}).`);
    if (resource.endsWith(path.sep)) resource = path.join(resource, 'index.html');
    assert(fileSet.has(path.resolve(resource)), `Missing local resource ${reference} in ${label(source)}`);
    if (fragment && documents.has(path.resolve(resource))) {
      assert(documents.get(path.resolve(resource)).ids.has(fragment), `Missing anchor ${reference} in ${label(source)}`);
    }
  }

  for (const [file, document] of documents) {
    checkPublicSource(document.html, label(file));
    const visibleText = decode(document.html
      .replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]*>/g, ' '));
    checkPublicNumbers(visibleText, label(file));
    for (const element of document.elements) {
      for (const attribute of ['href', 'src', 'poster']) {
        if (element.attrs[attribute]) await checkReference(element.attrs[attribute], file, attribute);
      }
      if (element.attrs.srcset) {
        for (const candidate of element.attrs.srcset.split(',')) await checkReference(candidate.trim().split(/\s+/)[0], file, 'srcset');
      }
      if (element.name === 'img') assert(Object.hasOwn(element.attrs, 'alt'), `Image missing alternative text in ${label(file)}`);
    }
  }

  for (const file of files.filter(file => /\.(?:js|css|xml|txt|webmanifest)$/.test(file))) {
    const source = await readFile(file, 'utf8');
    checkPublicSource(source, label(file));
    if (file.endsWith('.js')) {
      const syntax = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
      assert(syntax.status === 0, `JavaScript syntax error in ${label(file)}: ${syntax.stderr.trim()}`);
      for (const match of source.matchAll(/\b(?:import|export)\s+(?:[^;"']*?\s+from\s*)?["']([^"']+)["']/g)) {
        await checkReference(match[1], file, 'module import');
      }
    }
    if (file.endsWith('.css')) {
      for (const match of source.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) await checkReference(match[1].trim(), file, 'CSS asset');
    }
  }

  const { copy } = await import(pathToFileURL(path.join(site, 'content.js')).href);
  const { businessPages } = await import(pathToFileURL(path.join(site, 'business-content.js')).href);
  if (!checkTranslations(copy, 'shared')) return;
  const pageCopies = new Map([[path.resolve(site, 'index.html'), copy]]);
  for (const slug of businessSlugs) {
    const business = businessPages?.[slug];
    const file = path.resolve(site, 'business', slug, 'index.html');
    const document = documents.get(file);
    assert(Boolean(document), `Missing business page: business/${slug}/index.html; run npm run sync-copy.`);
    if (document) assert(document.elements.find(element => element.name === 'body')?.attrs['data-business'] === slug, `Business page identity does not match ${slug}.`);
    if (!checkTranslations(business?.copy, slug)) continue;
    for (const key of ['brand', 'image', 'logo', 'website', 'email', 'phone', 'phoneHref']) {
      const value = business.metadata?.[key];
      assert(typeof value === 'string' && value.trim().length > 0, `Missing business metadata: ${slug}.${key}`);
      if (typeof value !== 'string') continue;
      checkPublicSource(value, `${slug}.metadata.${key}`);
      if (['brand', 'email', 'phone', 'phoneHref'].includes(key)) checkPublicNumbers(value, `${slug}.metadata.${key}`);
    }
    checkPublicSource(JSON.stringify(business.metadata), `${slug}.metadata`);
    const checkVisual = async (visual, location) => {
      const localImage = typeof visual?.image === 'string' && /^[\w.-]+\.(?:jpe?g|png|webp|svg)$/i.test(visual.image);
      assert(localImage, `A local image filename is required in ${location}.`);
      if (localImage) await checkReference(`assets/${visual.image}`, path.join(site, 'index.html'), location);
      for (const dimension of ['width', 'height']) {
        assert(Number.isInteger(visual?.[dimension]) && visual[dimension] > 0, `Invalid image ${dimension} in ${location}.`);
      }
    };
    await checkVisual({ image: business.metadata?.logo, width: business.metadata?.logoWidth, height: business.metadata?.logoHeight }, `${slug}.logo`);
    await checkReference(`assets/${business.metadata?.image}`, path.join(site, 'index.html'), `${slug}.socialImage`);
    assert(/^https:\/\//.test(business.metadata?.website), `Use the official HTTPS brand website in ${slug}.`);
    if (document) {
      const hero = document.html.match(/<section class="detail-hero"[\s\S]*?<\/section>/)?.[0] || '';
      assert(hero.includes(`href="${business.metadata.website}"`), `The official brand website must appear at the top of ${slug}.`);
      assert(hero.includes(`assets/${business.metadata.logo}`), `The original brand logo must appear at the top of ${slug}.`);
      assert(!/href="#/.test(hero), `Remove internal jump links from the brand introduction in ${slug}.`);
    }
    pageCopies.set(file, Object.fromEntries(languages.map(language => [language, { ...copy[language], ...business.copy[language] }])));
  }

  for (const [file, document] of documents) {
    const pageCopy = pageCopies.get(file);
    assert(Boolean(pageCopy), `No content definition for ${label(file)}.`);
    if (!pageCopy) continue;
    assert(document.elements.filter(element => element.name === 'h1').length === 1, `${label(file)} must have exactly one primary heading.`);
    for (const element of document.elements) {
      for (const [attribute, key] of Object.entries(element.attrs).filter(([name]) => ['data-i18n', 'data-i18n-alt', 'data-i18n-aria'].includes(name))) {
        assert(languages.every(language => typeof pageCopy[language][key] === 'string'), `Unknown translation key: ${label(file)}:${key}`);
        if (!(key in pageCopy.ko)) continue;
        let actual;
        if (attribute === 'data-i18n-alt') actual = element.attrs.alt;
        else if (attribute === 'data-i18n-aria') actual = element.attrs['aria-label'];
        else actual = decode(document.html.slice(element.end).split('</')[0]);
        assert(actual?.replace(/\r\n/g, '\n') === pageCopy.ko[key], `Static Korean is out of sync at ${label(file)}:${key}; run npm run sync-copy.`);
      }
    }
    const pageTitle = decode(document.html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '');
    assert(pageTitle === pageCopy.ko.pageTitle, `Static page title does not match Korean content in ${label(file)}.`);
    const description = document.elements.find(element => element.name === 'meta' && element.attrs.name === 'description')?.attrs.content;
    assert(description === pageCopy.ko.metaDescription, `Static page description does not match Korean content in ${label(file)}.`);
  }
  console.log(`Checked ${files.length} public files, ${htmlFiles.length} HTML document(s), and ${languages.length} languages.`);
}

try {
  await validate();
} catch (error) {
  failures.push(`Validation could not complete: ${error.message}`);
}
if (failures.length) {
  console.error(`Site validation failed (${failures.length} issues):`);
  for (const message of failures) console.error(`- ${message}`);
  process.exitCode = 1;
} else {
  console.log(`Site validation passed (${checks} checks). No build or dependency installation required.`);
}
