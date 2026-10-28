/* sections/the-lid — self-init Flickity, arrows, 01/03 counter */
(function () {
  function pad(n){ return (n < 10 ? '0' : '') + n; }
  function init(root) {
    var comp = root.querySelector('.the-lid__slider');
    if (!comp || comp._tl) return;
    if (typeof Flickity === 'undefined') return setTimeout(function(){ init(root); }, 200);

    var track = comp.querySelector('[js-carousel]') || comp;
    var prev = root.querySelector('.the-lid__arrows [js-prev-button]');
    var next = root.querySelector('.the-lid__arrows [js-next-button]');
    var cur  = root.querySelector('[data-current]');

    var f = Flickity.data(track) || new Flickity(track, {
      cellSelector: '[js-carousel-slide]', cellAlign: 'left', contain: true,
      pageDots: false, prevNextButtons: false, groupCells: false, wrapAround: false
    });
    comp._tl = true;

  if (prev) {
  prev.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();

    var current = typeof f.selectedIndex === 'number'
      ? f.selectedIndex
      : 0;

    if (current <= 0) return;

    f.select(current - 1);
  }, true);
}

if (next) {
  next.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();

    var current = typeof f.selectedIndex === 'number'
      ? f.selectedIndex
      : 0;

    var last = f.slides
      ? f.slides.length - 1
      : 0;

    if (current >= last) return;

    f.select(current + 1);
  }, true);
}

function update() {
  var current = typeof f.selectedIndex === 'number'
    ? f.selectedIndex
    : 0;

  var last = f.slides
    ? f.slides.length - 1
    : 0;

  if (cur) {
    cur.textContent = pad(current + 1);
  }

  if (prev) {
    var atStart = current <= 0;

    prev.classList.toggle('the-lid__arrow--off', atStart);
    prev.disabled = atStart;
    prev.setAttribute('aria-disabled', atStart ? 'true' : 'false');
  }

  if (next) {
    var atEnd = current >= last;

    next.classList.toggle('the-lid__arrow--off', atEnd);
    next.disabled = atEnd;
    next.setAttribute('aria-disabled', atEnd ? 'true' : 'false');
  }
}
    f.on('change', update); f.on('select', update); f.on('settle', update);
    setTimeout(function(){ f.resize(); update(); }, 300);
    update();
  }
  function run(scope){ (scope||document).querySelectorAll('.the-lid').forEach(init); }
  if (document.readyState !== 'loading') run();
  else document.addEventListener('DOMContentLoaded', function(){ run(); });
  document.addEventListener('shopify:section:load', function(e){ if (e.target.querySelector) run(e.target); });
})();
