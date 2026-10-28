(function () {
  if (window.__rvLoaded) return;
  window.__rvLoaded = true;

  /* Flickity comes from theme.js — wait until it's available */
  function whenFlickity(cb) {
    if (window.Flickity) return cb();
    var tries = 0;
    var t = setInterval(function () {
      if (window.Flickity) { clearInterval(t); cb(); }
      else if (++tries > 100) { clearInterval(t); console.warn('Reviews slider: Flickity not found (theme.js)'); }
    }, 50);
  }

  function Reviews(el) {
    var self = this;
    this.el = el;
    this.node = el.querySelector('.js-rv-slider');
    this.prev = el.querySelector('.js-rv-prev');
    this.next = el.querySelector('.js-rv-next');
    if (!this.node || this.node.children.length < 2) return;

    this.flkty = new Flickity(this.node, {
      cellAlign: 'left',
      contain: true,
      prevNextButtons: false,
      pageDots: false,
      cellSelector: '.rv__cell'
    });

    // move one position that actually changes the view (contain can stack end slides)
    function go(dir) {
      var f = self.flkty;
      var cur = f.selectedSlide.target;
      for (var n = f.selectedIndex + dir; n >= 0 && n < f.slides.length; n += dir) {
        if (Math.abs(f.slides[n].target - cur) > 1) return f.select(n);
      }
    }
    if (this.prev) this.prev.addEventListener('click', function () { go(-1); });
    if (this.next) this.next.addEventListener('click', function () { go(1); });

    this.flkty.on('select', function () { self.update(); });
    this.flkty.on('settle', function () { self.update(); });
    window.addEventListener('resize', function () { self.update(); });
    this.update();
  }

  Reviews.prototype.update = function () {
    var f = this.flkty;
    if (!f || !this.prev) return;
    var i = f.selectedIndex;
    var cur = f.slides[i] ? f.slides[i].target : 0;
    var canNext = f.slides.slice(i + 1).some(function (s) { return Math.abs(s.target - cur) > 1; });
    this.prev.disabled = i <= 0;
    this.next.disabled = !canNext;
  };

  Reviews.prototype.destroy = function () { if (this.flkty) this.flkty.destroy(); };

  function init(root) {
    root.querySelectorAll('.rv').forEach(function (s) {
      if (s.__rv) return;
      whenFlickity(function () { if (!s.__rv) s.__rv = new Reviews(s); });
    });
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', function () { init(document); })
    : init(document);

  /* Theme editor */
  document.addEventListener('shopify:section:load', function (e) { init(e.target); });
  document.addEventListener('shopify:section:unload', function (e) {
    var s = e.target.querySelector('.rv');
    if (s && s.__rv) s.__rv.destroy();
  });
  document.addEventListener('shopify:block:select', function (e) {
    var s = e.target.closest('.rv');
    if (!s || !s.__rv || !s.__rv.flkty) return;
    s.__rv.flkty.selectCell(e.target);
  });
})();
