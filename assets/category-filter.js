/* assets/category-filter.js
   SINGLE-SELECT category/need filtering with drag protection.
   Works for BOTH the slider cards (.cat-card) and the shop-by-need pills
   (.sbn__pill). Both carry data-filter-tag (the product tag / filter value).
   Click a tag -> replace the filter (single-select). Click the active tag
   (or a Show-all card) -> clear. Needs a .shopall grid on the same page. */
(function () {
  'use strict';

  var PARAM = 'filter.p.m.custom.filter_group';
  var ACTIVE_BORDER = '#0E1F2A';
  var SELECTOR = '.cat-card[data-filter-tag], .sbn__pill[data-filter-tag]';
  var DRAG_THRESHOLD = 8;
  var pointerStart = null;
  var suppressClickUntil = 0;

  function getFilterEl(target) {
    return target && target.closest ? target.closest(SELECTOR) : null;
  }

  function hasGrid() { return !!document.querySelector('.shopall'); }

  function getTag(el) {
    return (el.getAttribute('data-filter-tag') || '').trim();
  }

  function removeAllFilters(url) {
    Array.from(url.searchParams.keys()).forEach(function (key) {
      if (key.indexOf('filter.') === 0 || key === 'page') {
        url.searchParams.delete(key);
      }
    });
  }

  /* ---------- DRAG DETECTION (so a Flickity drag isn't read as a click) ---------- */
  document.addEventListener('pointerdown', function (event) {
    var el = getFilterEl(event.target);
    if (!el) { pointerStart = null; return; }
    if (event.pointerType === 'mouse' && event.button !== 0) { pointerStart = null; return; }
    pointerStart = { x: event.clientX, y: event.clientY, dragged: false };
  }, true);

  document.addEventListener('pointermove', function (event) {
    if (!pointerStart) return;
    var dx = event.clientX - pointerStart.x;
    var dy = event.clientY - pointerStart.y;
    if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) pointerStart.dragged = true;
  }, true);

  document.addEventListener('pointerup', function () {
    if (pointerStart && pointerStart.dragged) suppressClickUntil = Date.now() + 350;
    pointerStart = null;
  }, true);

  document.addEventListener('pointercancel', function () {
    if (pointerStart && pointerStart.dragged) suppressClickUntil = Date.now() + 350;
    pointerStart = null;
  }, true);

  /* ---------- CLICK -> SINGLE-SELECT FILTER ---------- */
  document.addEventListener('click', function (event) {
    var el = getFilterEl(event.target);
    if (!el) return;

    // ignore the synthetic click right after a drag
    if (Date.now() < suppressClickUntil) {
      event.preventDefault(); event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      return;
    }

    if (!hasGrid()) return; // no grid here -> let link navigate

    // allow modified clicks (open in new tab)
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    event.preventDefault();
    event.stopPropagation();

    var tag = getTag(el);
    var url = new URL(window.location.href);
    url.searchParams.delete('page');

    var current = url.searchParams.getAll(PARAM);
    var alreadyOnlyThis = current.length === 1 && current[0] === tag;

    // single-select: always start clean, then set one tag (unless toggling off / show-all)
    url.searchParams.delete(PARAM);

    if (!tag) {
      removeAllFilters(url);          // blank = Show all
    } else if (alreadyOnlyThis) {
      // clicking the active tag again clears it
    } else {
      url.searchParams.set(PARAM, tag); // replace with just this one
    }

    document.dispatchEvent(new CustomEvent('shopall:navigate', {
      detail: { url: url.pathname + url.search }
    }));
  }, true);

  /* ---------- ACTIVE STATES (slider cards + pills) ---------- */
  function markActive() {
    var selected = new URLSearchParams(window.location.search).getAll(PARAM);

    document.querySelectorAll(SELECTOR).forEach(function (el) {
      var tag = getTag(el);
      var active = tag ? selected.indexOf(tag) !== -1 : selected.length === 0;

      el.classList.toggle('is-active', active);
      el.setAttribute('aria-pressed', active ? 'true' : 'false');
      if (active) el.setAttribute('aria-current', 'true');
      else el.removeAttribute('aria-current');

      // slider cards have no CSS active rule -> inline border (CSS untouched).
      // pills already have a .is-active CSS rule, so don't override them inline.
      if (el.classList.contains('cat-card')) {
        el.style.borderColor = active ? ACTIVE_BORDER : '';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', markActive);
  } else {
    markActive();
  }

  document.addEventListener('shopall:updated', markActive);
  window.addEventListener('popstate', markActive);
})();
