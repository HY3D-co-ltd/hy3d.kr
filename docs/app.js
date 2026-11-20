import { copy as baseCopy } from './content.js?v=8dd5edcbf5c0';
import { businessPages } from './business-content.js?v=b25320feb129';

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
const languageLinks = [...document.querySelectorAll('a[data-lang]')];
const tabs = [...document.querySelectorAll('[role="tab"]')];
const language = /^\/en(?:\/|$)/.test(location.pathname) || root.lang === 'en' ? 'en' : 'ko';

function localizedPath(pathname, nextLanguage) {
  const pagePath = (pathname.replace(/^\/en(?=\/|$)/, '') || '/').replace(/\/index\.html$/, '/');
  return nextLanguage === 'en' ? '/en' + pagePath : pagePath;
}

function redirectLegacyLanguage() {
  if (!/^https?:$/.test(location.protocol)) return;
  const url = new URL(location.href);
  const requestedLanguage = url.searchParams.get('lang');
  if (requestedLanguage !== 'ko' && requestedLanguage !== 'en') return;
  url.pathname = localizedPath(url.pathname, requestedLanguage);
  url.searchParams.delete('lang');
  location.replace(url.pathname + url.search + url.hash);
}

function updateLanguageLinks() {
  for (const link of languageLinks) {
    if (link.dataset.lang === language) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
    if (!/^https?:$/.test(location.protocol)) continue;
    const target = new URL(link.getAttribute('href'), location.href);
    target.search = location.search;
    target.searchParams.delete('lang');
    target.hash = location.hash;
    link.setAttribute('href', target.pathname + target.search + target.hash);
  }
}

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
window.addEventListener('hashchange', updateLanguageLinks);
window.addEventListener('popstate', updateLanguageLinks);
redirectLegacyLanguage();
updateLanguageLinks();
menuToggle.setAttribute('aria-label', copy[language].menuOpen);
businessToggle.setAttribute('aria-label', copy[language].businessMenuOpen);
document.querySelector('#year').textContent = new Date().getFullYear();
updateHeader();
