(function () {
  if (window.__shopCatLoaded) return;
  window.__shopCatLoaded = true;

  var desktop = window.matchMedia('(min-width: 750px)');

  function ShopCat(el) {
    var self = this;
    this.el = el;
    this.cards = [].slice.call(el.querySelectorAll('.shop-cat__card'));

    this.cards.forEach(function (card) {
      var btn = card.querySelector('.js-sc-toggle');
      btn.addEventListener('click', function () {
        card.classList.contains('is-open') ? self.close(card) : self.open(card);
      });
    });

    // Esc closes the open dropdown
    el.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var open = el.querySelector('.shop-cat__card.is-open');
      if (!open) return;
      self.close(open);
      open.querySelector('.js-sc-toggle').focus();
    });

    // card marked "open on desktop" starts open (desktop only)
    if (desktop.matches) {
      var first = this.cards.filter(function (c) { return c.dataset.openDefault === 'true'; })[0];
      if (first) this.open(first);
    }
  }

  ShopCat.prototype.open = function (card) {
    var self = this;
    this.cards.forEach(function (c) { if (c !== card) self.close(c); }); // one at a time
    card.classList.add('is-open');
    card.querySelector('.js-sc-toggle').setAttribute('aria-expanded', 'true');
  };

  ShopCat.prototype.close = function (card) {
    card.classList.remove('is-open');
    card.querySelector('.js-sc-toggle').setAttribute('aria-expanded', 'false');
  };

  function init(root) {
    root.querySelectorAll('.shop-cat').forEach(function (s) {
      if (!s.__sc) s.__sc = new ShopCat(s);
    });
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', function () { init(document); })
    : init(document);

  /* Theme editor: selecting a card block opens its dropdown */
  document.addEventListener('shopify:section:load', function (e) { init(e.target); });
  document.addEventListener('shopify:block:select', function (e) {
    var s = e.target.closest('.shop-cat');
    if (s && s.__sc && e.target.classList.contains('shop-cat__card')) s.__sc.open(e.target);
  });
})();
