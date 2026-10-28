/* ============================================================
   custom-pdp.js
   0) Double add-to-cart guard
   1) Benefits slider (robust init + reliable arrow enable/disable)
   2) Gallery dots + caption sync
   3) Colour name hover
   4) Colour slider fix: reloadCells + resize after images load
      (fixes "swatches empty until scroll" WITHOUT breaking drag)
   5) Benefit video controls: mute toggle on thumbnail + expand
      to a centered popup with its own mute toggle
   6) Desktop: cap aside height to gallery height, internal scroll
      (gallery stays sticky/fixed; sidebar scrolls within its own box)
   7) Gallery autoplay: next image every 5 seconds, endless loop,
      keeps running after a swipe / dot click
   Each part isolated so one failing can't break the others.
   ============================================================ */
(function () {

  /* shared: re-measure a Flickity instance after its images load */
  function reloadAfterImages(getF, track) {
    function hardFix() {
      var f = getF();
      if (!f) return;
      try { f.reloadCells(); f.resize(); } catch (e) {}
    }
    [50, 200, 500, 1000, 1800].forEach(function (t) { setTimeout(hardFix, t); });
    track.querySelectorAll('img').forEach(function (img) {
      if (!img.complete) {
        img.addEventListener('load', hardFix, { once: true });
        img.addEventListener('error', hardFix, { once: true });
      }
    });
    window.addEventListener('load', hardFix);
    window.addEventListener('resize', function () { setTimeout(hardFix, 100); });
  }

  /* ---------- 0) DOUBLE ADD-TO-CART GUARD ---------- */
  function guardAddToCart(root) {
    try {
      (root || document).querySelectorAll(
        'product-form form, .cpdp-form__el, .scout-card__addform'
      ).forEach(function (form) {
        if (form._cpdpGuard) return;
        form._cpdpGuard = true;
        form.addEventListener('submit', function (e) {
          if (form._busy) { e.preventDefault(); e.stopImmediatePropagation(); return; }
          form._busy = true;
          setTimeout(function () { form._busy = false; }, 1200);
        }, true);
      });
    } catch (e) { console.warn('cpdp guard', e); }
  }

  /* ---------- 1) BENEFITS SLIDER ---------- */
  function initBenefits(root) {
    var comp = root.querySelector('.cpdp-benefits__slider');
    if (!comp || comp._cpdpInit) return;

    var track = comp.querySelector('[js-carousel]') || comp;
    var slides = track.querySelectorAll('[js-carousel-slide]');

    if (typeof Flickity === 'undefined' || !slides.length) {
      comp._cpdpTries = (comp._cpdpTries || 0) + 1;
      if (comp._cpdpTries < 30) {
        setTimeout(function () { initBenefits(root); }, 150);
      }
      return;
    }

    // Our own instance is only a fallback if the theme's carousel-component
    // hasn't created one yet.
    var fallback = Flickity.data(track) || Flickity.data(comp) || null;
    if (!fallback) {
      try {
        fallback = new Flickity(track, {
          cellSelector: '[js-carousel-slide]',
          cellAlign: 'left',
          contain: true,
          pageDots: false,
          prevNextButtons: false,
          groupCells: false,
          wrapAround: true,
          draggable: true,
          dragThreshold: 5,
          freeScroll: false,
          imagesLoaded: true
        });
      } catch (e) {
        console.warn('cpdp benefits Flickity', e);
        return;
      }
    }

    comp._cpdpInit = true;

    var prev = root.querySelector('.cpdp-benefits__arrows [js-prev-button]');
    var next = root.querySelector('.cpdp-benefits__arrows [js-next-button]');

    // Always resolve the CURRENTLY live Flickity, never a stale reference.
    function live() { return Flickity.data(track) || Flickity.data(comp) || fallback; }

    if (prev) {
      prev.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        var fl = live(); if (fl) fl.previous();   // Flickity clamps at the start
      }, true);
    }
    if (next) {
      next.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        var fl = live(); if (fl) fl.next();        // Flickity clamps at the last reachable stop
      }, true);
    }

    function update() {
      // Slider loops infinitely (wrapAround), so there is no start/end —
      // both arrows always stay active.
      if (prev) {
        prev.classList.remove('cpdp-arrow--off');
        prev.disabled = false;
        prev.setAttribute('aria-disabled', 'false');
      }
      if (next) {
        next.classList.remove('cpdp-arrow--off');
        next.disabled = false;
        next.setAttribute('aria-disabled', 'false');
      }
    }

    // Bind events to the LIVE instance (retry until it exists).
    (function bind() {
      var fl = live();
      if (!fl || !fl.on) { setTimeout(bind, 150); return; }
      fl.on('change', update);
      fl.on('select', update);
      fl.on('settle', update);
      update();
    })();

    reloadAfterImages(function () { return live(); }, track);

    [100, 400, 900].forEach(function (delay) { setTimeout(update, delay); });
    window.addEventListener('resize', function () { setTimeout(update, 160); });
  }

  /* ---------- 2) GALLERY DOTS + CAPTION ---------- */
  function initGalleryDots(root) {
    var comp = root.querySelector('.cpdp-gallery');
    var nav  = root.querySelector('.cpdp-gallery__nav');
    if (!comp || !nav || nav._cpdpDots) return;

    var track = comp.querySelector('[js-carousel]') || comp;
    var dots  = Array.prototype.slice.call(nav.querySelectorAll('.cpdp-gallery__dot'));
    var caption = nav.querySelector('.cpdp-gallery__caption');
    if (!dots.length) return;

    function cells() { return Array.prototype.slice.call(track.querySelectorAll('[js-carousel-slide]')); }
    function getFlkty() {
      if (typeof Flickity === 'undefined') return null;
      var en = comp.classList.contains('flickity-enabled') ? comp : comp.querySelector('.flickity-enabled');
      return en ? Flickity.data(en) : null;
    }
    function currentIndex() {
      var list = cells();
      var sel = track.querySelector('[js-carousel-slide].is-selected');
      if (sel) return list.indexOf(sel);
      var f = getFlkty();
      return f ? (f.selectedIndex || 0) : 0;
    }
    function sync() {
      var i = currentIndex();
      dots.forEach(function (d, idx) { d.classList.toggle('is-active', idx === i); });
      if (caption) {
        var list = cells();
        var cap = list[i] && list[i].getAttribute('data-caption');
        if (cap) caption.textContent = cap;
      }
    }

    var slides = cells();
    if (!slides.length) {
      nav._cpdpTries = (nav._cpdpTries || 0) + 1;
      if (nav._cpdpTries < 20) setTimeout(function () { initGalleryDots(root); }, 200);
      return;
    }
    nav._cpdpDots = true;

    // re-measure the gallery so each cell snaps to full viewport width (fixes mobile peek)
    function galleryReflow() {
      var f = getFlkty();
      if (!f) return;
      try {
        f.reloadCells();
        f.resize();
        f.select(f.selectedIndex || 0, false, true);
      } catch (e) {}
    }
    [100, 300, 600, 1000, 1600].forEach(function (t) { setTimeout(galleryReflow, t); });
    track.querySelectorAll('img').forEach(function (img) {
      if (!img.complete) {
        img.addEventListener('load', galleryReflow, { once: true });
        img.addEventListener('error', galleryReflow, { once: true });
      }
    });
    window.addEventListener('load', galleryReflow);
    var gt;
    window.addEventListener('resize', function () { clearTimeout(gt); gt = setTimeout(galleryReflow, 120); });

    var obs = new MutationObserver(sync);
    slides.forEach(function (s) { obs.observe(s, { attributes: true, attributeFilter: ['class'] }); });

    dots.forEach(function (d) {
      d.addEventListener('click', function () {
        var f = getFlkty();
        if (f) f.select(parseInt(d.dataset.index, 10));
      });
    });

    sync();
  }

  /* ---------- 3) COLOUR NAME HOVER ---------- */
  function initColor(root) {
    var name = root.querySelector('#cpdp-selected-color');
    if (!name || name._cpdpBound) return;
    name._cpdpBound = true;
    var def = name.getAttribute('data-default') || name.textContent;
    root.querySelectorAll('.cpdp-swatch').forEach(function (a) {
      a.addEventListener('mouseover', function () {
        var n = a.getAttribute('data-name');
        if (n) name.textContent = n;
      });
      a.addEventListener('mouseout', function () { name.textContent = def; });
    });
  }

  /* ---------- 4) COLOUR SLIDER (init + reloadCells after images) ---------- */
  function initColorSlider(root) {
    var comp = root.querySelector('.cpdp-color__slider');
    if (!comp || comp._cinit) return;

    var track = comp.querySelector('[js-carousel]');
    if (!track) return;

    var slides = track.querySelectorAll('[js-carousel-slide]');

    if (typeof Flickity === 'undefined' || !slides.length) {
      comp._ctries = (comp._ctries || 0) + 1;
      if (comp._ctries < 30) {
        setTimeout(function () { initColorSlider(root); }, 150);
      }
      return;
    }

    // Reuse the theme's instance if it already exists.
    var f = Flickity.data(track) || Flickity.data(comp) || null;

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
          imagesLoaded: true
        });
      } catch (e) {
        console.warn('cpdp color Flickity', e);
        return;
      }
    }

    comp._cinit = true;

    function refreshSlider() {
      if (!f) return;
      var selectedIndex = typeof f.selectedIndex === 'number' ? f.selectedIndex : 0;
      try {
        f.reloadCells();
        f.resize();
        f.select(selectedIndex, false, true);
      } catch (e) {
        console.warn('cpdp color refresh', e);
      }
    }

    [50, 200, 500, 1000].forEach(function (delay) { setTimeout(refreshSlider, delay); });

    track.querySelectorAll('img').forEach(function (img) {
      img.setAttribute('draggable', 'false');
      if (!img.complete) {
        img.addEventListener('load', refreshSlider, { once: true });
        img.addEventListener('error', refreshSlider, { once: true });
      }
    });

    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(refreshSlider, 150);
    });
  }

  /* ---------- 5) BENEFIT VIDEO CONTROLS (mute + expand-to-modal) ----------
     IMPORTANT: instead of cloning <source> tags into a fresh <video> (which
     forces the browser to re-download the file and causes a visible delay),
     we move the ACTUAL playing <video> element into the modal. It already
     has buffered data, so it shows instantly with no reload. On close we
     move it back to its original spot in the thumbnail. */
  function initBenefitVideoControls(root) {
    var modal = root.querySelector('[data-cpdp-video-modal]');
    if (!modal || modal._cpdpModalInit) {
      bindThumbnails(root, modal);
      return;
    }

    var videoSlot     = modal.querySelector('[data-cpdp-modal-video-slot]');
    var modalMuteBtn  = modal.querySelector('[data-cpdp-modal-mute]');
    var closeEls      = modal.querySelectorAll('[data-cpdp-modal-close]');
    var activeVideo   = null;

    function setMuteIcon(btn, muted) {
      if (!btn) return;
      var un = btn.querySelector('.icon-unmute');
      var mu = btn.querySelector('.icon-mute');
      if (un) un.style.display = muted ? 'none' : '';
      if (mu) mu.style.display = muted ? '' : 'none';
    }

    function openModal(sourceVideo) {
      if (!videoSlot || activeVideo) return;

      // remember exactly where this video came from so we can restore it
      sourceVideo._cpdpHomeParent = sourceVideo.parentNode;
      sourceVideo._cpdpHomeNext   = sourceVideo.nextSibling;
      sourceVideo._cpdpWasMuted   = sourceVideo.muted;

      // move the live element itself (no clone, no reload)
      videoSlot.innerHTML = '';
      videoSlot.appendChild(sourceVideo);

      sourceVideo.controls = false;  // no native browser controls — custom mute button only
      sourceVideo.removeAttribute('controls');
      sourceVideo.loop = true;
      sourceVideo.muted = true;    // popup opens muted by default
      sourceVideo.play().catch(function () {});
      setMuteIcon(modalMuteBtn, true);

      activeVideo = sourceVideo;
      modal.classList.add('is-open');
      document.documentElement.style.overflow = 'hidden';
    }

    function closeModal() {
      modal.classList.remove('is-open');
      document.documentElement.style.overflow = '';

      if (activeVideo) {
        var v = activeVideo;
        v.pause();
        v.controls = false;
        v.loop = true;
        v.muted = (typeof v._cpdpWasMuted === 'boolean') ? v._cpdpWasMuted : true;

        // put it back exactly where it was in the thumbnail
        if (v._cpdpHomeParent) {
          if (v._cpdpHomeNext) {
            v._cpdpHomeParent.insertBefore(v, v._cpdpHomeNext);
          } else {
            v._cpdpHomeParent.appendChild(v);
          }
        }
        v.play().catch(function () {}); // resume thumbnail autoplay
        activeVideo = null;
      }
    }

    closeEls.forEach(function (el) {
      el.addEventListener('click', closeModal);
    });

    if (modalMuteBtn) {
      modalMuteBtn.addEventListener('click', function () {
        if (!activeVideo) return;
        activeVideo.muted = !activeVideo.muted;
        setMuteIcon(modalMuteBtn, activeVideo.muted);
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
    });

    modal._cpdpModalInit = true;
    modal._cpdpOpen = openModal;

    bindThumbnails(root, modal);
  }

  function bindThumbnails(root, modal) {
    if (!modal) return;

    function setMuteIcon(btn, muted) {
      if (!btn) return;
      var un = btn.querySelector('.icon-unmute');
      var mu = btn.querySelector('.icon-mute');
      if (un) un.style.display = muted ? 'none' : '';
      if (mu) mu.style.display = muted ? '' : 'none';
    }

    root.querySelectorAll('.cpdp-benefit__media').forEach(function (media) {
      var video = media.querySelector('.cpdp-benefit__video');
      if (!video || media._cpdpVideoCtrl) return;
      media._cpdpVideoCtrl = true;

      var muteBtn   = media.querySelector('.cpdp-benefit__mute-btn');
      var expandBtn = media.querySelector('.cpdp-benefit__expand-btn');

      if (muteBtn) {
        muteBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          video.muted = !video.muted;
          setMuteIcon(muteBtn, video.muted);
        });
      }

      function triggerExpand(e) {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        if (modal._cpdpOpen) modal._cpdpOpen(video);
      }

      if (expandBtn) expandBtn.addEventListener('click', triggerExpand);
      video.addEventListener('click', triggerExpand);
    });
  }

  /* ---------- 6) DESKTOP: cap aside height to gallery height, internal scroll ----------
     Left gallery stays sticky (via CSS). On desktop widths we measure the
     gallery's rendered height and cap the aside (buy box / accordion /
     benefits / bulk order) to that same height, with its own internal
     scrollbar so the outer page scroll stays clean and both columns feel
     "locked" to the same viewport section. */
  function syncAsideHeight(root) {
    var gallery = root.querySelector('.cpdp__gallery');
    var aside   = root.querySelector('.cpdp__aside');
    if (!gallery || !aside || aside._cpdpHeightSyncInit) return;
    aside._cpdpHeightSyncInit = true;

    var mq = window.matchMedia('(min-width: 750px)');

    function apply() {
      if (!mq.matches) {
        aside.style.maxHeight = '';
        aside.style.overflowY = '';
        return;
      }
      var h = gallery.offsetHeight;
      if (h > 0) {
        aside.style.maxHeight = h + 'px';
        aside.style.overflowY = 'auto';
      }
    }

    apply();

    var rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(apply, 120);
    });
    window.addEventListener('load', apply);

    gallery.querySelectorAll('img').forEach(function (img) {
      if (!img.complete) img.addEventListener('load', apply, { once: true });
    });

    // gallery height can change once Flickity fully initializes / images settle —
    // recheck a few times after load without relying on a single event.
    [300, 800, 1500, 2200].forEach(function (delay) { setTimeout(apply, delay); });

    // also recheck if gallery's own content changes size (e.g. carousel re-measure)
    if (typeof ResizeObserver !== 'undefined') {
      try {
        var ro = new ResizeObserver(function () { apply(); });
        ro.observe(gallery);
      } catch (e) {}
    }
  }

  /* ---------- 7) GALLERY AUTOPLAY (every 5s, infinite loop) ----------
     Flickity's own autoPlay stops for good after the first swipe and
     pauses on hover. This timer always moves to the next image, loops
     back to the first after the last, and simply restarts the 5s count
     after any manual change (swipe, dot click). */
  function initGalleryAutoplay(root) {
    var comp = root.querySelector('.cpdp-gallery');
    if (!comp || comp._cpdpAuto || comp.classList.contains('cpdp-gallery--single')) return;

    var track = comp.querySelector('[js-carousel]') || comp;
    var DELAY = 5000;

    function getF() {
      if (typeof Flickity === 'undefined') return null;
      var en = comp.classList.contains('flickity-enabled') ? comp : comp.querySelector('.flickity-enabled');
      return Flickity.data(track) || Flickity.data(comp) || (en ? Flickity.data(en) : null);
    }

    var f = getF();
    if (!f || !f.slides || f.slides.length < 2) {
      comp._cpdpAutoTries = (comp._cpdpAutoTries || 0) + 1;
      if (comp._cpdpAutoTries < 40) setTimeout(function () { initGalleryAutoplay(root); }, 150);
      return;
    }
    comp._cpdpAuto = true;

    // respect "reduce motion" accessibility setting
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // turn off Flickity's own player so the slider never jumps twice
    try { if (typeof f.stopPlayer === 'function') f.stopPlayer(); } catch (e) {}

    var timer;
    var dragging = false;

    function advance() {
      var fl = getF();
      if (!fl || !fl.slides) return;
      var last = fl.slides.length - 1;
      if (fl.options && fl.options.wrapAround) fl.next();    // seamless loop
      else if (fl.selectedIndex >= last) fl.select(0);      // back to first image
      else fl.next();
    }

    function start() {
      clearTimeout(timer);
      if (document.hidden || dragging) return;
      timer = setTimeout(function () { advance(); start(); }, DELAY);
    }

    // every change (auto, swipe, dot) restarts the 5s count
    f.on('select', start);
    f.on('dragStart', function () { dragging = true; clearTimeout(timer); });
    f.on('dragEnd', function () { dragging = false; start(); });

    // pause while the browser tab is in the background
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) clearTimeout(timer); else start();
    });

    start();
  }

  /* ---------- run all (each isolated) ---------- */
  function run(scope) {
    guardAddToCart(scope);
    (scope || document).querySelectorAll('.cpdp').forEach(function (root) {
      try { initBenefits(root); }              catch (e) { console.warn('cpdp benefits', e); }
      try { initColorSlider(root); }           catch (e) { console.warn('cpdp colorslider', e); }
      try { initGalleryDots(root); }           catch (e) { console.warn('cpdp dots', e); }
      try { initGalleryAutoplay(root); }       catch (e) { console.warn('cpdp autoplay', e); }
      try { initColor(root); }                 catch (e) { console.warn('cpdp color', e); }
      try { initBenefitVideoControls(root); }  catch (e) { console.warn('cpdp video ctrl', e); }
     
    });
  }

  if (document.readyState !== 'loading') run();
  else document.addEventListener('DOMContentLoaded', function () { run(); });
  document.addEventListener('shopify:section:load', function (e) { if (e.target.querySelector) run(e.target); });
  window.addEventListener('load', function () { run(); });
  document.querySelectorAll('.cpdp-tags').forEach(function (tagGroup) {
  var tags = tagGroup.querySelectorAll('.cpdp-tag');

  // Make the first tag active by default
  tags.forEach(function (tag) {
    tag.classList.remove('is-active');
  });

  if (tags.length) {
    tags[0].classList.add('is-active');
  }

  // Change active tag on click
  tags.forEach(function (tag) {
    tag.addEventListener('click', function () {
      tags.forEach(function (item) {
        item.classList.remove('is-active');
      });

      tag.classList.add('is-active');
    });
  });
});

})();


