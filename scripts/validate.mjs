import { readFile, readdir, lstat, access } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const site = path.join(root, 'docs');
const origin = 'https://hy3d.kr';
const languages = ['ko', 'en'];
const businessSlugs = ['manufacturing', 'education', 'ai'];
const pagePath = (language, slug = '') => `${language === 'en' ? '/en/' : '/'}${slug ? `business/${slug}/` : ''}`;
const pageUrl = (language, slug = '') => origin + pagePath(language, slug);
const pageFile = (language, slug = '') => path.resolve(site, `.${pagePath(language, slug)}`, 'index.html');
const failures = [];
let checks = 0;
const assert = (condition, message) => {
  checks += 1;
  if (!condition) failures.push(message);
};
const label = file => path.relative(site, file).split(path.sep).join('/');
const textContent = html => decode(html
  .replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<[^>]*>/g, ' '));
const hasType = (node, type) => [node?.['@type']].flat().includes(type);
const linkedIds = value => [value].flat().map(item => typeof item === 'string' ? item : item?.['@id']).filter(Boolean);
const normalizeText = value => String(value).replace(/\s+/g, ' ').trim();

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

function checkStructuredData(document, file, language, slug, pageCopy, businessPages, fileSet) {
  const location = label(file);
  const scripts = document.elements.filter(element => element.name === 'script' && element.attrs.type === 'application/ld+json');
  assert(scripts.length === 1 && scripts[0]?.attrs.id === 'structured-data', `Use one static #structured-data JSON-LD graph in ${location}.`);
  if (scripts.length !== 1) return;
  let data;
  try { data = JSON.parse(document.html.slice(scripts[0].end).split('</script>')[0]); }
  catch { assert(false, `Invalid JSON-LD in ${location}.`); return; }
  assert(data['@context'] === 'https://schema.org' && Array.isArray(data['@graph']), `Expected a schema.org @graph in ${location}.`);
  if (!Array.isArray(data['@graph'])) return;
  const graph = data['@graph'];
  const nodes = new Map(graph.map(node => [node['@id'], node]));
  assert(nodes.size === graph.length && graph.every(node => typeof node['@id'] === 'string' && node['@id'].startsWith(`${origin}/`)), `JSON-LD entities need unique absolute site IDs in ${location}.`);
  const canonical = pageUrl(language, slug);
  const organizationId = `${origin}/#organization`;
  const websiteId = `${origin}/#website`;
  const organization = nodes.get(organizationId);
  const website = nodes.get(websiteId);
  const webpage = nodes.get(`${canonical}#webpage`);
  assert(hasType(organization, 'Organization') && organization.name === 'HY3D' && organization.legalName === pageCopy[language].footerCompany, `Organization identity must match the public company in ${location}.`);
  assert(organization?.url === `${origin}/` && typeof organization.logo === 'string' && organization.logo.startsWith(`${origin}/assets/`), `Organization needs its canonical website and public logo in ${location}.`);
  assert(hasType(organization?.address, 'PostalAddress') && organization.address.addressCountry === 'KR' && Boolean(organization.address.streetAddress), `Organization needs its public Korean postal address in ${location}.`);
  assert(hasType(website, 'WebSite') && linkedIds(website.publisher).includes(organizationId), `WebSite must identify its publisher in ${location}.`);
  assert(hasType(webpage, 'WebPage') && webpage.url === canonical && webpage.inLanguage === language, `WebPage URL/language does not match ${location}.`);
  assert(webpage?.name === pageCopy[language].pageTitle && webpage?.description === pageCopy[language].metaDescription, `WebPage text must match page metadata in ${location}.`);
  assert(linkedIds(webpage?.isPartOf).includes(websiteId), `WebPage must belong to the HY3D WebSite in ${location}.`);
  assert(graph.filter(node => hasType(node, 'Brand')).length === businessSlugs.length, `The public graph must describe the three brands in ${location}.`);
  for (const brandSlug of businessSlugs) {
    const business = businessPages[brandSlug];
    const brand = nodes.get(`${origin}/#brand-${brandSlug}`);
    assert(hasType(brand, 'Brand') && brand.name === business.copy[language].detailBrandLabel && brand.url === business.metadata.website, `Brand identity or official URL is incorrect for ${brandSlug} in ${location}.`);
    const logoVariants = [business.metadata.logo, business.metadata.logo.replace('-light.png', '.png')];
    assert(logoVariants.some(logo => brand?.logo === `${origin}/assets/${logo}` && fileSet.has(path.resolve(site, 'assets', logo))), `Brand logo is incorrect or missing for ${brandSlug} in ${location}.`);
  }
  if (slug) {
    const service = nodes.get(`${canonical}#service`);
    const brandId = `${origin}/#brand-${slug}`;
    assert(hasType(service, 'Service') && service.url === canonical, `Detail page Service is missing in ${location}.`);
    assert(service?.name === pageCopy[language].detailBrandLabel && service?.description === pageCopy[language].detailIntro && service?.serviceType === pageCopy[language].detailEyebrow, `Service must describe the visible brand introduction in ${location}.`);
    assert(linkedIds(service?.brand).includes(brandId) && linkedIds(webpage?.about).includes(brandId) && linkedIds(webpage?.mainEntity).includes(`${canonical}#service`), `Brand, Service and WebPage references are inconsistent in ${location}.`);
    assert(service?.provider === undefined, `Do not infer a legal service provider in ${location}.`);
    const metadata = businessPages[slug].metadata;
    const channel = service?.availableChannel;
    assert(channel?.serviceUrl === metadata.website && channel?.servicePhone?.telephone === metadata.phoneHref.replace(/^tel:/, '') && channel?.servicePhone?.email === metadata.email, `Structured service contacts must match the public contact details in ${location}.`);
    if (service?.hasOfferCatalog) {
      const offerings = service.hasOfferCatalog.itemListElement;
      assert(Array.isArray(offerings) && offerings.length === 3, `The service catalog must match the three visible services in ${location}.`);
      if (Array.isArray(offerings)) offerings.forEach((offer, index) => {
        assert(offer?.itemOffered?.name === pageCopy[language][`detailService${index + 1}Title`] && offer?.itemOffered?.description === pageCopy[language][`detailService${index + 1}Body`], `Service catalog entry ${index + 1} differs from visible content in ${location}.`);
      });
    }
  } else {
    assert(linkedIds(webpage?.mainEntity).includes(organizationId), `The home page must describe the company in ${location}.`);
    assert(!graph.some(node => hasType(node, 'Service')), `Service entities belong to the corresponding detail pages: ${location}.`);
  }
  const brandUrls = new Set(businessSlugs.map(item => businessPages[item].metadata.website));
  assert(![organization?.sameAs ?? []].flat().some(value => brandUrls.has(value)), `Brand websites must not be asserted to be the legal company's sameAs identity in ${location}.`);
  const normalizeAddress = value => String(value).replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
  const inspect = (value, key = '', parent = null) => {
    if (Array.isArray(value)) { value.forEach(item => inspect(item, key, parent)); return; }
    if (value && typeof value === 'object') {
      if (value['@id'] && Object.keys(value).length === 1) assert(nodes.has(value['@id']), `Unresolved JSON-LD entity ${value['@id']} in ${location}.`);
      for (const [property, item] of Object.entries(value)) inspect(item, property, value);
      return;
    }
    if (typeof value === 'number') { checkPublicNumbers(String(value), `${location} JSON-LD ${key}`); return; }
    if (typeof value !== 'string' || key.startsWith('@') || /^https?:\/\//.test(value)) return;
    if (hasType(parent, 'PostalAddress') && /\d/.test(value)) {
      assert(publicAddresses.some(address => normalizeAddress(address).includes(normalizeAddress(value))), `Unapproved postal-address component in ${location}.`);
    } else checkPublicNumbers(value, `${location} JSON-LD ${key}`);
    if (['description', 'serviceType'].includes(key)) {
      const visible = normalizeText(textContent(document.html));
      const companyIntroduction = hasType(parent, 'Organization') && value === pageCopy[language].aboutBody;
      assert(companyIntroduction || value === pageCopy[language].metaDescription || visible.includes(normalizeText(value)), `JSON-LD ${key} must agree with public page text in ${location}.`);
    }
  };
  inspect(data);
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
    if (!reference || /^(?:mailto:|tel:|data:)/i.test(reference)) return;
    assert(!reference.startsWith('//'), `Use an explicit HTTPS URL, not a protocol-relative reference in ${label(source)} (${kind}).`);
    let resource;
    let fragment;
    try {
      const url = new URL(reference, `${origin}/${label(source)}`);
      assert(/^https?:$/.test(url.protocol), `Unsupported URL in ${label(source)} (${kind}).`);
      if (!/^https?:$/.test(url.protocol) || url.origin !== origin) return;
      fragment = decodeURIComponent(url.hash.slice(1));
      resource = path.resolve(site, `.${decodeURIComponent(url.pathname)}`);
      if (url.pathname.endsWith('/')) resource = path.join(resource, 'index.html');
    } catch {
      assert(false, `Invalid reference in ${label(source)} (${kind}).`);
      return;
    }
    const relative = path.relative(site, resource);
    assert(relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), `Reference leaves published directory in ${label(source)} (${kind}).`);
    assert(fileSet.has(path.resolve(resource)), `Missing local resource ${reference} in ${label(source)}`);
    if (fragment && documents.has(path.resolve(resource))) {
      assert(documents.get(path.resolve(resource)).ids.has(fragment), `Missing anchor ${reference} in ${label(source)}`);
    }
  }

  for (const [file, document] of documents) {
    checkPublicSource(document.html, label(file));
    const visibleText = textContent(document.html);
    const errorPage = label(file) === '404.html';
    checkPublicNumbers(errorPage ? visibleText.replace(/\b404\b/g, ' ') : visibleText, label(file));
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
  const pageCopies = new Map(languages.map(language => [pageFile(language), copy]));
  const expectedPages = languages.flatMap(language => ['', ...businessSlugs].map(slug => ({ language, slug, file: pageFile(language, slug), url: pageUrl(language, slug) })));
  const pageIdentities = new Map(expectedPages.map(page => [page.file, page]));
  const expectedUrls = new Set(expectedPages.map(page => page.url));
  for (const page of expectedPages) assert(documents.has(page.file), `Missing static ${page.language} page: ${label(page.file)}; run npm run sync-copy.`);
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
    const translatedCopy = Object.fromEntries(languages.map(language => [language, { ...copy[language], ...business.copy[language] }]));
    for (const language of languages) pageCopies.set(pageFile(language, slug), translatedCopy);
  }

  for (const [file, document] of documents) {
    const location = label(file);
    const metas = (key, value) => document.elements.filter(element => element.name === 'meta' && element.attrs[key] === value);
    const links = relation => document.elements.filter(element => element.name === 'link' && element.attrs.rel?.split(/\s+/).includes(relation));
    const indexDirectives = metas('name', 'robots').map(element => element.attrs.content || '').join(',').toLowerCase();
    if (location === '404.html') {
      assert(/\bnoindex\b/.test(indexDirectives), '404.html must be noindex.');
      assert(document.elements.filter(element => element.name === 'h1').length === 1, '404.html needs a clear primary heading.');
      const recoveries = document.elements.filter(element => element.name === 'a' && element.attrs.href).map(element => {
        try { return new URL(element.attrs.href, `${origin}/404.html`).href; } catch { return ''; }
      });
      for (const language of languages) assert(recoveries.includes(pageUrl(language)), `404.html needs a ${language} home recovery link.`);
      continue;
    }
    const pageCopy = pageCopies.get(file);
    const identity = pageIdentities.get(file);
    assert(Boolean(pageCopy && identity), `No content definition for ${location}.`);
    if (!pageCopy || !identity) continue;
    const { language, slug, url: canonical } = identity;
    const text = pageCopy[language];
    assert(document.elements.find(element => element.name === 'html')?.attrs.lang === language, `Static HTML language must be ${language} in ${location}.`);
    assert(!/\b(?:noindex|none|nosnippet)\b/.test(indexDirectives), `Public canonical pages must allow indexing and snippets in ${location}.`);
    assert(document.elements.filter(element => element.name === 'h1').length === 1, `${location} must have exactly one primary heading.`);
    if (slug) {
      assert(document.elements.find(element => element.name === 'body')?.attrs['data-business'] === slug, `Business page identity does not match ${slug} in ${location}.`);
      const hero = document.html.match(/<section class="detail-hero"[\s\S]*?<\/section>/)?.[0] || '';
      assert(hero.includes(`href="${businessPages[slug].metadata.website}"`) && hero.includes(`assets/${businessPages[slug].metadata.logo}`), `Keep the official brand website and original logo at the top of ${location}.`);
      assert(!/href="#/.test(hero), `Remove internal jump links from the brand introduction in ${location}.`);
    }
    for (const element of document.elements) {
      for (const [attribute, key] of Object.entries(element.attrs).filter(([name]) => ['data-i18n', 'data-i18n-alt', 'data-i18n-aria'].includes(name))) {
        assert(languages.every(language => typeof pageCopy[language][key] === 'string'), `Unknown translation key: ${location}:${key}`);
        if (!(key in text)) continue;
        let actual;
        if (attribute === 'data-i18n-alt') actual = element.attrs.alt;
        else if (attribute === 'data-i18n-aria') actual = element.attrs['aria-label'];
        else actual = decode(document.html.slice(element.end).split('</')[0]);
        assert(actual?.replace(/\r\n/g, '\n') === text[key], `Static ${language} is out of sync at ${location}:${key}; run npm run sync-copy.`);
      }
    }
    if (language === 'en') {
      const bodyWithoutLanguageName = document.html.replace(/<a\b[^>]*data-lang="ko"[^>]*>[\s\S]*?<\/a>/gi, '');
      assert(!/[가-힣]/.test(textContent(bodyWithoutLanguageName)), `Untranslated visible Korean in ${location}.`);
    }
    const pageTitle = decode(document.html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '');
    assert(document.elements.filter(element => element.name === 'title').length === 1 && pageTitle === text.pageTitle, `Static page title does not match ${language} content in ${location}.`);
    assert(metas('name', 'description').length === 1 && metas('name', 'description')[0].attrs.content === text.metaDescription, `Static page description does not match ${language} content in ${location}.`);
    assert(links('canonical').length === 1 && links('canonical')[0].attrs.href === canonical, `Expected one self-canonical ${canonical} in ${location}.`);
    const alternates = links('alternate').filter(element => element.attrs.hreflang);
    assert(alternates.length === 3, `Expected ko, en and x-default hreflang links in ${location}.`);
    for (const alternate of ['ko', 'en', 'x-default']) {
      const candidates = alternates.filter(element => element.attrs.hreflang === alternate);
      assert(candidates.length === 1 && candidates[0].attrs.href === pageUrl(alternate === 'en' ? 'en' : 'ko', slug), `Incorrect ${alternate} hreflang in ${location}.`);
    }
    for (const [property, value] of Object.entries({ 'og:title': text.pageTitle, 'og:description': text.metaDescription, 'og:url': canonical, 'og:locale': language === 'en' ? 'en_US' : 'ko_KR' })) {
      const candidates = metas('property', property);
      assert(candidates.length === 1 && candidates[0].attrs.content === value, `Incorrect ${property} in ${location}.`);
    }
    const socialImage = metas('property', 'og:image');
    assert(socialImage.length === 1 && socialImage[0].attrs.content?.startsWith(`${origin}/assets/`), `Use an absolute public OG image in ${location}.`);
    if (socialImage[0]?.attrs.content) await checkReference(socialImage[0].attrs.content, file, 'og:image');
    for (const alternate of languages) {
      const controls = document.elements.filter(element => element.attrs['data-lang'] === alternate);
      assert(controls.length === 1 && controls[0].name === 'a' && Boolean(controls[0].attrs.href), `Language ${alternate} must be a native link in ${location}.`);
      if (controls[0]?.attrs.href) {
        const target = new URL(controls[0].attrs.href, canonical);
        assert(target.origin + target.pathname === pageUrl(alternate, slug) && !target.search, `Language switch must link to the corresponding ${alternate} page in ${location}.`);
      }
    }
    for (const element of document.elements.filter(element => element.name === 'a' && element.attrs.href)) {
      const target = new URL(element.attrs.href, canonical);
      if (target.origin !== origin || element.attrs['data-lang']) continue;
      assert(!target.searchParams.has('lang'), `Use static language paths rather than query language links in ${location}.`);
      const targetCanonical = target.origin + target.pathname.replace(/index\.html$/, '');
      if (!expectedUrls.has(targetCanonical)) continue;
      assert(target.pathname.startsWith('/en/') === (language === 'en'), `Internal navigation changes language in ${location}: ${element.attrs.href}`);
    }
    checkStructuredData(document, file, language, slug, pageCopy, businessPages, fileSet);
  }

  const sitemap = await readFile(path.join(site, 'sitemap.xml'), 'utf8');
  const sitemapUrls = [...sitemap.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].map(match => decode(match[1].trim()));
  assert(sitemapUrls.length === expectedUrls.size && new Set(sitemapUrls).size === expectedUrls.size && sitemapUrls.every(url => expectedUrls.has(url)), 'sitemap.xml must list exactly the eight canonical Korean and English URLs, excluding the error page.');
  const robots = await readFile(path.join(site, 'robots.txt'), 'utf8');
  assert(/^User-agent:\s*\*\s*$/im.test(robots), 'robots.txt must define the default crawler group.');
  assert(!/^Disallow:\s*\//im.test(robots), 'robots.txt must allow the public pages and rendering assets.');
  assert(/^Sitemap:\s*https:\/\/hy3d\.kr\/sitemap\.xml\s*$/im.test(robots), 'robots.txt must announce the canonical sitemap.');
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
