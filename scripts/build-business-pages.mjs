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
  return page.metadata.image.split(/[\\/]/).at(-1);
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
  const brandKey = brandKeys[slug];
  const brand = `${brandKey}Name`;
  const image = imageName(page);
  const canonical = `${origin}/business/${slug}/`;
  const services = [1, 2, 3].map(index => `
          <article class="detail-service">
            <h3 data-i18n="detailService${index}Title">${t(`detailService${index}Title`)}</h3>
            <p data-i18n="detailService${index}Body">${t(`detailService${index}Body`)}</p>
          </article>`).join('');
  const process = [1, 2, 3].map(index => `
          <li>
            <h3 data-i18n="detailProcess${index}Title">${t(`detailProcess${index}Title`)}</h3>
            <p data-i18n="detailProcess${index}Body">${t(`detailProcess${index}Body`)}</p>
          </li>`).join('');
  const related = slugs.filter(item => item !== slug).map(item => {
    const key = brandKeys[item];
    return `
          <a class="detail-related-link" href="../${item}/">
            <img src="../../assets/${escape(imageName(businessPages[item]))}" alt="" width="1600" height="900" loading="lazy">
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
  <link rel="preload" href="../../assets/${escape(image)}" as="image" fetchpriority="high">
  <link rel="stylesheet" href="../../styles.css">
  <link rel="stylesheet" href="../../business.css">
  <script type="module" src="../../app.js"></script>
</head>
<body data-business="${slug}">
  <a class="skip-link" href="#main" data-i18n="skipLink">${t('skipLink')}</a>
  ${sharedMarkup('header', slug)}

  <main id="main">
    <section class="detail-hero" id="home" aria-labelledby="detail-title">
      <img class="detail-hero-image" src="../../assets/${escape(image)}" alt="${t(`${brandKey}Alt`)}" data-i18n-alt="${brandKey}Alt" width="1600" height="900" fetchpriority="high">
      <div class="detail-hero-shade"></div>
      <div class="detail-hero-content page-width">
        <p class="eyebrow light" data-i18n="detailEyebrow">${t('detailEyebrow')}</p>
        <h1 id="detail-title" data-i18n="detailTitle">${t('detailTitle')}</h1>
        <p class="detail-hero-intro" data-i18n="detailIntro">${t('detailIntro')}</p>
        <a class="button button-light" href="#services" data-i18n="detailServicesTitle">${t('detailServicesTitle')}</a>
      </div>
      <div class="detail-brand-line page-width"><span data-i18n="${brand}">${t(brand)}</span><span lang="en">ANYONE CAN MAKE IT.</span></div>
    </section>

    <section class="detail-overview section-space page-width" aria-labelledby="overview-title">
      <h2 id="overview-title" data-i18n="detailOverviewTitle">${t('detailOverviewTitle')}</h2>
      <p data-i18n="detailOverviewBody">${t('detailOverviewBody')}</p>
    </section>

    <section class="detail-services section-space" id="services" aria-labelledby="services-title">
      <div class="page-width">
        <h2 id="services-title" data-i18n="detailServicesTitle">${t('detailServicesTitle')}</h2>
        <div class="detail-service-grid">${services}
        </div>
      </div>
    </section>

    <section class="detail-process section-space" aria-labelledby="process-title">
      <div class="page-width">
        <h2 id="process-title" data-i18n="detailProcessTitle">${t('detailProcessTitle')}</h2>
        <ol class="detail-process-list">${process}
        </ol>
      </div>
    </section>

    <section class="detail-audience section-space page-width" aria-labelledby="audience-title">
      <h2 id="audience-title" data-i18n="detailAudienceTitle">${t('detailAudienceTitle')}</h2>
      <p data-i18n="detailAudienceBody">${t('detailAudienceBody')}</p>
    </section>

    <section class="detail-contact section-space" id="contact" aria-labelledby="contact-title">
      <div class="page-width detail-contact-grid">
        <div><h2 id="contact-title" data-i18n="detailContactTitle">${t('detailContactTitle')}</h2><p class="detail-contact-body" data-i18n="detailContactBody">${t('detailContactBody')}</p></div>
        <div class="detail-contact-info">
          <h3 data-i18n="${brand}">${t(brand)}</h3>
          <span class="email-address">${escape(email)}</span>
          <a class="phone-link" href="${escape(phoneHref)}">${escape(phone)}</a>
          <a class="button button-dark" href="${escape(website)}" target="_blank" rel="noopener noreferrer" data-i18n="detailWebsiteLabel">${t('detailWebsiteLabel')}</a>
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
  await writeFile(new URL('index.html', directory), renderPage(slug), 'utf8');
}

const urls = [`${origin}/`, ...slugs.map(slug => `${origin}/business/${slug}/`)];
await writeFile(`${docs}sitemap.xml`, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url => `  <url><loc>${url}</loc></url>`).join('\n')}\n</urlset>\n`, 'utf8');
console.log(`Generated ${slugs.length} business pages and sitemap.xml.`);