(function () {
  function initColorArrows(scope) {
    (scope || document)
      .querySelectorAll('.cpdp-color__slider-wrap')
      .forEach(function (wrapper) {
        if (wrapper._colorArrowsInit) return;

        var comp = wrapper.querySelector('.cpdp-color__slider');
        var track = comp && comp.querySelector('[js-carousel]');
        var prev = wrapper.querySelector('[data-color-prev]');
        var next = wrapper.querySelector('[data-color-next]');

        if (!comp || !track || !prev || !next) return;

        if (typeof Flickity === 'undefined') {
          setTimeout(function () {
            initColorArrows(scope);
          }, 150);

          return;
        }

        var flickity =
          Flickity.data(track) ||
          Flickity.data(comp);

        if (!flickity) {
          wrapper._colorArrowTries =
            (wrapper._colorArrowTries || 0) + 1;

          if (wrapper._colorArrowTries < 30) {
            setTimeout(function () {
              initColorArrows(scope);
            }, 150);
          }

          return;
        }

        wrapper._colorArrowsInit = true;

        function updateArrows() {
          var index =
            typeof flickity.selectedIndex === 'number'
              ? flickity.selectedIndex
              : 0;

          var last =
            flickity.slides && flickity.slides.length
              ? flickity.slides.length - 1
              : 0;

          var previousDisabled = index <= 0;
          var nextDisabled = index >= last;

          prev.disabled = previousDisabled;
          next.disabled = nextDisabled;

          prev.setAttribute(
            'aria-disabled',
            previousDisabled ? 'true' : 'false'
          );

          next.setAttribute(
            'aria-disabled',
            nextDisabled ? 'true' : 'false'
          );
        }

        prev.addEventListener(
          'click',
          function (event) {
            event.preventDefault();
            event.stopImmediatePropagation();

            if (!prev.disabled) {
              flickity.previous();
            }
          },
          true
        );

        next.addEventListener(
          'click',
          function (event) {
            event.preventDefault();
            event.stopImmediatePropagation();

            if (!next.disabled) {
              flickity.next();
            }
          },
          true
        );

        flickity.on('change', updateArrows);
        flickity.on('select', updateArrows);
        flickity.on('settle', updateArrows);

        updateArrows();

        setTimeout(function () {
          flickity.resize();
          updateArrows();
        }, 300);
      });
  }

  if (document.readyState !== 'loading') {
    initColorArrows();
  } else {
    document.addEventListener(
      'DOMContentLoaded',
      function () {
        initColorArrows();
      }
    );
  }

  window.addEventListener('load', function () {
    initColorArrows();
  });

  document.addEventListener(
    'shopify:section:load',
    function (event) {
      initColorArrows(event.target);
    }
  );
})();