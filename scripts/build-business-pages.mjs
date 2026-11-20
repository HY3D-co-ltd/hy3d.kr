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
  const { website, email, phone, phoneHref, gallery = [], workflow = [], galleryLayout = 'landscape' } = page.metadata;
  if (!gallery.length) throw new Error(`${slug}: approved gallery images are required.`);
  const brandKey = brandKeys[slug];
  const brand = `${brandKey}Name`;
  const image = imageName(page);
  const canonical = `${origin}/business/${slug}/`;
  const asset = name => `../../assets/${escape(name.replaceAll('\\', '/').replace(/^assets\//, ''))}`;
  const mediaCard = (media, screen = false) => `
          <figure class="detail-media-card${screen ? ' detail-screen-card' : ''}">
            <div class="detail-media-frame"><img src="${asset(media.image)}" alt="${t(media.altKey)}" data-i18n-alt="${escape(media.altKey)}" width="${media.width}" height="${media.height}" loading="lazy" decoding="async"></div>
            <figcaption><h3 data-i18n="${escape(media.titleKey)}">${t(media.titleKey)}</h3><p data-i18n="${escape(media.captionKey)}">${t(media.captionKey)}</p></figcaption>
          </figure>`;
  const capabilities = [1, 2, 3].map(index => `<li data-i18n="detailService${index}Title">${t(`detailService${index}Title`)}</li>`).join('');
  const screenGallery = galleryLayout === 'screens';
  const galleryMarkup = gallery.map(media => mediaCard(media, screenGallery)).join('');
  const galleryHint = screenGallery && text.detailGalleryHint ? `<p class="detail-gallery-hint" data-i18n="detailGalleryHint">${t('detailGalleryHint')}</p>` : '';
  const heroVisual = screenGallery
    ? `<div class="detail-product-preview">${gallery.slice(0, 2).map((media, index) => `<div class="detail-product-screen"><img src="${asset(media.image)}" alt="${t(media.altKey)}" data-i18n-alt="${escape(media.altKey)}" width="${media.width}" height="${media.height}" ${index ? 'loading="lazy"' : 'fetchpriority="high"'}></div>`).join('')}</div>`
    : `<div class="detail-hero-media"><img src="../../assets/${escape(image)}" alt="${t('detailHeroAlt')}" data-i18n-alt="detailHeroAlt" width="${page.metadata.imageWidth || 1600}" height="${page.metadata.imageHeight || 900}" fetchpriority="high"></div>`;
  const workflowMarkup = workflow.length ? `
    <section class="detail-visual-workflow section-space" aria-labelledby="process-title">
      <div class="page-width">
        <div class="detail-section-heading"><h2 id="process-title" data-i18n="detailProcessTitle">${t('detailProcessTitle')}</h2><p data-i18n="detailProcessIntro">${t('detailProcessIntro')}</p></div>
        <div class="detail-workflow-grid detail-workflow-grid-${Math.min(workflow.length, 4)}">${workflow.map(media => mediaCard(media)).join('')}
        </div>
      </div>
    </section>` : '';
  const related = slugs.filter(item => item !== slug).map(item => {
    const key = brandKeys[item];
    const relatedImage = businessPages[item].metadata;
    return `
          <a class="detail-related-link" href="../${item}/">
            <img src="../../assets/${escape(imageName(businessPages[item]))}" alt="" width="${relatedImage.imageWidth || 1600}" height="${relatedImage.imageHeight || 900}" loading="lazy">
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
    <section class="detail-hero${screenGallery ? ' detail-hero-product' : ''}" id="home" aria-labelledby="detail-title">
      <div class="detail-hero-content page-width">
        <p class="eyebrow light" data-i18n="detailEyebrow">${t('detailEyebrow')}</p>
        <h1 id="detail-title" data-i18n="detailTitle">${t('detailTitle')}</h1>
        <p class="detail-hero-intro" data-i18n="detailIntro">${t('detailIntro')}</p>
        <a class="button button-light" href="#services" data-i18n="detailGalleryTitle">${t('detailGalleryTitle')}</a>
      </div>
      ${heroVisual}
      <div class="detail-brand-line page-width"><span data-i18n="${brand}">${t(brand)}</span><span lang="en">ANYONE CAN MAKE IT.</span></div>
    </section>

    <section class="detail-gallery section-space" id="services" aria-labelledby="gallery-title">
      <div class="page-width">
        <div class="detail-section-heading"><h2 id="gallery-title" data-i18n="detailGalleryTitle">${t('detailGalleryTitle')}</h2><p data-i18n="detailGalleryIntro">${t('detailGalleryIntro')}</p></div>
        <ul class="detail-capabilities" aria-label="${t('detailServicesTitle')}" data-i18n-aria="detailServicesTitle">${capabilities}</ul>
        ${galleryHint}
        <div class="${screenGallery ? 'detail-gallery-screens' : `detail-gallery-grid detail-gallery-grid-${Math.min(gallery.length, 3)}`}"${screenGallery ? ` role="region" tabindex="0" aria-label="${t('detailGalleryTitle')}" data-i18n-aria="detailGalleryTitle"` : ''}>${galleryMarkup}
        </div>
      </div>
    </section>

    ${workflowMarkup}

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
  await writeFile(new URL('index.html', directory), renderPage(slug).replace(/[\t ]+$/gm, ''), 'utf8');
}

const urls = [`${origin}/`, ...slugs.map(slug => `${origin}/business/${slug}/`)];
await writeFile(`${docs}sitemap.xml`, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url => `  <url><loc>${url}</loc></url>`).join('\n')}\n</urlset>\n`, 'utf8');
console.log(`Generated ${slugs.length} business pages and sitemap.xml.`);
