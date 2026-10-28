/* assets/category-slider.js
   Reliable Flickity slider with visible fallback.
   Supports both old js-* selectors and new data-cat-* selectors.
*/
(function () {
  'use strict';

  var RETRY_DELAY = 150;
  var MAX_RETRIES = 100;

  function getRoots(scope) {
    var roots = [];
    var target = scope || document;

    if (
      target.matches &&
      target.matches('.cat-slider')
    ) {
      roots.push(target);
    }

    if (target.querySelectorAll) {
      target
        .querySelectorAll('.cat-slider')
        .forEach(function (root) {
          if (roots.indexOf(root) === -1) {
            roots.push(root);
          }
        });
    }

    return roots;
  }

  function setArrowState(root, enabled) {
    root
      .querySelectorAll(
        '[data-cat-prev], ' +
        '[data-cat-next], ' +
        '[js-prev-button], ' +
        '[js-next-button]'
      )
      .forEach(function (button) {
        button.disabled = !enabled;

        button.classList.toggle(
          'cat-arrow--off',
          !enabled
        );

        button.setAttribute(
          'aria-disabled',
          enabled ? 'false' : 'true'
        );
      });
  }

  function refresh(root) {
    var flickity = root._catFlickity;

    if (!flickity) return;

    try {
      flickity.reloadCells();
      flickity.resize();

      setArrowState(
        root,
        flickity.cells &&
          flickity.cells.length > 1
      );
    } catch (error) {
      console.warn(
        'Category slider refresh error:',
        error
      );
    }
  }

  function bindControls(root) {
    if (root._catControlsBound) return;

    root._catControlsBound = true;

    var previous = root.querySelector(
      '[data-cat-prev], [js-prev-button]'
    );

    var next = root.querySelector(
      '[data-cat-next], [js-next-button]'
    );

    if (previous) {
      previous.addEventListener(
        'click',
        function (event) {
          event.preventDefault();

          if (
            root._catFlickity &&
            !previous.disabled
          ) {
            root._catFlickity.previous(true);
          }
        }
      );
    }

    if (next) {
      next.addEventListener(
        'click',
        function (event) {
          event.preventDefault();

          if (
            root._catFlickity &&
            !next.disabled
          ) {
            root._catFlickity.next(true);
          }
        }
      );
    }
  }

  function init(root) {
    if (
      !root ||
      root._catFlickity ||
      root._catInitializing
    ) {
      return;
    }

    var component = root.querySelector(
      '[data-cat-carousel], ' +
      '.cat-slider__carousel'
    );

    var track = root.querySelector(
      '[data-cat-track], [js-carousel]'
    );

    var slides = track
      ? track.querySelectorAll(
          '[data-cat-slide], ' +
          '[js-carousel-slide]'
        )
      : [];

    if (!track || !slides.length) return;

    bindControls(root);

    /*
     * Keep flex fallback visible while Flickity
     * is unavailable.
     */
    if (
      typeof window.Flickity === 'undefined'
    ) {
      root._catRetries =
        (root._catRetries || 0) + 1;

      root.classList.add(
        'is-fallback-ready'
      );

      setArrowState(root, false);

      if (
        root._catRetries <= MAX_RETRIES
      ) {
        clearTimeout(root._catRetryTimer);

        root._catRetryTimer = setTimeout(
          function () {
            init(root);
          },
          RETRY_DELAY
        );
      }

      return;
    }

    root._catInitializing = true;

    root.classList.add(
      'is-flickity-initializing'
    );

    try {
      var existing =
        window.Flickity.data(track) ||
        (
          component
            ? window.Flickity.data(component)
            : null
        );

      root._catFlickity =
        existing ||
        new window.Flickity(track, {
          cellSelector:
            '[data-cat-slide], ' +
            '[js-carousel-slide]',
          cellAlign: 'left',
          contain: true,
          prevNextButtons: false,
          pageDots: false,
          groupCells: false,
          wrapAround: true,
          freeScroll: false,
          draggable: true,
          dragThreshold: 5,
          imagesLoaded: true,
          percentPosition: true
        });

      root.classList.remove(
        'is-flickity-initializing',
        'is-fallback-ready'
      );

      root.classList.add(
        'is-flickity-ready'
      );

      root._catInitializing = false;

      setArrowState(
        root,
        root._catFlickity.cells &&
          root._catFlickity.cells.length > 1
      );

      if (
        typeof root._catFlickity.on ===
        'function'
      ) {
        root._catFlickity.on(
          'ready',
          function () {
            refresh(root);
          }
        );

        root._catFlickity.on(
          'settle',
          function () {
            refresh(root);
          }
        );
      }

      requestAnimationFrame(function () {
        refresh(root);
      });

      [100, 350, 800, 1600].forEach(
        function (delay) {
          setTimeout(function () {
            refresh(root);
          }, delay);
        }
      );

      root
        .querySelectorAll('img')
        .forEach(function (image) {
          if (!image.complete) {
            image.addEventListener(
              'load',
              function () {
                refresh(root);
              },
              { once: true }
            );

            image.addEventListener(
              'error',
              function () {
                refresh(root);
              },
              { once: true }
            );
          }
        });
    } catch (error) {
      root._catInitializing = false;
      root._catFlickity = null;

      root.classList.remove(
        'is-flickity-initializing',
        'is-flickity-ready'
      );

      root.classList.add(
        'is-fallback-ready'
      );

      setArrowState(root, false);

      console.warn(
        'Category slider initialization error:',
        error
      );
    }
  }

  function run(scope) {
    getRoots(scope).forEach(init);
  }

  if (
    document.readyState === 'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      function () {
        run(document);
      }
    );
  } else {
    run(document);
  }

  window.addEventListener(
    'load',
    function () {
      run(document);

      getRoots(document).forEach(refresh);
    }
  );

  window.addEventListener(
    'pageshow',
    function () {
      run(document);

      getRoots(document).forEach(refresh);
    }
  );

  window.addEventListener(
    'resize',
    function () {
      clearTimeout(
        window._catSliderResizeTimer
      );

      window._catSliderResizeTimer =
        setTimeout(function () {
          getRoots(document).forEach(
            refresh
          );
        }, 120);
    }
  );

  document.addEventListener(
    'shopify:section:load',
    function (event) {
      run(event.target);
    }
  );

  document.addEventListener(
    'shopify:section:unload',
    function (event) {
      getRoots(event.target).forEach(
        function (root) {
          clearTimeout(
            root._catRetryTimer
          );

          if (root._catFlickity) {
            root._catFlickity.destroy();
          }

          root._catFlickity = null;
        }
      );
    }
  );
})();