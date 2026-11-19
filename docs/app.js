import { copy } from './content.js';

const root = document.documentElement;
root.classList.replace('no-js', 'js');
const header = document.querySelector('#site-header');
const menu = document.querySelector('#main-nav');
const menuToggle = document.querySelector('#menu-toggle');
const languageButtons = [...document.querySelectorAll('[data-lang]')];
const tabs = [...document.querySelectorAll('[role="tab"]')];
let language = 'ko';

function setMenu(open) {
  menu.classList.toggle('is-open', open);
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', copy[language][open ? 'menuClose' : 'menuOpen']);
}

function setLanguage(next, updateUrl = true) {
  language = next === 'en' ? 'en' : 'ko';
  const text = copy[language];
  root.lang = language;
  document.title = text.pageTitle;
  document.querySelector('meta[name="description"]').content = text.metaDescription;
  document.querySelector('meta[property="og:description"]').content = text.metaDescription;
  document.querySelector('meta[property="og:locale"]').content = language === 'en' ? 'en_US' : 'ko_KR';
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
  try { localStorage.setItem('hy3d-language', language); } catch { /* The site works without storage. */ }
  if (updateUrl && /^https?:$/.test(location.protocol)) {
    const url = new URL(location.href);
    if (language === 'en') url.searchParams.set('lang', 'en');
    else url.searchParams.delete('lang');
    history.replaceState(null, '', url);
  }
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

languageButtons.forEach(button => button.addEventListener('click', () => setLanguage(button.dataset.lang)));
menuToggle.addEventListener('click', () => setMenu(menuToggle.getAttribute('aria-expanded') !== 'true'));
menu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMenu(false)));
document.addEventListener('click', event => { if (!header.contains(event.target)) setMenu(false); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') { setMenu(false); menuToggle.focus(); }
});
matchMedia('(min-width: 761px)').addEventListener('change', event => { if (event.matches) setMenu(false); });

function updateHeader() { header.classList.toggle('is-fixed', window.scrollY > 70); }
window.addEventListener('scroll', updateHeader, { passive: true });
window.addEventListener('popstate', () => setLanguage(new URLSearchParams(location.search).get('lang') || 'ko', false));
let preferred = 'ko';
try { preferred = localStorage.getItem('hy3d-language') || 'ko'; } catch { /* Default to Korean. */ }
setLanguage(new URLSearchParams(location.search).get('lang') || preferred);
document.querySelector('#year').textContent = new Date().getFullYear();
updateHeader();
