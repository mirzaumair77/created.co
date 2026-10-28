/* ============================================================
   scout-story.js
   - init Flickity on .scout-story__slider (robust retry)
   - wire prev/next arrows
   - active arrow dark, disabled arrow grey (--off)
   - bag spinner (force .loading on click, clear on /cart/add)
   ============================================================ */
(function () {

  /* ---------- slider + arrows ---------- */
/* ---------- slider + arrows ---------- */
function initSlider(root) {
  var comp = root.querySelector('.scout-story__slider');

  if (!comp || comp._ssInit) return;

  var track = comp.querySelector('[js-carousel]') || comp;
  var slides = track.querySelectorAll('[js-carousel-slide]');

  if (typeof Flickity === 'undefined' || !slides.length) {
    comp._ssTries = (comp._ssTries || 0) + 1;

    if (comp._ssTries < 30) {
      setTimeout(function () {
        initSlider(root);
      }, 150);
    }

    return;
  }

  /*
   * Use the theme-created Flickity instance if it exists.
   * This prevents the carousel from initializing twice.
   */
  var f =
    Flickity.data(track) ||
    Flickity.data(comp) ||
    null;

  if (!f) {
    try {
      f = new Flickity(track, {
        cellSelector: '[js-carousel-slide]',
        cellAlign: 'left',
        contain: true,
        pageDots: false,
        prevNextButtons: false,
        groupCells: false,
        wrapAround: false,
        draggable: true,
        dragThreshold: 5,
        freeScroll: false
      });
    } catch (e) {
      console.warn('scout Flickity', e);
      return;
    }
  }

  comp._ssInit = true;

  var prev = root.querySelector(
    '.scout-story__arrows [js-prev-button]'
  );

  var next = root.querySelector(
    '.scout-story__arrows [js-next-button]'
  );

  function getCurrentIndex() {
    return typeof f.selectedIndex === 'number'
      ? f.selectedIndex
      : 0;
  }

  function getLastIndex() {
    return f.slides && f.slides.length
      ? f.slides.length - 1
      : 0;
  }

  if (prev) {
    prev.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();

      var current = getCurrentIndex();

      /* Prevent moving backward from the first slide */
      if (current <= 0) return;

      f.select(current - 1);
    }, true);
  }

  if (next) {
    next.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();

      var current = getCurrentIndex();
      var last = getLastIndex();

      /* Prevent moving forward from the last slide */
      if (current >= last) return;

      f.select(current + 1);
    }, true);
  }

  function update() {
    var current = getCurrentIndex();
    var last = getLastIndex();

    if (prev) {
      var atStart = current <= 0;

      prev.classList.toggle(
        'scout-story__arrow--off',
        atStart
      );

      prev.disabled = atStart;

      prev.setAttribute(
        'aria-disabled',
        atStart ? 'true' : 'false'
      );
    }

    if (next) {
      var atEnd = current >= last;

      next.classList.toggle(
        'scout-story__arrow--off',
        atEnd
      );

      next.disabled = atEnd;

      next.setAttribute(
        'aria-disabled',
        atEnd ? 'true' : 'false'
      );
    }
  }

  f.on('change', update);
  f.on('select', update);
  f.on('settle', update);

  setTimeout(function () {
    try {
      f.resize();
    } catch (e) {}

    update();
  }, 300);

  update();

  [100, 400, 900].forEach(function (delay) {
    setTimeout(update, delay);
  });
}

  function run(scope) {
    (scope || document).querySelectorAll('.scout-story').forEach(function (root) {
      try { initSlider(root); } catch (e) { console.warn('scout init', e); }
    });
  }

  if (document.readyState !== 'loading') run();
  else document.addEventListener('DOMContentLoaded', function () { run(); });
  document.addEventListener('shopify:section:load', function (e) { if (e.target.querySelector) run(e.target); });
  window.addEventListener('load', function () { run(); });

  /* ---------- bag spinner ---------- */
  document.addEventListener('click', function (e) {
    var bag = e.target.closest && e.target.closest('.scout-card__bag');
    if (!bag || bag.classList.contains('scout-card__bag--sold')) return;
    bag.classList.add('loading');
  }, true);

  function clearBag() {
    setTimeout(function () {
      document.querySelectorAll('.scout-card__bag.loading').forEach(function (b) {
        b.classList.remove('loading');
      });
    }, 500);
  }
  if (!window._cpdpSharedFetchWrap) {
    window._cpdpSharedFetchWrap = true;
    var _f = window.fetch;
    window.fetch = function () {
      var u = arguments[0];
      var isAdd = (typeof u === 'string' && u.indexOf('/cart/add') !== -1) ||
                  (u && u.url && u.url.indexOf('/cart/add') !== -1);
      var p = _f.apply(this, arguments);
      if (isAdd) p.then(clearBag).catch(clearBag);
      return p;
    };
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.scout-card__bag')) setTimeout(clearBag, 3000);
  }, true);
})();
