(function () {
  if (window.__shopByLoaded) return;
  window.__shopByLoaded = true;

  /* Flickity comes from theme.js — wait until it's available */
  function whenFlickity(cb) {
    if (window.Flickity) return cb();
    var tries = 0;
    var t = setInterval(function () {
      if (window.Flickity) { clearInterval(t); cb(); }
      else if (++tries > 100) { clearInterval(t); console.warn('Shop by: Flickity not found (theme.js)'); }
    }, 50);
  }

  function ShopBy(el) {
    this.el = el;
    this.tabs = [].slice.call(el.querySelectorAll('.js-sb-tab'));
    this.panels = [].slice.call(el.querySelectorAll('.js-sb-panel'));
    this.prev = el.querySelector('.js-sb-prev');
    this.next = el.querySelector('.js-sb-next');
    this.status = el.querySelector('.js-sb-status');
    this.sliders = [];
    this.active = 0;

    this.initSlider(0);
    this.bindTabs();
    this.bindArrows();
    this.bindForms();
  }

  ShopBy.prototype.initSlider = function (i) {
    if (this.sliders[i]) return this.sliders[i];
    var node = this.panels[i] && this.panels[i].querySelector('.js-sb-slider');
    if (!node) return null;
    var self = this;
    var flkty = new Flickity(node, {
      cellAlign: 'left',
      contain: true,
      prevNextButtons: false,
      pageDots: false,
      groupCells: false,
      cellSelector: '.shop-by__cell'
    });
    flkty.on('select', function () { if (i === self.active) self.updateArrows(); });
    flkty.on('settle', function () { if (i === self.active) self.updateArrows(); });
    this.sliders[i] = flkty;
    this.updateArrows();
    return flkty;
  };

  ShopBy.prototype.select = function (i) {
    if (i === this.active) return;
    this.active = i;
    this.tabs.forEach(function (t, n) {
      t.classList.toggle('is-active', n === i);
      t.setAttribute('aria-selected', n === i ? 'true' : 'false');
      t.tabIndex = n === i ? 0 : -1;
    });
    this.panels.forEach(function (p, n) {
      p.hidden = n !== i;
      p.classList.toggle('is-active', n === i);
    });
    var flkty = this.initSlider(i);
    if (flkty) { flkty.resize(); flkty.select(0, false, true); }
    this.updateArrows();
  };

  ShopBy.prototype.bindTabs = function () {
    var self = this;
    this.tabs.forEach(function (tab, i) {
      tab.tabIndex = i === 0 ? 0 : -1;
      tab.addEventListener('click', function () { self.select(i); });
      tab.addEventListener('keydown', function (e) {
        var dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!dir) return;
        e.preventDefault();
        var n = (i + dir + self.tabs.length) % self.tabs.length;
        self.tabs[n].focus();
        self.select(n);
      });
    });
  };

  ShopBy.prototype.bindArrows = function () {
    var self = this;
    if (this.prev) this.prev.addEventListener('click', function () {
      var f = self.sliders[self.active];
      if (!f) return;
      var cur = f.selectedSlide.target;
      for (var n = f.selectedIndex - 1; n >= 0; n--) {
        if (Math.abs(f.slides[n].target - cur) > 1) return f.select(n);
      }
      f.select(0);
    });
    if (this.next) this.next.addEventListener('click', function () {
      var f = self.sliders[self.active];
      if (!f) return;
      var cur = f.selectedSlide.target;
      for (var n = f.selectedIndex + 1; n < f.slides.length; n++) {
        if (Math.abs(f.slides[n].target - cur) > 1) return f.select(n);
      }
    });
  };

  ShopBy.prototype.updateArrows = function () {
    var f = this.sliders[this.active];
    if (!f || !this.prev) return;
    var i = f.selectedIndex;
    var cur = f.slides[i] ? f.slides[i].target : 0;
    var canNext = f.slides.slice(i + 1).some(function (sl) { return Math.abs(sl.target - cur) > 1; });
    this.prev.disabled = i <= 0;
    this.next.disabled = !canNext;
  };

  /* ---------- Quick add to cart ---------- */
  /* ---------- Quick add to cart ---------- */
  ShopBy.prototype.bindForms = function () {
    var self = this;
    this.el.querySelectorAll('.js-sb-atc').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (btn.disabled || btn.classList.contains('is-loading')) return;

        btn.classList.add('is-loading');
        btn.setAttribute('aria-busy', 'true');

        var root = (window.Shopify && Shopify.routes && Shopify.routes.root) || '/';

        fetch(root + 'cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({
            items: [{ id: Number(btn.dataset.variantId), quantity: 1 }]
          })
        })
          .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
          .then(function (res) {
            if (!res.ok) throw new Error(res.data.description || res.data.message || 'Could not add to cart');
            btn.classList.add('is-added');
            self.announce('Added to cart');
            setTimeout(function () { btn.classList.remove('is-added'); }, 1800);
            return fetch(root + 'cart.js').then(function (r) { return r.json(); }).then(function (cart) {
              self.afterAdd(res.data, cart);
            });
          })
          .catch(function (err) {
            self.announce(err.message);
            alert(err.message);
          })
          .finally(function () {
            btn.classList.remove('is-loading');
            btn.removeAttribute('aria-busy');
          });
      });
    });
  };

  /* Hook into the theme's cart after a successful add.
     If your cart drawer has its own refresh function, call it here. */
  ShopBy.prototype.afterAdd = function (added, cart) {
    // update header cart count bubble
    document.querySelectorAll('[js-open-cart-drawer]').forEach(function (btn) {
      var bubble = btn.querySelector('span');
      if (!bubble) {
        bubble = document.createElement('span');
        bubble.className = 'absolute -top-8 right-0 bg-black w-16 h-16 block text-10 rounded-full text-white';
        btn.appendChild(bubble);
      }
      bubble.textContent = cart.item_count;
    });

    // events for any theme scripts listening
    document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true, detail: { cart: cart } }));
    document.documentElement.dispatchEvent(new CustomEvent('variant:add', { bubbles: true, detail: { items: added.items, cart: cart } }));

    // open the cart drawer
    var opener = document.querySelector('[js-open-cart-drawer]');
    if (opener) opener.click();
  };

  ShopBy.prototype.announce = function (msg) {
    if (!this.status) return;
    this.status.textContent = '';
    var s = this.status;
    setTimeout(function () { s.textContent = msg; }, 50);
  };

  ShopBy.prototype.destroy = function () {
    this.sliders.forEach(function (f) { if (f) f.destroy(); });
  };

  function init(root) {
    root.querySelectorAll('.shop-by').forEach(function (s) {
      if (s.__sb) return;
      whenFlickity(function () { if (!s.__sb) s.__sb = new ShopBy(s); });
    });
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', function () { init(document); })
    : init(document);

  /* Theme editor */
  document.addEventListener('shopify:section:load', function (e) { init(e.target); });
  document.addEventListener('shopify:section:unload', function (e) {
    var s = e.target.querySelector('.shop-by');
    if (s && s.__sb) s.__sb.destroy();
  });
  document.addEventListener('shopify:block:select', function (e) {
    var s = e.target.closest('.shop-by');
    if (!s || !s.__sb) return;
    var i = s.__sb.tabs.indexOf(e.target);
    if (i > -1) s.__sb.select(i);
  });
})();