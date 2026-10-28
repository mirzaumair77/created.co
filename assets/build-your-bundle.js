(function () {
  if (window.__bybLoaded) return;
  window.__bybLoaded = true;

  var CHECKOUT_FLAG = 'byb:checkout'; // read by snippets/byb-cart-reset.liquid

  /* Flickity comes from theme.js, so wait until it's available */
  function whenFlickity(cb) {
    if (window.Flickity) return cb();
    var tries = 0;
    var t = setInterval(function () {
      if (window.Flickity) { clearInterval(t); cb(); }
      else if (++tries > 100) { clearInterval(t); console.warn('Bundle: Flickity not found (theme.js)'); }
    }, 50);
  }

  /* Shopify money format, e.g. "${{amount}}" */
  function formatMoney(cents, format) {
    cents = Math.round(cents);
    function fmt(n, dec, thou, decSep) {
      var parts = (n / 100).toFixed(dec).split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, thou);
      return parts.join(decSep);
    }
    return format.replace(/\{\{\s*(\w+)\s*\}\}/, function (_, key) {
      switch (key) {
        case 'amount_no_decimals': return fmt(cents, 0, ',', '.');
        case 'amount_with_comma_separator': return fmt(cents, 2, '.', ',');
        case 'amount_no_decimals_with_comma_separator': return fmt(cents, 0, '.', ',');
        case 'amount_with_apostrophe_separator': return fmt(cents, 2, "'", '.');
        default: return fmt(cents, 2, ',', '.');
      }
    });
  }

  /* "$40.00" → "$40" for the small per-line prices, like the design */
  function formatShort(cents, format) {
    var s = formatMoney(cents, format);
    return cents % 100 === 0 ? s.replace(/[.,]00(?=\D*$)/, '') : s;
  }

  function escapeHtml(str) {
    var d = document.createElement('div');
    d.textContent = str == null ? '' : String(str);
    return d.innerHTML;
  }

  function fillTemplate(tpl, b) {
    return (tpl || '')
      .replace(/\[percent\]/g, b.percent)
      .replace(/\[min\]/g, b.min)
      .replace(/\[max\]/g, b.max);
  }

  function tileData(tile) {
    return {
      id: Number(tile.dataset.variant),
      price: Number(tile.dataset.price),
      title: tile.dataset.title,
      image: tile.dataset.image,
      tile: tile
    };
  }

  function Bundle(el) {
    var self = this;
    this.el = el;

    var moneyEl = el.querySelector('.js-byb-money');
    this.moneyFormat = moneyEl ? JSON.parse(moneyEl.textContent) : '${{amount}}';

    this.dialog = el.querySelector('.js-byb-dialog');
    this.list = el.querySelector('.js-byb-list');
    this.empty = el.querySelector('.js-byb-empty');
    this.buildBtn = el.querySelector('.js-byb-build');
    this.hint = el.querySelector('.js-byb-hint');
    this.note = el.querySelector('.js-byb-note');
    this.modeBtns = [].slice.call(el.querySelectorAll('.js-byb-mode'));

    /*
      One state per bundle.
      steps: picks[stepIndex] = { id, price, title, image, qty: 1 } (one per step)
      qty:   items = [{ id, price, title, image, qty }] in the order they were added
    */
    this.bundles = {};
    this.panels = [].slice.call(el.querySelectorAll('.js-byb-bundle'));
    this.panels.forEach(function (panel) {
      var type = panel.dataset.type;
      var steps = panel.querySelectorAll('.byb-step').length;
      var b = {
        key: panel.dataset.bundle,
        type: type,
        panel: panel,
        label: panel.dataset.label || '',
        percent: parseFloat(panel.dataset.percent) || 0,
        code: panel.dataset.code || '',
        note: panel.dataset.note || '',
        steps: steps,
        min: type === 'qty' ? (parseInt(panel.dataset.min, 10) || 3) : steps,
        max: type === 'qty' ? (parseInt(panel.dataset.maxItem, 10) || 10) : 1, // per product
        picks: new Array(steps).fill(null),
        items: []
      };
      self.bundles[b.key] = b;
    });

    var firstVisible = this.panels.filter(function (p) { return !p.hidden; })[0] || this.panels[0];
    this.active = firstVisible ? firstVisible.dataset.bundle : null;

    this.initSlider();
    this.bindDialog();
    this.bindModes();
    this.bindStepTiles();
    this.bindDragScroll();
    this.bindQtyTiles();
    this.buildBtn.addEventListener('click', this.build.bind(this));

    // coming back from checkout with the back button: reset the button
    window.addEventListener('pageshow', function (e) {
      if (e.persisted) self.buildBtn.classList.remove('is-loading');
    });

    this.render();
  }

  /* ---------- Page image slider (desktop only, via watchCSS) ---------- */
  Bundle.prototype.initSlider = function () {
    var node = this.el.querySelector('.js-byb-slider');
    if (!node || node.children.length < 2) return;
    var self = this;
    whenFlickity(function () {
      self.slider = new Flickity(node, {
        watchCSS: true, // CSS turns it off on mobile (2 × 2 grid)
        cellAlign: 'left',
        contain: true,
        prevNextButtons: false,
        pageDots: false
      });
      var prev = self.el.querySelector('.js-byb-prev');
      var next = self.el.querySelector('.js-byb-next');
      if (prev) prev.addEventListener('click', function () { self.slider.previous(); });
      if (next) next.addEventListener('click', function () { self.slider.next(); });
    });
  };

  /* ---------- Popup ---------- */
  Bundle.prototype.bindDialog = function () {
    var self = this;
    // the open button is handled by one click listener on the document (see bottom of file)
    var closeBtn = this.el.querySelector('.js-byb-close');
    if (closeBtn) closeBtn.addEventListener('click', function () { self.close(); });
    // close when clicking the dark background (outside the white box), not the scrollbar
    this.dialog.addEventListener('click', function (e) {
      if (e.target !== self.dialog) return;
      var r = self.dialog.getBoundingClientRect();
      var inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) self.close();
    });
    this.dialog.addEventListener('close', function () { document.documentElement.classList.remove('byb-lock'); });
  };

  Bundle.prototype.open = function () {
    if (this.dialog.open) return;
    this.lastFocus = document.activeElement;
    this.dialog.showModal();
    document.documentElement.classList.add('byb-lock');
  };

  Bundle.prototype.close = function () {
    if (!this.dialog.open) return;
    this.dialog.close();
    if (this.lastFocus) this.lastFocus.focus();
  };

  /* ---------- Toggle between the two bundles ---------- */
  Bundle.prototype.bindModes = function () {
    var self = this;
    this.modeBtns.forEach(function (btn) {
      btn.addEventListener('click', function () { self.setMode(btn.dataset.bundle); });
    });
  };

  Bundle.prototype.setMode = function (key) {
    if (!this.bundles[key] || key === this.active) return;
    this.active = key;
    this.modeBtns.forEach(function (b) {
      var on = b.dataset.bundle === key;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    var bundles = this.bundles;
    Object.keys(bundles).forEach(function (k) { bundles[k].panel.hidden = k !== key; });
    this.render();
  };

  /* ---------- Step rows: drag with the mouse to scroll sideways ----------
     Only when a row has more products than fit. The scrollbar is hidden in CSS;
     touch swipe and trackpad scroll work on their own. */
  Bundle.prototype.bindDragScroll = function () {
    var rows = [].slice.call(this.el.querySelectorAll('.byb-step__products'));
    if (!rows.length) return;

    function overflows(row) { return row.scrollWidth > row.clientWidth + 1; }

    rows.forEach(function (row) {
      var startX = 0, startScroll = 0, down = false, moved = false, pointerId = null;

      // stop the browser's own image / link drag, which cancels our drag
      row.addEventListener('dragstart', function (e) { e.preventDefault(); });

      // measure when the mouse comes over the row (the popup is open by then)
      row.addEventListener('pointerenter', function () {
        row.classList.toggle('is-draggable', overflows(row));
      });

      row.addEventListener('pointerdown', function (e) {
        if (e.pointerType !== 'mouse' || e.button !== 0 || !overflows(row)) return;
        e.preventDefault(); // no text selection / image drag; a normal click still fires
        down = true; moved = false; pointerId = e.pointerId;
        startX = e.clientX; startScroll = row.scrollLeft;
      });

      row.addEventListener('pointermove', function (e) {
        if (!down || e.pointerId !== pointerId) return;
        var dx = e.clientX - startX;
        if (!moved && Math.abs(dx) < 5) return; // small movement = normal click
        if (!moved) {
          moved = true;
          row.classList.add('is-dragging');
          try { row.setPointerCapture(pointerId); } catch (err) {}
        }
        row.scrollLeft = startScroll - dx;
      });

      function end() {
        if (!down) return;
        down = false;
        try { row.releasePointerCapture(pointerId); } catch (err) {}
        if (moved) setTimeout(function () { row.classList.remove('is-dragging'); }, 0);
      }
      row.addEventListener('pointerup', end);
      row.addEventListener('pointercancel', end);
      row.addEventListener('lostpointercapture', end);

      // a drag is not a click on a tile
      row.addEventListener('click', function (e) {
        if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; }
      }, true);
    });
  };

  /* ---------- Mode 1: one product per step ---------- */
  Bundle.prototype.bindStepTiles = function () {
    var self = this;
    this.panels.forEach(function (panel) {
      var b = self.bundles[panel.dataset.bundle];
      if (b.type !== 'steps') return;

      panel.querySelectorAll('.js-byb-tile').forEach(function (tile) {
        var step = parseInt(tile.dataset.step, 10);
        var btn = tile.querySelector('.js-byb-select');

        btn.addEventListener('click', function () {
          var wasSelected = tile.classList.contains('is-selected');

          panel.querySelectorAll('.js-byb-tile[data-step="' + step + '"]').forEach(function (t) {
            t.classList.remove('is-selected');
            t.querySelector('.js-byb-select').setAttribute('aria-pressed', 'false');
          });

          if (wasSelected) {
            b.picks[step] = null; // tap again to remove
          } else {
            tile.classList.add('is-selected');
            btn.setAttribute('aria-pressed', 'true');
            var pick = tileData(tile);
            pick.qty = 1;
            b.picks[step] = pick;
          }
          self.render();
        });
      });
    });
  };

  /* ---------- Mode 2: any pieces, any quantity ---------- */
  Bundle.prototype.bindQtyTiles = function () {
    var self = this;
    this.panels.forEach(function (panel) {
      var b = self.bundles[panel.dataset.bundle];
      if (b.type !== 'qty') return;
      b.tiles = [].slice.call(panel.querySelectorAll('.js-byb-tile'));

      b.tiles.forEach(function (tile) {
        tile.querySelector('.js-byb-plus').addEventListener('click', function () { self.changeQty(b, tile, 1); });
        tile.querySelector('.js-byb-minus').addEventListener('click', function () { self.changeQty(b, tile, -1); });
      });
    });
  };

  Bundle.prototype.totalQty = function (b) {
    if (b.type === 'steps') return b.picks.filter(Boolean).length;
    return b.items.reduce(function (sum, i) { return sum + i.qty; }, 0);
  };

  /* Per product: max per product (setting), or the stock if that's lower */
  Bundle.prototype.itemLimit = function (b, tile) {
    var limit = b.max;
    if (tile.dataset.stock !== '' && tile.dataset.stock != null) {
      limit = Math.min(limit, Math.max(0, parseInt(tile.dataset.stock, 10) || 0));
    }
    return limit;
  };

  Bundle.prototype.changeQty = function (b, tile, delta) {
    var id = Number(tile.dataset.variant);
    var item = b.items.filter(function (i) { return i.id === id; })[0];

    if (delta > 0) {
      if ((item ? item.qty : 0) >= this.itemLimit(b, tile)) return;
      if (!item) {
        item = tileData(tile);
        item.qty = 0;
        b.items.push(item);
      }
      item.qty += 1;
    } else if (item) {
      item.qty -= 1;
      if (item.qty <= 0) b.items.splice(b.items.indexOf(item), 1);
    }

    this.syncQtyTiles(b);
    this.render();
  };

  Bundle.prototype.syncQtyTiles = function (b) {
    var self = this;
    b.tiles.forEach(function (tile) {
      var id = Number(tile.dataset.variant);
      var item = b.items.filter(function (i) { return i.id === id; })[0];
      var qty = item ? item.qty : 0;
      var soldOut = tile.classList.contains('is-soldout');
      tile.classList.toggle('is-selected', qty > 0);
      tile.querySelector('.js-byb-qty-value').textContent = qty;
      tile.querySelector('.js-byb-minus').disabled = qty === 0;
      var limit = self.itemLimit(b, tile);
      var plus = tile.querySelector('.js-byb-plus');
      plus.disabled = soldOut || qty >= limit;
      plus.title = qty >= limit && limit > 0
        ? (limit < b.max ? 'Only ' + limit + ' in stock' : 'Max ' + limit + ' per product')
        : '';
    });
  };

  /* ---------- Summary ---------- */
  Bundle.prototype.current = function () { return this.bundles[this.active]; };

  Bundle.prototype.lines = function (b) {
    return b.type === 'steps' ? b.picks.filter(Boolean) : b.items;
  };

  Bundle.prototype.isComplete = function (b) {
    if (!b) return false;
    if (b.type === 'steps') return b.steps > 0 && b.picks.every(Boolean);
    return this.totalQty(b) >= b.min;
  };

  Bundle.prototype.render = function () {
    var b = this.current();
    var fmt = this.moneyFormat;
    var subtotal = 0;
    var html = '';

    if (b) {
      this.lines(b).forEach(function (p) {
        var line = p.price * p.qty;
        subtotal += line;
        html +=
          '<li class="byb-summary__row">' +
            '<span class="byb-summary__thumb">' + (p.image ? '<img src="' + escapeHtml(p.image) + '" alt="" loading="lazy">' : '') + '</span>' +
            '<span class="byb-summary__name">' + escapeHtml(p.title) +
              (p.qty > 1
                ? '<span class="byb-summary__badge">× ' + p.qty + '</span>' +
                  '<span class="byb-summary__each">' + p.qty + ' × ' + formatShort(p.price, fmt) + '</span>'
                : '') +
            '</span>' +
            '<span class="byb-summary__price">' + formatShort(line, fmt) + '</span>' +
          '</li>';
      });
    }

    this.list.innerHTML = html;
    if (this.empty) this.empty.hidden = html !== '';

    var complete = this.isComplete(b);
    var pct = b ? b.percent : 0;
    var saving = complete && pct > 0 ? Math.round(subtotal * pct / 100) : 0;

    this.el.querySelector('.js-byb-subtotal').textContent = formatMoney(subtotal, fmt);
    this.el.querySelector('.js-byb-total').textContent = formatMoney(subtotal - saving, fmt);

    // the discount line only shows once the bundle is complete
    this.el.querySelector('.js-byb-saving-row').hidden = !(complete && pct > 0);
    this.el.querySelector('.js-byb-pct').textContent = pct;
    this.el.querySelector('.js-byb-saving').textContent = '–' + formatMoney(saving, fmt);

    if (this.note) this.note.textContent = b ? fillTemplate(b.note, b) : '';

    this.buildBtn.disabled = !complete;
    this.setHint(b ? this.hintText(b, complete) : '');
  };

  Bundle.prototype.hintText = function (b, complete) {
    if (b.type === 'steps') {
      if (complete) return '';
      var left = b.picks.filter(function (p) { return !p; }).length;
      return left === 1 ? 'Pick 1 more product to unlock your bundle.' : 'Pick ' + left + ' more products to unlock your bundle.';
    }
    if (complete) return '';
    var total = this.totalQty(b);
    var need = b.min - total;
    var word = need === 1 ? 'piece' : 'pieces';
    return total === 0
      ? 'Add ' + need + ' ' + word + ' to unlock ' + b.percent + '%'
      : 'Add ' + need + ' more ' + word + ' to unlock ' + b.percent + '%';
  };

  Bundle.prototype.setHint = function (msg, isError) {
    if (!this.hint) return;
    this.hint.textContent = msg;
    this.hint.classList.toggle('is-error', !!isError);
  };

  /* ---------- Straight to checkout (cart permalink + discount code) ---------- */
  Bundle.prototype.build = function () {
    var b = this.current();
    if (!this.isComplete(b)) return;

    var root = (window.Shopify && Shopify.routes && Shopify.routes.root) || '/';
    var self = this;

    // same variant in two lines → merge the quantities
    var merged = {};
    var order = [];
    this.lines(b).forEach(function (p) {
      if (!merged[p.id]) order.push(p.id);
      merged[p.id] = (merged[p.id] || 0) + p.qty;
    });
    var lines = order.map(function (id) { return id + ':' + merged[id]; }).join(',');

    var params = [];
    if (b.code) params.push('discount=' + encodeURIComponent(b.code));
    if (b.label) params.push('attributes[Bundle]=' + encodeURIComponent(b.label));
    var url = root + 'cart/' + lines + (params.length ? '?' + params.join('&') : '');

    this.buildBtn.classList.add('is-loading');
    this.setHint('');

    // empty the cart first so checkout only has the bundle
    fetch(root + 'cart/clear.js', { method: 'POST', headers: { 'Accept': 'application/json' } })
      .catch(function () { /* still go to checkout */ })
      .then(function () {
        try { localStorage.setItem(CHECKOUT_FLAG, String(Date.now())); } catch (e) {}
        window.location.href = url;
      })
      .catch(function (err) {
        self.buildBtn.classList.remove('is-loading');
        self.setHint((err && err.message) || 'Something went wrong. Please try again.', true);
      });
  };

  Bundle.prototype.destroy = function () {
    if (this.slider) this.slider.destroy();
    if (this.dialog.open) this.dialog.close();
  };

  function init(root) {
    root.querySelectorAll('.byb').forEach(function (s) {
      if (s.__byb) return;
      try {
        s.__byb = new Bundle(s);
      } catch (err) {
        console.error('Build your bundle: setup failed', err);
      }
    });
  }

  /* "Build bundle" button: always opens the popup, even if setup failed or
     the theme re-rendered the section, so the button is never dead */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.js-byb-open') : null;
    if (!btn) return;
    var s = btn.closest('.byb');
    if (!s) return;
    e.preventDefault();
    if (!s.__byb) init(s.parentNode || document);
    if (s.__byb) { s.__byb.open(); return; }
    var dialog = s.querySelector('.js-byb-dialog');
    if (dialog && !dialog.open && dialog.showModal) dialog.showModal();
  });

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', function () { init(document); })
    : init(document);

  /* Theme editor */
  document.addEventListener('shopify:section:load', function (e) { init(e.target); });
  document.addEventListener('shopify:section:unload', function (e) {
    var s = e.target.querySelector('.byb');
    if (s && s.__byb) s.__byb.destroy();
  });
  document.addEventListener('shopify:block:select', function (e) {
    var s = e.target.closest('.byb');
    if (!s || !s.__byb) return;
    if (e.target.classList.contains('byb-step')) {
      s.__byb.setMode('1');
      s.__byb.open();
      e.target.scrollIntoView({ block: 'center' });
    } else if (s.__byb.slider && e.target.classList.contains('byb__slide')) {
      s.__byb.slider.selectCell(e.target);
    }
  });
  document.addEventListener('shopify:section:deselect', function (e) {
    var s = e.target.querySelector('.byb');
    if (s && s.__byb) s.__byb.close();
  });
})();