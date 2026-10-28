/* sections/inside-scout — markers activate cards; mobile uses the CSS
   scroll-snap slider (NO Flickity, so cards can't get mis-measured). */
(function () {
  function init(root) {
    if (root._is) return;
    var markers = Array.prototype.slice.call(root.querySelectorAll('.iscout__marker'));
    var cards   = Array.prototype.slice.call(root.querySelectorAll('.iscout__card'));
    if (!markers.length || !cards.length) return;
    root._is = true;

    var isMobile = function () { return window.matchMedia('(max-width: 749px)').matches; };

    function activate(i, userInitiated) {
      markers.forEach(function (m, idx) { m.classList.toggle('is-active', idx === i); });
      cards.forEach(function (c, idx) { c.classList.toggle('is-active', idx === i); });
      if (!userInitiated) return;
      if (isMobile() && cards[i]) {
        cards[i].scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
      }
    }

    markers.forEach(function (m, i) {
      m.addEventListener('click', function () { activate(i, true); });
      m.addEventListener('mouseenter', function () {
        if (isMobile()) return; // touch devices pe hover skip
        activate(i, false);
      });
    });

    cards.forEach(function (c, i) {
      c.addEventListener('click', function () { activate(i, true); });
      c.addEventListener('mouseenter', function () {
        if (isMobile()) return;
        activate(i, false);
      });
    });

    activate(0, false); // default state, no scroll
  }

  function run(scope) { (scope || document).querySelectorAll('.iscout').forEach(init); }
  if (document.readyState !== 'loading') run();
  else document.addEventListener('DOMContentLoaded', function () { run(); });
  document.addEventListener('shopify:section:load', function (e) { if (e.target.querySelector) run(e.target); });
  window.addEventListener('load', function () { run(); });
})();