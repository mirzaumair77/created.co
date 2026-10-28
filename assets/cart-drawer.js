/* ============================================================
   cart-drawer.js
   Custom cart drawer (sections/cart-drawer.liquid)
   - Opens from the header cart icon [js-open-cart-drawer]
   - Opens/refreshes after any add to cart on the site
     (theme.CartAPI events, Rebuy widgets, plain fetch/XHR calls)
   - Quantity, remove and upsell add use the Ajax Cart API and
     re-render through the Section Rendering API
   - Public API: window.CartDrawer.open() / .close() / .refresh(open)
   - "Cart to use" setting = Rebuy: open/refresh show Rebuy Smart Cart instead
   ============================================================ */
(function () {
  if (customElements.get('created-cart-drawer')) return;

  var root = (window.Shopify && Shopify.routes && Shopify.routes.root) || '/';

  class CartDrawer extends HTMLElement {
    connectedCallback() {
      if (this._init) return;
      this._init = true;

      this.sectionId = this.dataset.sectionId;
      // Theme settings → Cart drawer → "Cart to use": 'custom' or 'rebuy'
      this.provider = this.dataset.provider || 'custom';
      this.panel = this.querySelector('.cd__panel');
      this.toast = this.querySelector('[data-cd-toast]');
      this._pendingOpen = false;
      this._selfUntil = 0;

      this.addEventListener('click', this.onClick.bind(this));
      this.addEventListener('change', this.onChange.bind(this));
      this.addEventListener('keydown', this.onKeydown.bind(this));
      this.addEventListener('pointerdown', this.onDragStart.bind(this));
      this.addEventListener('dragstart', function (e) {
        if (e.target.closest('[data-cd-track]')) e.preventDefault();
      });


      window.CartDrawer = this;
      this.bindGlobal();
    }

    /* ---------- open / close ---------- */
    get isOpen() { return this.classList.contains('is-open'); }

    get usesRebuy() {
      return this.provider === 'rebuy' &&
        !!(window.Rebuy && Rebuy.SmartCart && typeof Rebuy.SmartCart.show === 'function');
    }

    // force: open this drawer even in Rebuy mode (theme editor preview)
    open(force) {
      if (!force && this.usesRebuy) {
        Rebuy.SmartCart.show();
        return;
      }
      if (this.isOpen) return;
      this._lastFocus = document.activeElement;
      this.classList.add('is-open');
      this.setAttribute('aria-hidden', 'false');
      document.documentElement.classList.add('cd-lock');
      var close = this.querySelector('.cd__close');
      setTimeout(function () { if (close) close.focus({ preventScroll: true }); }, 50);
      document.dispatchEvent(new CustomEvent('cart-drawer:open'));
    }

    close() {
      if (!this.isOpen) return;
      this.classList.remove('is-open');
      this.setAttribute('aria-hidden', 'true');
      document.documentElement.classList.remove('cd-lock');
      if (this._lastFocus && this._lastFocus.focus) this._lastFocus.focus({ preventScroll: true });
      document.dispatchEvent(new CustomEvent('cart-drawer:close'));
    }

    /* Don't auto-open while the page is leaving (e.g. a bundle redirecting to checkout)
       or when a script asked to skip it: window.CartDrawerSkipOpenUntil = Date.now() + ms */
    get skipAutoOpen() {
      return this._leaving || Date.now() < (window.CartDrawerSkipOpenUntil || 0);
    }

    /* ---------- rendering ---------- */
    refresh(open) {
      var self = this;
      if (open && this.skipAutoOpen) open = false;
      if (this.usesRebuy) {
        // Rebuy keeps its own cart in sync; just show it when asked to open
        if (open) {
          var sync = typeof Rebuy.SmartCart.sync === 'function' ? Rebuy.SmartCart.sync() : null;
          Promise.resolve(sync).catch(function () {}).then(function () { Rebuy.SmartCart.show(); });
        }
        return;
      }
      this._pendingOpen = this._pendingOpen || !!open;
      clearTimeout(this._refreshTimer);
      this._refreshTimer = setTimeout(function () {
        var shouldOpen = self._pendingOpen;
        self._pendingOpen = false;
        fetch(root + '?sections=' + encodeURIComponent(self.sectionId), { credentials: 'same-origin' })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            self.render(data[self.sectionId]);
            self.stripInBackground();
            if (shouldOpen && !self.skipAutoOpen) {
              self.open();
              // apps (Okendo, BOGOS, Rebuy...) may add a discount or gift a moment after Add to Cart
              clearTimeout(self._followUpTimer);
              self._followUpTimer = setTimeout(function () { self.refresh(false); }, 1500);
            }
          })
          .catch(function (e) { console.error('cart-drawer refresh', e); });
      }, 80);
    }

    render(html) {
      if (!html) return;
      var next = new DOMParser().parseFromString(html, 'text/html').querySelector('[data-cd-content]');
      var current = this.querySelector('[data-cd-content]');
      if (!next || !current) return;

      // nothing changed (e.g. the follow-up check after Add to Cart): don't redraw, so nothing flickers
      var nextHtml = next.outerHTML;
      if (nextHtml === this._lastHtml && !current.querySelector('.is-loading')) return;
      this._lastHtml = nextHtml;

      var scroller = this.querySelector('[data-cd-body]');
      var track = current.querySelector('[data-cd-track]');
      var scrollTop = scroller ? scroller.scrollTop : 0;
      var scrollLeft = track ? track.scrollLeft : 0;
      var focusedKey = document.activeElement && document.activeElement.closest && document.activeElement.closest('.cd-item');
      focusedKey = focusedKey ? focusedKey.dataset.key : null;

      current.replaceWith(next);

      var newTrack = next.querySelector('[data-cd-track]');
      if (scroller) scroller.scrollTop = scrollTop;
      if (newTrack) newTrack.scrollLeft = scrollLeft;
      if (focusedKey) {
        var row = next.querySelector('.cd-item[data-key="' + CSS.escape(focusedKey) + '"] [data-cd-qty]');
        if (row) row.focus({ preventScroll: true });
      }

      var count = parseInt(next.dataset.itemCount, 10) || 0;
      this.updateCount(count);
      document.dispatchEvent(new CustomEvent('cart-drawer:updated', { detail: { itemCount: count } }));
    }

    updateCount(count) {
      document.querySelectorAll('.created-header__count, [js-cart-counter]').forEach(function (el) {
        el.textContent = count;
        el.hidden = count < 1;
      });
    }

    /* ---------- cart requests ---------- */
    request(url, body) {
      var self = this;
      body.sections = this.sectionId;
      body.sections_url = window.location.pathname;
      this._selfUntil = Date.now() + 3000;
      this.classList.add('is-busy');
      return fetch(root + url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body)
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.status && data.status !== 200) throw new Error(data.description || data.message);
          // show the result right away; leftover bundle codes are cleaned up afterwards
          if (data.sections) self.render(data.sections[self.sectionId]);
          else self.refresh(false);
          // change.js returns the cart: no codes on it means nothing to clean up
          if (!data.discount_codes || data.discount_codes.length) self.stripInBackground();
          return data;
        })
        .catch(function (e) {
          self.showToast(e.message || 'Something went wrong. Please try again.');
          self.refresh(false);
        })
        .finally(function () { self.classList.remove('is-busy'); });
    }

    /* snippets/byb-cart-reset.liquid: remove leftover bundle discount codes before showing totals.
       Resolves to true when a code was removed. */
    stripBundleCode() {
      if (typeof window.bybStripBundleCode !== 'function') return Promise.resolve(false);
      this._selfUntil = Date.now() + 3000;
      return Promise.resolve(window.bybStripBundleCode()).catch(function () { return false; });
    }

    // runs after the drawer is already updated, so it never slows down add / quantity / remove
    stripInBackground() {
      var self = this;
      this.stripBundleCode().then(function (changed) {
        if (changed) self.refresh(false); // a code was removed: show the corrected totals
      });
    }

    changeLine(key, quantity) {
      var row = this.querySelector('.cd-item[data-key="' + CSS.escape(key) + '"]');
      if (row) row.classList.add('is-loading');
      return this.request('cart/change.js', { id: key, quantity: Math.max(0, quantity) });
    }

    addVariant(id) {
      return this.request('cart/add.js', { items: [{ id: Number(id), quantity: 1 }] });
    }

    showToast(message) {
      if (!this.toast) return;
      var toast = this.toast;
      toast.textContent = message;
      toast.hidden = false;
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(function () { toast.hidden = true; }, 4000);
    }

    /* ---------- upsell: drag to scroll with the mouse ---------- */
    onDragStart(e) {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      var track = e.target.closest('[data-cd-track]');
      if (!track || e.target.closest('button')) return;

      var self = this;
      var startX = e.clientX;
      var startLeft = track.scrollLeft;
      var moved = false;

      function move(ev) {
        var dx = ev.clientX - startX;
        if (!moved && Math.abs(dx) > 5) {
          moved = true;
          track.classList.add('is-dragging');
        }
        if (moved) {
          ev.preventDefault();
          track.scrollLeft = startLeft - dx;
        }
      }
      function up() {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        track.classList.remove('is-dragging');
        if (moved) {
          // swallow the click that follows a drag so links don't open
          self._suppressClick = true;
          setTimeout(function () { self._suppressClick = false; }, 0);
        }
      }
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    }

    /* ---------- events inside the drawer ---------- */
    onClick(e) {
      var t = e.target;
      if (this._suppressClick && t.closest('[data-cd-track]')) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (t.closest('[data-cd-close]')) { e.preventDefault(); this.close(); return; }

      var step = t.closest('[data-cd-step]');
      if (step) {
        var self = this;
        var item = step.closest('.cd-item');
        var input = item.querySelector('[data-cd-qty]');
        var key = item.dataset.key;
        var qty = Math.max(0, (parseInt(input.value, 10) || 0) + parseInt(step.dataset.cdStep, 10));
        // show the new number at once; quick repeated clicks are sent as one request
        input.value = qty;
        this._qtyTimers = this._qtyTimers || {};
        clearTimeout(this._qtyTimers[key]);
        this._qtyTimers[key] = setTimeout(function () {
          delete self._qtyTimers[key];
          self.changeLine(key, qty);
        }, 250);
        return;
      }

      var remove = t.closest('[data-cd-remove]');
      if (remove) { this.changeLine(remove.closest('.cd-item').dataset.key, 0); return; }

      var add = t.closest('[data-cd-add]');
      if (add) {
        add.classList.add('is-loading');
        add.disabled = true;
        this.addVariant(add.dataset.cdAdd);
        return;
      }

      var checkout = t.closest('.cd__checkout');
      if (checkout && !checkout.disabled) checkout.classList.add('is-loading');
    }

    onChange(e) {
      var input = e.target.closest('[data-cd-qty]');
      if (!input) return;
      this.changeLine(input.closest('.cd-item').dataset.key, parseInt(input.value, 10) || 0);
    }

    onKeydown(e) {
      if (e.key === 'Escape') { this.close(); return; }
      if (e.key !== 'Tab' || !this.isOpen) return;
      var focusable = Array.prototype.filter.call(
        this.panel.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])'),
        function (el) { return el.offsetParent !== null; }
      );
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    /* ---------- site-wide hooks ---------- */
    bindGlobal() {
      var self = this;

      // Header cart icon (capture phase so no other cart can take over)
      document.addEventListener('click', function (e) {
        var btn = e.target.closest && e.target.closest('[js-open-cart-drawer]');
        if (!btn) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        self.open();
        self.refresh(false);
      }, true);

      // theme.CartAPI (product form, product cards) + other theme scripts
      document.addEventListener('cart:add:complete', function () { self.refresh(true); });
      ['cart:update:complete', 'cart:refresh'].forEach(function (name) {
        document.addEventListener(name, function () { self.refresh(false); });
      });

      // Rebuy widgets
      document.addEventListener('rebuy:cart.add', function () { self.refresh(true); });
      document.addEventListener('rebuy:cart.change', function () { self.refresh(false); });
      if (this.provider !== 'rebuy') {
        document.addEventListener('rebuy:smartcart.show', function () {
          try { window.Rebuy.SmartCart.hide(); } catch (err) {}
          self.refresh(true);
        });
      }

      // Any other script that talks to the cart directly (fetch or XHR)
      if ('PerformanceObserver' in window) {
        try {
          new PerformanceObserver(function (list) {
            list.getEntries().forEach(function (entry) {
              if (Date.now() < self._selfUntil) return;
              if (/\/cart\/add(\.js)?(\?|$)/.test(entry.name)) self.refresh(true);
              else if (/\/cart\/(change|update|clear)(\.js)?(\?|$)/.test(entry.name)) self.refresh(false);
              // apps that change the cart through the Storefront API instead of /cart/*.js
              else if (self.isOpen && /\/api\/(unstable|\d{4}-\d{2})\/graphql\.json/.test(entry.name)) self.refresh(false);
            });
          }).observe({ type: 'resource', buffered: false });
        } catch (err) {}
      }

      // Leaving the page (checkout redirect etc.): never pop the drawer open on the way out
      window.addEventListener('beforeunload', function () { self._leaving = true; });

      // Back/forward cache
      window.addEventListener('pageshow', function (e) {
        if (!e.persisted) return;
        self._leaving = false;
        self.refresh(false);
      });

      // Theme editor: show the drawer while editing it
      document.addEventListener('shopify:section:select', function (e) {
        if (e.detail && e.detail.sectionId === self.sectionId) self.open(true);
      });
      document.addEventListener('shopify:section:deselect', function (e) {
        if (e.detail && e.detail.sectionId === self.sectionId) self.close();
      });
    }
  }

  customElements.define('created-cart-drawer', CartDrawer);
})();
