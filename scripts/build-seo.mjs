import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { copy } from '../docs/content.js';
import { businessPages } from '../docs/business-content.js';

const origin = 'https://hy3d.kr';
const docs = new URL('../docs/', import.meta.url);
const slugs = Object.keys(businessPages);
const paths = ['/', ...slugs.map(slug => `/business/${slug}/`)];
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const localizedPath = (pathname, language) => language === 'en' ? `/en${pathname}` : pathname;
const brandId = slug => `${origin}/#brand-${slug}`;
const reference = id => ({ '@id': id });
const organizationId = `${origin}/#organization`;
const websiteId = `${origin}/#website`;
const assetUrl = name => `${origin}/assets/${name.replace(/^assets\//, '')}`;

function localize(html, text, language, pathname) {
  html = html.replace(/<html lang="[^"]*"/, `<html lang="${language}"`);
  html = html.replace(/(<([a-z\d]+)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>)[^<]*(<\/\2>)/g, (_, open, tag, key, close) => {
    if (!(key in text)) throw new Error(`Missing ${language} copy: ${key}`);
    return open + escape(text[key]) + close;
  });
  html = html.replace(/<[^>]+data-i18n-(alt|aria)="[^"]+"[^>]*>/g, tag => {
    const [, kind, key] = tag.match(/data-i18n-(alt|aria)="([^"]+)"/);
    if (!(key in text)) throw new Error(`Missing ${language} accessible copy: ${key}`);
    const attribute = kind === 'alt' ? 'alt' : 'aria-label';
    return tag.replace(new RegExp(`\\b${attribute}="[^"]*"`), `${attribute}="${escape(text[key])}"`);
  });
  // Resolve assets from the Korean source and keep navigation inside the selected language.
  html = html.replace(/\b(href|src)="([^"]+)"/g, (whole, attribute, value) => {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value)) return whole;
    const target = new URL(value.replaceAll('&amp;', '&'), origin + pathname);
    if (attribute === 'href' && paths.includes(target.pathname)) target.pathname = localizedPath(target.pathname, language);
    return `${attribute}="${escape(target.pathname + target.search + target.hash)}"`;
  });
  html = html.replace(/<a\b[^>]*data-lang="(ko|en)"[^>]*>/g, (tag, targetLanguage) => {
    tag = tag.replace(/\s(?:aria-current|aria-pressed)="[^"]*"/g, '');
    tag = tag.replace(/href="[^"]*"/, `href="${localizedPath(pathname, targetLanguage)}"`);
    return targetLanguage === language ? tag.replace(/>$/, ' aria-current="page">') : tag;
  });
  return html;
}

