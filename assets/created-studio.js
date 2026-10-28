(function () {
  if (window.__createdStudioLoaded) return;
  window.__createdStudioLoaded = true;

  function init(root) {
    root.querySelectorAll('.created-studio__slider').forEach(function (slider) {
      if (!slider.isConnected || window.Flickity.data(slider)) return;

      new window.Flickity(slider, {
        cellAlign: 'left',
        contain: true,
        cellSelector: '.created-studio__card',
        prevNextButtons: false,
        pageDots: false
      });
    });
  }

  var tries = 0;
  var timer = setInterval(function () {
    if (!window.Flickity || document.readyState === 'loading') {
      if (++tries >= 100) clearInterval(timer);
      return;
    }

    clearInterval(timer);
    init(document);

    document.addEventListener('shopify:section:load', function (event) {
      init(event.target);
    });

    document.addEventListener('shopify:section:unload', function (event) {
      event.target.querySelectorAll('.created-studio__slider').forEach(function (slider) {
        var instance = window.Flickity.data(slider);
        if (instance) instance.destroy();
      });
    });

    document.addEventListener('shopify:block:select', function (event) {
      var card = event.target.closest('.created-studio__card');
      var section = event.target.closest('.created-studio');
      if (!card || !section) return;

      var instance = window.Flickity.data(
        section.querySelector('.created-studio__slider')
      );

      if (instance) instance.selectCell(card, false, true);
    });
  }, 50);
})();