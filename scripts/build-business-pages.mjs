import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { businessPages } from '../docs/business-content.js';
import { copy } from '../docs/content.js';

const docs = fileURLToPath(new URL('../docs/', import.meta.url));
const home = await readFile(new URL('../docs/index.html', import.meta.url), 'utf8');
const origin = 'https://hy3d.kr';
const slugs = ['manufacturing', 'education', 'ai'];
const brandKeys = { manufacturing: 'make', education: 'learn', ai: 'share' };

function escape(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function sharedMarkup(tag, slug) {
  const found = home.match(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`));
  if (!found) throw new Error(`Homepage is missing its shared ${tag}.`);
  let markup = found[0].replace(/\b(href|src)="([^"]+)"/g, (whole, attribute, value) => {
    if (/^(?:https?:|tel:|mailto:|\/\/)/.test(value)) return whole;
    return `${attribute}="../../${value}"`;
  });
  markup = markup.replace(`href="../../business/${slug}/"`, `href="../../business/${slug}/" aria-current="page"`);
  if (tag === 'footer') markup = markup.replace('class="back-top" href="../../#home"', 'class="back-top" href="#home"');
  return markup;
}

function imageName(page) {
  return page.metadata.image.replaceAll('\\', '/').replace(/^assets\//, '');
}

function renderPage(slug) {
  const page = businessPages[slug];
  if (!page?.metadata || !page.copy?.ko || !page.copy?.en) throw new Error(`Missing detail content: ${slug}`);
  const text = { ...copy.ko, ...page.copy.ko };
  const enKeys = Object.keys(page.copy.en);
  for (const key of Object.keys(page.copy.ko)) {
    if (!enKeys.includes(key)) throw new Error(`${slug}: English translation missing for ${key}`);
  }
  const t = key => {
    if (typeof text[key] !== 'string') throw new Error(`${slug}: missing copy key ${key}`);
    return escape(text[key]);
  };
  const { website, email, phone, phoneHref } = page.metadata;
  const image = imageName(page);
  const canonical = `${origin}/business/${slug}/`;
  const asset = name => `../../assets/${escape(name.replaceAll('\\', '/').replace(/^assets\//, ''))}`;
  const logoMarkup = () => {
    const { logo, logoWidth, logoHeight } = page.metadata;
    if (!logo || !Number.isInteger(logoWidth) || logoWidth <= 0 || !Number.isInteger(logoHeight) || logoHeight <= 0) {
      throw new Error(`${slug}: an approved brand logo and its dimensions are required.`);
    }
    return `<div class="detail-logo"><img src="${asset(logo)}" alt="${t('detailBrandLabel')}" data-i18n-alt="detailBrandLabel" width="${logoWidth}" height="${logoHeight}">${slug === 'ai' ? '<span lang="en" aria-hidden="true">Makit</span>' : ''}</div>`;
  };
  const principles = [1, 2, 3].map(index => `
              <div class="detail-principle"><h3 data-i18n="detailPrinciple${index}Title">${t(`detailPrinciple${index}Title`)}</h3><p data-i18n="detailPrinciple${index}Body">${t(`detailPrinciple${index}Body`)}</p></div>`).join('');
  const principleMarkup = slug === 'manufacturing' ? '' : `<div class="detail-principles" aria-label="${t('detailPrincipleLabel')}" data-i18n-aria="detailPrincipleLabel"><div class="detail-principle-grid">${principles}</div></div>`;
  const serviceSymbols = [
    '<path d="m32 5 25 14v28L32 61 7 47V19zM7 19l25 15 25-15M32 34v27"/><path d="M32 5v29L7 47m25-13 25 13" opacity=".3" stroke-dasharray="3 4"/>',
    '<path d="m32 5 25 14-25 15L7 19z" fill="currentColor" fill-opacity=".16"/><path d="m7 19 25 15v27L7 47z" fill="currentColor" fill-opacity=".06"/><path d="m32 34 25-15v28L32 61z" fill="currentColor" fill-opacity=".3"/><path d="m32 5 25 14v28L32 61 7 47V19zM7 19l25 15 25-15M32 34v27"/>',
    '<path d="m32 4 18 10-18 11-18-11zM14 14v15l18 11 18-11V14M32 25v15M12 29l18 10-18 11L-6 39zM-6 39v15l18 11 18-11V39M12 50v15M52 29l18 10-18 11-18-11zM34 39v15l18 11 18-11V39M52 50v15" transform="translate(6 0) scale(.82)"/>',
  ];
  const serviceSymbol = index => slug === 'manufacturing' ? `<svg class="detail-service-symbol" viewBox="0 0 64 68" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true">${serviceSymbols[index - 1]}</svg>` : '';
  const services = [1, 2, 3].map(index => `
          <article class="detail-service">${serviceSymbol(index)}<h3 data-i18n="detailService${index}Title">${t(`detailService${index}Title`)}</h3><p data-i18n="detailService${index}Body">${t(`detailService${index}Body`)}</p></article>`).join('');
  const related = slugs.filter(item => item !== slug).map(item => {
    const key = brandKeys[item];
    return `
          <a class="detail-related-link" href="../${item}/">
            <div><p data-i18n="${key}Category">${t(`${key}Category`)}</p><h3 data-i18n="${key}Name">${t(`${key}Name`)}</h3></div>
          </a>`;
  }).join('');
  return `<!doctype html>
<html lang="ko" class="no-js">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#0b1b2e">
  <meta name="description" content="${t('metaDescription')}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${t('pageTitle')}">
  <meta property="og:description" content="${t('metaDescription')}">
  <meta property="og:image" content="${origin}/assets/${escape(image)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:locale" content="ko_KR">
  <meta name="twitter:card" content="summary_large_image">
  <title>${t('pageTitle')}</title>
  <link rel="canonical" href="${canonical}">
  <link rel="icon" href="../../assets/favicon.ico" sizes="any">
  <link rel="stylesheet" href="../../styles.css">
  <link rel="stylesheet" href="../../business.css">
  <script type="module" src="../../app.js"></script>
</head>
<body data-business="${slug}">
  <a class="skip-link" href="#main" data-i18n="skipLink">${t('skipLink')}</a>
  ${sharedMarkup('header', slug)}

  <main id="main">
    <section class="detail-hero" id="home" aria-labelledby="detail-title">
      <div class="page-width detail-hero-layout">
        <div class="detail-hero-copy">
          ${logoMarkup()}
          <p class="detail-category" data-i18n="detailEyebrow">${t('detailEyebrow')}</p>
          <h1 id="detail-title" data-i18n="detailTitle">${t('detailTitle')}</h1>
          <p class="detail-hero-description" data-i18n="detailIntro">${t('detailIntro')}</p>
          <a class="detail-official-link" href="${escape(website)}" target="_blank" rel="noopener noreferrer" data-i18n="detailWebsiteLabel">${t('detailWebsiteLabel')}</a>
        </div>
        <div class="detail-concept"><img src="${asset(`concept-${slug}.svg`)}" alt="" width="720" height="640" fetchpriority="high">${text.detailConceptCaption ? `<p class="detail-concept-caption" data-i18n="detailConceptCaption">${t('detailConceptCaption')}</p>` : ''}</div>
      </div>
    </section>

    <section class="detail-purpose section-space" aria-labelledby="vision-title">
      <div class="page-width detail-purpose-layout${slug === 'manufacturing' ? ' detail-purpose-statement' : ''}">
        <div class="detail-vision">
          <div><p class="eyebrow light" data-i18n="detailVisionLabel">${t('detailVisionLabel')}</p><h2 id="vision-title" data-i18n="detailVisionTitle">${t('detailVisionTitle')}</h2></div>
          <p class="detail-vision-body" data-i18n="detailVisionBody">${t('detailVisionBody')}</p>
        </div>
        ${principleMarkup}
      </div>
    </section>

    <section class="detail-services section-space" id="services" aria-labelledby="services-title">
      <div class="page-width">
        <p class="eyebrow" data-i18n="detailServiceLabel">${t('detailServiceLabel')}</p>
        <h2 id="services-title" data-i18n="detailServiceTitle">${t('detailServiceTitle')}</h2>
        <div class="detail-service-grid">${services}
        </div>
      </div>
    </section>

    <section class="detail-contact section-space" id="contact" aria-labelledby="contact-title">
      <div class="page-width detail-contact-grid">
        <div><h2 id="contact-title" data-i18n="detailContactTitle">${t('detailContactTitle')}</h2><p class="detail-contact-body" data-i18n="detailContactBody">${t('detailContactBody')}</p></div>
        <div class="detail-contact-info">
          <span class="email-address">${escape(email)}</span>
          <a class="phone-link" href="${escape(phoneHref)}">${escape(phone)}</a>
        </div>
      </div>
    </section>

    <section class="detail-related section-space page-width" aria-labelledby="related-title">
      <h2 id="related-title" data-i18n="detailRelatedTitle">${t('detailRelatedTitle')}</h2>
      <div class="detail-related-grid">${related}
      </div>
    </section>
  </main>

  ${sharedMarkup('footer', slug)}
</body>
</html>
`;
}

for (const slug of slugs) {
  const directory = new URL(`../docs/business/${slug}/`, import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL('index.html', directory), renderPage(slug).replace(/[\t ]+$/gm, ''), 'utf8');
}

const urls = [`${origin}/`, ...slugs.map(slug => `${origin}/business/${slug}/`)];
await writeFile(`${docs}sitemap.xml`, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url => `  <url><loc>${url}</loc></url>`).join('\n')}\n</urlset>\n`, 'utf8');
console.log(`Generated ${slugs.length} business pages and sitemap.xml.`);