function structuredData(language, pathname, slug, text) {
  const url = origin + localizedPath(pathname, language);
  const common = copy[language];
  const graph = [
    {
      '@type': 'Organization', '@id': organizationId,
      name: 'HY3D', legalName: common.footerCompany,
      alternateName: language === 'ko' ? '하이쓰리디' : 'HY3D Co., Ltd.',
      url: `${origin}/`, logo: `${origin}/assets/favicon.png`,
      description: slug ? common.footerTagline : common.aboutBody,
      address: {
        '@type': 'PostalAddress', addressCountry: 'KR',
        addressRegion: language === 'ko' ? '경기도' : 'Gyeonggi-do',
        addressLocality: language === 'ko' ? '안산시 상록구' : 'Sangnok-gu, Ansan-si',
        streetAddress: language === 'ko' ? '한양대학로 55, 창업보육센터 204호' : 'Room 204, Business Incubation Center, 55 Hanyangdaehak-ro',
      },
    },
    {
      '@type': 'WebSite', '@id': websiteId, url: `${origin}/`, name: 'HY3D',
      alternateName: language === 'ko' ? '하이쓰리디' : 'HY3D Co., Ltd.',
      inLanguage: ['ko', 'en'], publisher: reference(organizationId),
    },
    ...slugs.map(key => {
      const brand = businessPages[key];
      return {
        '@type': 'Brand', '@id': brandId(key), name: brand.copy[language].detailBrandLabel,
        url: brand.metadata.website,
        logo: assetUrl(brand.metadata.logo.replace('-light.png', '.png')),
      };
    }),
    {
      '@type': 'WebPage', '@id': `${url}#webpage`, url, name: text.pageTitle,
      description: text.metaDescription, inLanguage: language,
      isPartOf: reference(websiteId),
      about: slug ? reference(brandId(slug)) : [reference(organizationId), ...slugs.map(key => reference(brandId(key)))],
      mainEntity: reference(slug ? `${url}#service` : organizationId),
    },
  ];
  if (slug) {
    const { metadata } = businessPages[slug];
    graph.push({
      '@type': 'Service', '@id': `${url}#service`, url,
      name: text.detailBrandLabel, serviceType: text.detailEyebrow,
      description: text.detailIntro, brand: reference(brandId(slug)),
      availableChannel: {
        '@type': 'ServiceChannel', serviceUrl: metadata.website,
        servicePhone: { '@type': 'ContactPoint', telephone: metadata.phoneHref.replace('tel:', ''), email: metadata.email },
      },
      hasOfferCatalog: {
        '@type': 'OfferCatalog', name: text.detailServiceTitle,
        itemListElement: [1, 2, 3].map(index => ({
          '@type': 'Offer', itemOffered: {
            '@type': 'Service', name: text[`detailService${index}Title`], description: text[`detailService${index}Body`],
          },
        })),
      },
    });
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}

function seoHead(language, pathname, slug, text) {
  const canonical = origin + localizedPath(pathname, language);
  const image = assetUrl(slug ? businessPages[slug].metadata.image : 'hero.webp');
  const imageAlt = slug ? text[`${{ manufacturing: 'make', education: 'learn', ai: 'share' }[slug]}Alt`] : text.footerTagline;
  const meta = (attribute, name, value) => `  <meta ${attribute}="${name}" content="${escape(value)}">`;
  return [
    '  <!-- SEO: generated by scripts/build-seo.mjs -->',
    `  <title>${escape(text.pageTitle)}</title>`,
    meta('name', 'description', text.metaDescription),
    meta('name', 'robots', 'index, follow, max-image-preview:large'),
    `  <link rel="canonical" href="${canonical}">`,
    ...['ko', 'en', 'x-default'].map(lang => `  <link rel="alternate" hreflang="${lang}" href="${origin + localizedPath(pathname, lang === 'en' ? 'en' : 'ko')}">`),
    meta('property', 'og:type', 'website'), meta('property', 'og:site_name', 'HY3D'),
    meta('property', 'og:title', text.pageTitle), meta('property', 'og:description', text.metaDescription),
    meta('property', 'og:url', canonical), meta('property', 'og:locale', language === 'ko' ? 'ko_KR' : 'en_US'),
    meta('property', 'og:locale:alternate', language === 'ko' ? 'en_US' : 'ko_KR'),
    meta('property', 'og:image', image), meta('property', 'og:image:type', 'image/webp'),
    meta('property', 'og:image:width', slug ? '1600' : '2400'), meta('property', 'og:image:height', slug ? '900' : '1350'),
    meta('property', 'og:image:alt', imageAlt),
    meta('name', 'twitter:card', 'summary_large_image'), meta('name', 'twitter:title', text.pageTitle),
    meta('name', 'twitter:description', text.metaDescription), meta('name', 'twitter:image', image), meta('name', 'twitter:image:alt', imageAlt),
    '  <script type="application/ld+json" id="structured-data">',
    JSON.stringify(structuredData(language, pathname, slug, text), null, 2).replaceAll('<', '\\u003c'),
    '  </script>',
    '  <!-- /SEO -->',
  ].join('\n');
}

for (const pathname of paths) {
  const slug = pathname.split('/')[2];
  const original = await readFile(new URL(`.${pathname}index.html`, docs), 'utf8');
  const source = original
    .replace(/\s*<!-- SEO: generated[\s\S]*?<!-- \/SEO -->/g, '')
    .replace(/\s*<title>[^<]*<\/title>/g, '')
    .replace(/\s*<meta (?:name="(?:description|robots|twitter:[^"]+)"|property="og:[^"]+")[^>]*>/g, '')
    .replace(/\s*<link rel="(?:canonical|alternate)"[^>]*>/g, '');
  for (const language of ['ko', 'en']) {
    const text = { ...copy[language], ...businessPages[slug]?.copy[language] };
    let html = localize(source, text, language, pathname);
    html = html.replace('</head>', `${seoHead(language, pathname, slug, text)}\n</head>`);
    const directory = new URL(`.${localizedPath(pathname, language)}`, docs);
    await mkdir(directory, { recursive: true });
    await writeFile(new URL('index.html', directory), html.replace(/\r\n?/g, '\n'));
  }
}

const urls = paths.flatMap(pathname => ['ko', 'en'].map(language => origin + localizedPath(pathname, language)));
await writeFile(new URL('sitemap.xml', docs), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url => `  <url><loc>${url}</loc></url>`).join('\n')}\n</urlset>\n`);
await writeFile(new URL('robots.txt', docs), `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`);
console.log(`Generated ${urls.length} localized pages with canonical URLs, hreflang, structured data and sitemap.`);
