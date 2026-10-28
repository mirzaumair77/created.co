(function () {
  if (window.__heroScoutLoaded) return;
  window.__heroScoutLoaded = true;

  /* Flickity comes from theme.js — wait until it's available */
  function whenFlickity(cb) {
    if (window.Flickity) return cb();
    var tries = 0;
    var t = setInterval(function () {
      if (window.Flickity) { clearInterval(t); cb(); }
      else if (++tries > 100) { clearInterval(t); console.warn('Hero Scout: Flickity not found (theme.js)'); }
    }, 50);
  }

  function HeroScout(el) {
    this.el = el;
    this.delay = parseInt(el.dataset.autoplay, 10) || 6000;
    this.bgEl = el.querySelector('.js-hero-bg');
    this.cardEl = el.querySelector('.js-hero-card');
    this.progress = el.querySelector('.js-hero-progress');
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.paused = false;
    this.setHeaderOffset();
    this.initBg();
    this.initCard();
    this.initDots();
  }

  HeroScout.prototype.setHeaderOffset = function () {
    if (!this.el.classList.contains('hero-scout--overlap')) return;
    var sel = this.el.dataset.headerSelector;
    var header = sel ? document.querySelector(sel) : null;
    var el = this.el;
    function update() { el.style.setProperty('--hs-header-offset', (header ? header.offsetHeight : 0) + 'px'); }
    update();
    if (header && 'ResizeObserver' in window) { this.ro = new ResizeObserver(update); this.ro.observe(header); }
  };

  /* Background: own timer so the progress bar stays in sync.
     It keeps running on hover and on button clicks. */
  HeroScout.prototype.initBg = function () {
    if (!this.bgEl || this.bgEl.children.length < 2) return;
    var self = this;
    this.bg = new Flickity(this.bgEl, {
      cellAlign: 'left',
      wrapAround: true,
      prevNextButtons: false,
      pageDots: false,
      autoPlay: false,
      setGallerySize: false,
      selectedAttraction: 0.025,
      friction: 0.32
    });
    this.bg.on('change', function () { self.restart(); });
    // content + dots follow the background slide
    this.bg.on('select', function () { self.setSlide(self.bg.selectedIndex); });
    // after a manual drag, always start the timer again (even if the slide didn't change)
    this.bg.on('dragEnd', function () { self.restart(); });

    // only pause while the browser tab is hidden
    document.addEventListener('visibilitychange', function () { document.hidden ? self.pause() : self.resume(); });
    this.restart();
  };

  /* Show the content and dots of background slide `i` */
  HeroScout.prototype.setSlide = function (i) {
    this.el.querySelectorAll('.js-hero-content, .js-hero-dots').forEach(function (node) {
      var on = parseInt(node.dataset.slide, 10) === i;
      node.classList.toggle('is-active', on);
      if (node.classList.contains('js-hero-content')) {
        if (on) node.removeAttribute('aria-hidden'); else node.setAttribute('aria-hidden', 'true');
        node.querySelectorAll('a, button').forEach(function (el) {
          if (on) el.removeAttribute('tabindex'); else el.setAttribute('tabindex', '-1');
        });
      }
    });
  };

  HeroScout.prototype.restart = function () {
    var self = this;
    clearTimeout(this.timer);
    this.remaining = this.delay;
    this.startedAt = Date.now();
    this.paused = false;
    this.el.classList.remove('is-paused');
    if (this.progress) {
      this.progress.classList.remove('is-running');
      void this.progress.offsetWidth;
      this.progress.classList.add('is-running');
    }
    if (!this.reduced) this.timer = setTimeout(function () { self.bg.next(); }, this.delay);
  };

  HeroScout.prototype.pause = function () {
    if (!this.bg || this.paused) return;
    this.paused = true;
    clearTimeout(this.timer);
    this.remaining -= Date.now() - this.startedAt;
    this.el.classList.add('is-paused');
  };

  HeroScout.prototype.resume = function () {
    if (!this.bg || !this.paused || this.reduced) return;
    var self = this;
    this.paused = false;
    this.startedAt = Date.now();
    this.el.classList.remove('is-paused');
    this.timer = setTimeout(function () { self.bg.next(); }, Math.max(this.remaining, 0));
  };

  /* Right card slider: arrows on desktop, swipe on mobile */
  HeroScout.prototype.initCard = function () {
    if (!this.cardEl || this.cardEl.children.length < 2) return;
    var self = this;
    this.card = new Flickity(this.cardEl, {
      cellAlign: 'left',
      wrapAround: true,
      prevNextButtons: false,
      pageDots: false,
      adaptiveHeight: true
    });
    var prev = this.el.querySelector('.js-card-prev');
    var next = this.el.querySelector('.js-card-next');
    if (prev) prev.addEventListener('click', function () { self.card.previous(); });
    if (next) next.addEventListener('click', function () { self.card.next(); });
    window.addEventListener('resize', function () { self.card.resize(); });
  };

  /* Hotspot dots: Dot 1 → 1st product card, Dot 2 → 2nd product card */
  /* Hotspot dots: Dot 1 → 1st product card, Dot 2 → 2nd product card.
     Changes on hover (mouse), on click (touch), and on keyboard focus. */
  HeroScout.prototype.initDots = function () {
    var self = this;
    this.dots = [].slice.call(this.el.querySelectorAll('.js-hero-dot'));
    this.dots.forEach(function (dot) {
      var index = parseInt(dot.dataset.card, 10) - 1;
      dot.addEventListener('mouseenter', function () { self.showCard(index); });
      dot.addEventListener('focus', function () { self.showCard(index); });
      dot.addEventListener('click', function (e) {
        e.preventDefault();
        self.showCard(index);
      });
    });
    // keep the active dot in sync when the card changes (dots, arrows, swipe)
    if (this.card) this.card.on('change', function () { self.updateDots(); });
    this.updateDots();
  };

  HeroScout.prototype.showCard = function (index) {
    if (!this.card || isNaN(index)) return;           // needs 2+ product cards
    if (index < 0 || index >= this.card.cells.length) return;
    this.card.select(index);
    this.updateDots();
  };

  HeroScout.prototype.updateDots = function () {
    if (!this.dots) return;
    var current = this.card ? this.card.selectedIndex : 0;
    this.dots.forEach(function (dot) {
      var on = parseInt(dot.dataset.card, 10) - 1 === current;
      dot.classList.toggle('is-active', on);
      dot.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  };

  HeroScout.prototype.destroy = function () {
    clearTimeout(this.timer);
    if (this.bg) this.bg.destroy();
    if (this.card) this.card.destroy();
    if (this.ro) this.ro.disconnect();
  };

  function init(root) {
    root.querySelectorAll('.hero-scout').forEach(function (s) {
      if (s.__hs) return;
      whenFlickity(function () { if (!s.__hs) s.__hs = new HeroScout(s); });
    });
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', function () { init(document); })
    : init(document);

  /* Theme editor */
  document.addEventListener('shopify:section:load', function (e) { init(e.target); });
  document.addEventListener('shopify:section:unload', function (e) {
    var s = e.target.querySelector('.hero-scout');
    if (s && s.__hs) s.__hs.destroy();
  });
  document.addEventListener('shopify:block:select', function (e) {
    var s = e.target.closest('.hero-scout');
    if (!s || !s.__hs) return;
    var hs = s.__hs;
    if (hs.bg && hs.bgEl.contains(e.target)) {
      hs.bg.select([].indexOf.call(hs.bgEl.querySelectorAll('.hero-scout__bg-slide'), e.target));
      hs.pause();
    }
    if (hs.card && hs.cardEl.contains(e.target)) {
      hs.card.select([].indexOf.call(hs.cardEl.querySelectorAll('.hero-scout__card-slide'), e.target));
    }
  });
  document.addEventListener('shopify:block:deselect', function (e) {
    var s = e.target.closest('.hero-scout');
    if (s && s.__hs) s.__hs.resume();
  });
})();