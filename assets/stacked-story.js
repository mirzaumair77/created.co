(function () {
  if (window.__stkLoaded) return;
  window.__stkLoaded = true;

  var STACK_BP = 990;  // same as the stacked breakpoint in stacked-story.css
  var mobileMq = window.matchMedia('(max-width: ' + STACK_BP + 'px)');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function Stack(el) {
    this.el = el;
    this.initReviews();
    if (el.classList.contains('stk--shrink') && el.dataset.stack === 'true' && !reduced) this.initShrink();
  }

  /* ---------- Reviews slider (fade) ---------- */
  Stack.prototype.initReviews = function () {
    var wrap = this.el.querySelector('.js-stk-reviews');
    if (!wrap) return;
    var slides = [].slice.call(wrap.querySelectorAll('.js-stk-review'));
    if (slides.length < 2) return;
    var index = 0;
    var self = this;

    this.showReview = function (i) {
      index = (i + slides.length) % slides.length;
      slides.forEach(function (s, n) {
        var on = n === index;
        s.classList.toggle('is-active', on);
        if (on) s.removeAttribute('aria-hidden'); else s.setAttribute('aria-hidden', 'true');
      });
    };

    wrap.querySelector('.js-stk-prev').addEventListener('click', function () { self.showReview(index - 1); });
    wrap.querySelector('.js-stk-next').addEventListener('click', function () { self.showReview(index + 1); });
    this.reviewSlides = slides;
  };

  /* ---------- Covered panel shrinks + dims while the next one slides over ---------- */
  Stack.prototype.initShrink = function () {
    var self = this;
    var ticking = false;

    function panels() {
      // desktop: rows · mobile: tiles in visual order
      if (mobileMq.matches) {
        return [].slice.call(self.el.querySelectorAll('.js-stk-tile')).sort(function (a, b) {
          return a.dataset.order - b.dataset.order;
        });
      }
      return [].slice.call(self.el.querySelectorAll('.js-stk-panel'));
    }

    function update() {
      ticking = false;
      var list = panels();
      var all = self.el.querySelectorAll('.js-stk-panel, .js-stk-tile');
      all.forEach(function (p) { if (list.indexOf(p) < 0) p.style.setProperty('--stk-p', 0); });

      list.forEach(function (panel, i) {
        var next = list[i + 1];
        if (!next) { panel.style.setProperty('--stk-p', 0); return; }
        var h = panel.offsetHeight || 1;
        var top = next.getBoundingClientRect().top;
        var stickTop = panel.getBoundingClientRect().top;
        // 0 when the next panel is one panel-height below, 1 when it fully covers
        var p = 1 - (top - stickTop) / h;
        p = Math.max(0, Math.min(1, p));
        if (p >= 0.99) p = 0;
        panel.style.setProperty('--stk-p', p.toFixed(3));
      });
    }

    function onScroll() {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    if (mobileMq.addEventListener) mobileMq.addEventListener('change', onScroll);
    this.teardown = function () {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
    update();
  };

  Stack.prototype.destroy = function () { if (this.teardown) this.teardown(); };

  function init(root) {
    root.querySelectorAll('.stk').forEach(function (s) { if (!s.__stk) s.__stk = new Stack(s); });
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', function () { init(document); })
    : init(document);

  document.addEventListener('shopify:section:load', function (e) { init(e.target); });
  document.addEventListener('shopify:section:unload', function (e) {
    var s = e.target.querySelector('.stk');
    if (s && s.__stk) s.__stk.destroy();
  });
  document.addEventListener('shopify:block:select', function (e) {
    var s = e.target.closest('.stk');
    if (!s || !s.__stk || !s.__stk.reviewSlides) return;
    var i = s.__stk.reviewSlides.indexOf(e.target);
    if (i > -1) s.__stk.showReview(i);
  });
})();
