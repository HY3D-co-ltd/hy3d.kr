import { copy as baseCopy } from './content.js?v=2ec14f356048';
import { businessPages } from './business-content.js?v=c4e9ced8697c';

const pageCopy = businessPages[document.body.dataset.business]?.copy;
const copy = {
  ko: { ...baseCopy.ko, ...pageCopy?.ko },
  en: { ...baseCopy.en, ...pageCopy?.en },
};
const root = document.documentElement;
root.classList.replace('no-js', 'js');
const header = document.querySelector('#site-header');
const menu = document.querySelector('#main-nav');
const menuToggle = document.querySelector('#menu-toggle');
const businessNavigation = document.querySelector('.nav-businesses');
const businessToggle = document.querySelector('#business-menu-toggle');
const businessSubmenu = document.querySelector('#business-submenu');
const businessLinks = [...businessSubmenu.querySelectorAll('a')];
const languageButtons = [...document.querySelectorAll('[data-lang]')];
const tabs = [...document.querySelectorAll('[role="tab"]')];
const navigationLinks = [...document.querySelectorAll('a[href]')].map(link => ({ link, originalHref: link.getAttribute('href') }));
let language = 'ko';

function setBusinessMenu(open, focusIndex) {
  businessSubmenu.hidden = !open;
  businessNavigation.classList.toggle('is-expanded', open);
  businessToggle.setAttribute('aria-expanded', String(open));
  businessToggle.setAttribute('aria-label', copy[language][open ? 'businessMenuClose' : 'businessMenuOpen']);
  if (open && focusIndex !== undefined) businessLinks[focusIndex]?.focus();
}

function setMenu(open) {
  menu.classList.toggle('is-open', open);
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', copy[language][open ? 'menuClose' : 'menuOpen']);
  if (!open) setBusinessMenu(false);
}

function updateInternalLinks() {
  if (!/^https?:$/.test(location.protocol)) return;
  for (const { link, originalHref } of navigationLinks) {
    const target = new URL(originalHref, location.href);
    if (target.origin !== location.origin || !/^https?:$/.test(target.protocol)) continue;
    if (language === 'en') target.searchParams.set('lang', 'en');
    else target.searchParams.delete('lang');
    if (originalHref.startsWith('#')) link.setAttribute('href', originalHref);
    else link.setAttribute('href', target.pathname + target.search + target.hash);
  }
}

function setLanguage(next, updateUrl = true) {
  language = next === 'en' ? 'en' : 'ko';
  const text = copy[language];
  root.lang = language;
  document.title = text.pageTitle;
  for (const [selector, value] of [
    ['meta[name="description"]', text.metaDescription],
    ['meta[property="og:title"]', text.pageTitle],
    ['meta[property="og:description"]', text.metaDescription],
    ['meta[property="og:locale"]', language === 'en' ? 'en_US' : 'ko_KR'],
  ]) {
    const meta = document.querySelector(selector);
    if (meta) meta.content = value;
  }
  for (const node of document.querySelectorAll('[data-i18n]')) {
    if (text[node.dataset.i18n] !== undefined) node.textContent = text[node.dataset.i18n];
  }
  for (const node of document.querySelectorAll('[data-i18n-alt]')) {
    if (text[node.dataset.i18nAlt] !== undefined) node.alt = text[node.dataset.i18nAlt];
  }
  for (const node of document.querySelectorAll('[data-i18n-aria]')) {
    if (text[node.dataset.i18nAria] !== undefined) node.setAttribute('aria-label', text[node.dataset.i18nAria]);
  }
  languageButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.lang === language)));
  menuToggle.setAttribute('aria-label', text[menuToggle.getAttribute('aria-expanded') === 'true' ? 'menuClose' : 'menuOpen']);
  businessToggle.setAttribute('aria-label', text[businessToggle.getAttribute('aria-expanded') === 'true' ? 'businessMenuClose' : 'businessMenuOpen']);
  try { localStorage.setItem('hy3d-language', language); } catch { /* The site works without storage. */ }
  if (updateUrl && /^https?:$/.test(location.protocol)) {
    const url = new URL(location.href);
    if (language === 'en') url.searchParams.set('lang', 'en');
    else url.searchParams.delete('lang');
    history.replaceState(null, '', url);
  }
  updateInternalLinks();
}

function activateBusiness(tab, focus = false) {
  tabs.forEach(item => {
    const active = item === tab;
    item.setAttribute('aria-selected', String(active));
    item.tabIndex = active ? 0 : -1;
    document.getElementById(item.getAttribute('aria-controls')).hidden = !active;
  });
  if (focus) tab.focus();
}

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => activateBusiness(tab));
  tab.addEventListener('keydown', event => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    if (next !== undefined) { event.preventDefault(); activateBusiness(tabs[next], true); }
  });
});

businessToggle.addEventListener('click', () => setBusinessMenu(businessToggle.getAttribute('aria-expanded') !== 'true'));
businessNavigation.querySelector('.nav-business-heading').addEventListener('keydown', event => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    setBusinessMenu(true, event.key === 'ArrowDown' ? 0 : businessLinks.length - 1);
  }
});
businessLinks.forEach((link, index) => {
  if (link.dataset.businessLink === document.body.dataset.business) link.setAttribute('aria-current', 'page');
  link.addEventListener('keydown', event => {
    let next;
    if (event.key === 'ArrowDown') next = (index + 1) % businessLinks.length;
    else if (event.key === 'ArrowUp') next = (index + businessLinks.length - 1) % businessLinks.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = businessLinks.length - 1;
    if (next !== undefined) { event.preventDefault(); businessLinks[next].focus(); }
  });
});
businessNavigation.addEventListener('focusout', event => {
  if (!businessNavigation.contains(event.relatedTarget)) setBusinessMenu(false);
});

languageButtons.forEach(button => button.addEventListener('click', () => setLanguage(button.dataset.lang)));
menuToggle.addEventListener('click', () => setMenu(menuToggle.getAttribute('aria-expanded') !== 'true'));
menu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMenu(false)));
document.addEventListener('click', event => {
  if (!businessNavigation.contains(event.target)) setBusinessMenu(false);
  if (!header.contains(event.target)) setMenu(false);
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (businessToggle.getAttribute('aria-expanded') === 'true') {
    event.preventDefault();
    setBusinessMenu(false);
    businessToggle.focus();
  } else if (menuToggle.getAttribute('aria-expanded') === 'true') {
    event.preventDefault();
    setMenu(false);
    menuToggle.focus();
  }
});
matchMedia('(min-width: 761px)').addEventListener('change', () => setMenu(false));

function updateHeader() { header.classList.toggle('is-fixed', window.scrollY > 70); }
window.addEventListener('scroll', updateHeader, { passive: true });
window.addEventListener('popstate', () => setLanguage(new URLSearchParams(location.search).get('lang') || 'ko', false));
let preferred = 'ko';
try { preferred = localStorage.getItem('hy3d-language') || 'ko'; } catch { /* Default to Korean. */ }
setLanguage(new URLSearchParams(location.search).get('lang') || preferred);
document.querySelector('#year').textContent = new Date().getFullYear();
updateHeader();
