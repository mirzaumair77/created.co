/* assets/product-card-swatch.js
   A) Product colour swatch cards
   B) Shop All AJAX sorting, filtering, Clear All and pagination
*/

/* ============================================================
   A) PRODUCT SWATCH CARD
============================================================ */
(function () {
  'use strict';

  var MOBILE_QUERY = '(max-width: 749px)';

  function money(value) {
    return value == null ? '' : String(value);
  }
function cleanProductUrl(value) {
  if (!value) return '';

  try {
    var url = new URL(
      value,
      window.location.origin
    );

    [
      '_pos',
      '_fid',
      '_ss',
      '_sid'
    ].forEach(function (parameter) {
      url.searchParams.delete(parameter);
    });

    return (
      url.pathname +
      (
        url.searchParams.toString()
          ? '?' + url.searchParams.toString()
          : ''
      ) +
      url.hash
    );
  } catch (error) {
    return value;
  }
}
  class ProductSwatchCard extends HTMLElement {
    connectedCallback() {
      if (this._initialized) return;

      this._initialized = true;

      var dataElement = this.querySelector('.pcs__data');

      if (!dataElement) return;

      try {
        this.items = JSON.parse(dataElement.textContent);
      } catch (error) {
        console.error('Product swatch JSON error:', error);
        this.items = [];
        return;
      }

      if (!Array.isArray(this.items) || !this.items.length) {
        return;
      }

      this.linkElements = Array.prototype.slice.call(
        this.querySelectorAll('[data-pcs-link]')
      );

      this.imageElement = this.querySelector('.pcs__img');
      this.titleElement = this.querySelector('.pcs__title');
      this.subtitleElement = this.querySelector('.pcs__subtitle');
      this.priceElement = this.querySelector('.pcs__price');
      this.compareElement = this.querySelector('.pcs__compare');
      this.ratingWrapper = this.querySelector('.pcs__rating');
      this.starsElement = this.querySelector('.pcs__stars');
      this.ratingNumber = this.querySelector('.pcs__rating-num');
      this.ratingCount = this.querySelector('.pcs__rating-count');

      this.swatches = Array.prototype.slice.call(
        this.querySelectorAll('.pcs__swatch')
      );

      var self = this;

      this.swatches.forEach(function (button, index) {
        button.setAttribute('data-index', index);

        button.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();

          self.select(index);
        });

        button.addEventListener('mouseenter', function () {
          if (window.matchMedia('(hover: hover)').matches) {
            self.render(index);
          }
        });

        button.addEventListener('mouseleave', function () {
          if (window.matchMedia('(hover: hover)').matches) {
            self.render(self.selected);
          }
        });
      });

      this.initSwatchSlider();

      this.selected =
        parseInt(this.getAttribute('data-selected'), 10) || 0;

      if (!this.items[this.selected]) {
        this.selected = 0;
      }

      this.select(this.selected);
    }

    disconnectedCallback() {
      if (this._swatchResizeObserver) {
        this._swatchResizeObserver.disconnect();
      }

      if (this.swatchTrack && this._updateSwatchArrows) {
        this.swatchTrack.removeEventListener(
          'scroll',
          this._updateSwatchArrows
        );
      }

      if (this._swatchWindowResize) {
        window.removeEventListener(
          'resize',
          this._swatchWindowResize
        );
      }
    }

    initSwatchSlider() {
      /*
       * Mobile slider: more than 3 swatches.
       * Desktop slider: more than 5 swatches.
       */
      if (this.swatches.length <= 3) {
        return;
      }

      var track = this.querySelector('.pcs__swatches');

      if (!track || track.closest('.pcs__swatch-slider')) {
        return;
      }

      var slider = document.createElement('div');

      slider.className = 'pcs__swatch-slider';

      if (this.swatches.length <= 5) {
        slider.classList.add('is-mobile-only');
      }

      var previousButton = document.createElement('button');

      previousButton.type = 'button';
      previousButton.className =
        'pcs__swatch-arrow pcs__swatch-arrow--prev';
      previousButton.setAttribute(
        'aria-label',
        'Previous colours'
      );

      previousButton.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true">' +
          '<path d="M15 5l-7 7 7 7" ' +
          'fill="none" ' +
          'stroke="currentColor" ' +
          'stroke-width="1.7" ' +
          'stroke-linecap="round" ' +
          'stroke-linejoin="round"></path>' +
        '</svg>';

      var nextButton = document.createElement('button');

      nextButton.type = 'button';
      nextButton.className =
        'pcs__swatch-arrow pcs__swatch-arrow--next';
      nextButton.setAttribute(
        'aria-label',
        'Next colours'
      );

      nextButton.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true">' +
          '<path d="M9 5l7 7-7 7" ' +
          'fill="none" ' +
          'stroke="currentColor" ' +
          'stroke-width="1.7" ' +
          'stroke-linecap="round" ' +
          'stroke-linejoin="round"></path>' +
        '</svg>';

      track.parentNode.insertBefore(slider, track);

      slider.appendChild(previousButton);
      slider.appendChild(track);
      slider.appendChild(nextButton);

      track.classList.add('pcs__swatches--slider');

      this.swatchSlider = slider;
      this.swatchTrack = track;
      this.swatchPrevious = previousButton;
      this.swatchNext = nextButton;

      var self = this;

      function isMobile() {
        return window.matchMedia(MOBILE_QUERY).matches;
      }

      function sliderShouldBeActive() {
        if (isMobile()) {
          return self.swatches.length > 3;
        }

        return self.swatches.length > 5;
      }

      function getScrollAmount() {
        var firstSwatch = track.querySelector('.pcs__swatch');

        if (!firstSwatch) {
          return isMobile() ? 49 : 74;
        }

        var styles = window.getComputedStyle(track);

        var gap =
          parseFloat(styles.columnGap) ||
          parseFloat(styles.gap) ||
          4;

        return firstSwatch.getBoundingClientRect().width + gap;
      }

      function updateArrows() {
        if (!sliderShouldBeActive()) {
          previousButton.disabled = true;
          nextButton.disabled = true;
          return;
        }

        var maximumScroll = Math.max(
          track.scrollWidth - track.clientWidth,
          0
        );

        var atStart = track.scrollLeft <= 2;

        var atEnd =
          track.scrollLeft >= maximumScroll - 2;

        previousButton.disabled =
          atStart || maximumScroll <= 2;

        nextButton.disabled =
          atEnd || maximumScroll <= 2;
      }

      function updateSliderMode() {
        var active = sliderShouldBeActive();

        slider.classList.toggle('is-active', active);
        slider.classList.toggle('is-inactive', !active);

        track.classList.toggle(
          'pcs__swatches--slider',
          active
        );

        if (!active) {
          track.scrollLeft = 0;
          previousButton.disabled = true;
          nextButton.disabled = true;
          return;
        }

        updateArrows();
      }

      previousButton.addEventListener(
        'click',
        function (event) {
          event.preventDefault();
          event.stopPropagation();

          if (previousButton.disabled) return;

          track.scrollBy({
            left: -getScrollAmount(),
            behavior: 'smooth'
          });
        }
      );

      nextButton.addEventListener(
        'click',
        function (event) {
          event.preventDefault();
          event.stopPropagation();

          if (nextButton.disabled) return;

          track.scrollBy({
            left: getScrollAmount(),
            behavior: 'smooth'
          });
        }
      );

      this._updateSwatchArrows = updateArrows;

      track.addEventListener(
        'scroll',
        updateArrows,
        { passive: true }
      );

      this._swatchWindowResize = function () {
        updateSliderMode();

        setTimeout(updateArrows, 50);
      };

      window.addEventListener(
        'resize',
        this._swatchWindowResize
      );

      if ('ResizeObserver' in window) {
        this._swatchResizeObserver =
          new ResizeObserver(function () {
            updateSliderMode();
          });

        this._swatchResizeObserver.observe(track);
      }

      requestAnimationFrame(function () {
        updateSliderMode();
      });

      setTimeout(updateSliderMode, 100);
      setTimeout(updateSliderMode, 500);
    }

    select(index) {
      if (!this.items[index]) return;

      this.selected = index;

      this.setAttribute('data-selected', index);

      this.swatches.forEach(function (swatch, swatchIndex) {
        var active = swatchIndex === index;

        swatch.classList.toggle('is-active', active);

        swatch.setAttribute(
          'aria-pressed',
          active ? 'true' : 'false'
        );
      });

      this.render(index);
    }

    render(index) {
      var data = this.items[index];

      if (!data) return;

      if (this.imageElement && data.image) {
        this.imageElement.removeAttribute('srcset');
        this.imageElement.src = data.image;

        this.imageElement.alt =
          data.imageAlt || data.title || '';
      }

      if (this.titleElement) {
        this.titleElement.textContent = data.title || '';
      }

      if (this.priceElement) {
        this.priceElement.textContent = money(data.price);
      }

      if (this.subtitleElement) {
        this.subtitleElement.textContent =
          data.subtitle || '';

        this.subtitleElement.hidden =
          !data.subtitle;
      }

      if (this.compareElement) {
        if (data.onSale && data.compareAt) {
          this.compareElement.textContent =
            money(data.compareAt);

          this.compareElement.hidden = false;
        } else {
          this.compareElement.textContent = '';
          this.compareElement.hidden = true;
        }
      }

      var rating = Number(data.rating) || 0;

      var reviewCount =
        parseInt(data.ratingCount, 10) || 0;

      var hasReviews =
        rating > 0 && reviewCount > 0;

      var formattedRating = rating
        .toFixed(1)
        .replace(/\.0$/, '');

      if (this.ratingWrapper) {
        this.ratingWrapper.removeAttribute('hidden');

        this.ratingWrapper.classList.toggle(
          'is-empty',
          !hasReviews
        );

        if (hasReviews) {
          this.ratingWrapper.setAttribute(
            'aria-label',
            formattedRating +
              ' out of 5 stars, based on ' +
              reviewCount +
              ' reviews'
          );
        } else {
          this.ratingWrapper.removeAttribute('aria-label');
        }
      }

      if (this.starsElement) {
        this.starsElement.style.setProperty(
          '--rating',
          rating
        );

        this.starsElement.style.setProperty(
          '--pcs-fill',
          (rating / 5) * 100 + '%'
        );
      }

      if (this.ratingNumber) {
        this.ratingNumber.textContent =
          formattedRating;
      }

      if (this.ratingCount) {
        this.ratingCount.textContent =
          '(' + reviewCount + ')';
      }

 this.linkElements.forEach(function (link) {
  if (data.url) {
    link.setAttribute(
      'href',
      cleanProductUrl(data.url)
    );
  }

  if (data.title) {
    link.setAttribute(
      'aria-label',
      data.title
    );
  }
});
    }
  }

  if (!customElements.get('product-swatch-card')) {
    customElements.define(
      'product-swatch-card',
      ProductSwatchCard
    );
  }
})();

/* ============================================================
   B) SHOP ALL AJAX
============================================================ */
(function () {
  'use strict';

  var section = document.querySelector('.shopall');

  if (!section) return;

  var activeController = null;

  function startLoading() {
    section.classList.add('is-loading');
    section.setAttribute('aria-busy', 'true');
  }

  function stopLoading() {
    section.classList.remove('is-loading');
    section.removeAttribute('aria-busy');
  }

  function replaceRequired(newSection, selector) {
    var currentElement =
      section.querySelector(selector);

    var newElement =
      newSection.querySelector(selector);

    if (!currentElement || !newElement) {
      throw new Error(
        'Missing AJAX element: ' + selector
      );
    }

    currentElement.replaceWith(newElement);
  }

  function loadUrl(
    url,
    pushState,
    shouldScroll
  ) {
    var targetUrl = new URL(
      url,
      window.location.origin
    );

    if (activeController) {
      activeController.abort();
    }

    activeController =
      'AbortController' in window
        ? new AbortController()
        : null;

    startLoading();

    fetch(targetUrl.toString(), {
      headers: {
        'X-Requested-With': 'XMLHttpRequest'
      },
      signal: activeController
        ? activeController.signal
        : undefined
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error(
            'Request failed with status ' +
              response.status
          );
        }

        return response.text();
      })
      .then(function (html) {
        var newDocument =
          new DOMParser().parseFromString(
            html,
            'text/html'
          );

        var newSection =
          newDocument.querySelector('.shopall');

        if (!newSection) {
          throw new Error(
            'Shop All section was not found'
          );
        }

        replaceRequired(
          newSection,
          '.shopall__bar'
        );

        replaceRequired(
          newSection,
          '[data-shopall-content]'
        );

        if (pushState) {
          history.pushState(
            { shopall: true },
            '',
            targetUrl.pathname + targetUrl.search
          );
        }

        document.dispatchEvent(
          new CustomEvent('shopall:updated', {
            detail: {
              url:
                targetUrl.pathname +
                targetUrl.search
            }
          })
        );

        stopLoading();

        if (shouldScroll !== false) {
          section.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }
      })
      .catch(function (error) {
        if (
          error &&
          error.name === 'AbortError'
        ) {
          return;
        }

        console.error(
          'Shop All AJAX error:',
          error
        );

        stopLoading();

        window.location.assign(
          targetUrl.toString()
        );
      });
  }

  section.addEventListener(
    'change',
    function (event) {
      var sortSelect =
        event.target.closest('.shopall__select');

      if (!sortSelect) return;

      var url = new URL(window.location.href);

      url.searchParams.set(
        'sort_by',
        sortSelect.value
      );

      url.searchParams.delete('page');

      loadUrl(
        url.pathname + url.search,
        true,
        true
      );
    }
  );

  section.addEventListener(
    'click',
    function (event) {
      var link = event.target.closest(
        '[data-shopall-ajax-link], ' +
        '[data-shopall-clear], ' +
        '.shopall__facets a, ' +
        '.shopall__clear, ' +
        '.shopall-pager a'
      );

      if (
        !link ||
        link.target === '_blank' ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      event.preventDefault();

      /*
       * Clear All is generated from the current URL.
       * This preserves view=shop-all-v1 during testing.
       */
if (
  link.matches(
    '[data-shopall-clear], ' +
    '.shopall__clear, ' +
    '.shopall__empty-clear'
  )
) {
  var clearUrl = new URL(
    window.location.href
  );

  Array.from(
    clearUrl.searchParams.keys()
  ).forEach(function (key) {
    if (
      key.indexOf('filter.') === 0 ||
      key === 'page'
    ) {
      clearUrl.searchParams.delete(key);
    }
  });

  /* Reset sorting when clearing filters */
  clearUrl.searchParams.delete('sort_by');

  loadUrl(
    clearUrl.pathname + clearUrl.search,
    true,
    true
  );

  return;
}

      loadUrl(link.href, true, true);
    }
  );

  document.addEventListener(
    'shopall:navigate',
    function (event) {
      var target =
        event.detail &&
        event.detail.url;

      if (!target) return;

      var url = new URL(
        target,
        window.location.origin
      );

      var currentSort =
        new URLSearchParams(
          window.location.search
        ).get('sort_by');

      if (
        currentSort &&
        !url.searchParams.has('sort_by')
      ) {
        url.searchParams.set(
          'sort_by',
          currentSort
        );
      }

      url.searchParams.delete('page');

      loadUrl(
        url.pathname + url.search,
        true,
        true
      );
    }
  );

  window.addEventListener(
    'popstate',
    function () {
      loadUrl(
        window.location.href,
        false,
        false
      );
    }
  );


  
})();

/* ============================================================
   REMOVE SHOPIFY DISCOVERY PARAMETERS FROM PRODUCT LINKS
   Works on initial load and after AJAX filtering.
============================================================ */
(function () {
  'use strict';

  var DISCOVERY_PARAMETERS = [
    '_pos',
    '_fid',
    '_ss',
    '_sid'
  ];

  function cleanProductLink(link) {
    if (!link || !link.href) return;

    try {
      var url = new URL(
        link.href,
        window.location.origin
      );

      /*
       * Only modify internal product links.
       */
      if (
        url.origin !== window.location.origin ||
        url.pathname.indexOf('/products/') !== 0
      ) {
        return;
      }

      var changed = false;

      DISCOVERY_PARAMETERS.forEach(
        function (parameter) {
          if (
            url.searchParams.has(parameter)
          ) {
            url.searchParams.delete(parameter);
            changed = true;
          }
        }
      );

      if (!changed) return;

      link.setAttribute(
        'href',
        url.pathname +
          (
            url.searchParams.toString()
              ? '?' + url.searchParams.toString()
              : ''
          ) +
          url.hash
      );
    } catch (error) {
      console.warn(
        'Product URL cleanup error:',
        error
      );
    }
  }

  function cleanAllProductLinks(scope) {
    var target = scope || document;

    target
      .querySelectorAll(
        '.pcs a[href*="/products/"], ' +
        'product-swatch-card a[href*="/products/"]'
      )
      .forEach(function (link) {
        cleanProductLink(link);
      });
  }

  /*
   * Clean initial product-card links.
   */
  if (
    document.readyState === 'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      function () {
        cleanAllProductLinks(document);
      }
    );
  } else {
    cleanAllProductLinks(document);
  }

  /*
   * Clean links after AJAX filtering replaces
   * the product grid.
   */
  document.addEventListener(
    'shopall:updated',
    function () {
      cleanAllProductLinks(document);
    }
  );

  /*
   * Final safety check immediately before
   * the customer opens a product.
   */
  document.addEventListener(
    'click',
    function (event) {
      var link = event.target.closest
        ? event.target.closest(
            '.pcs a[href*="/products/"], ' +
            'product-swatch-card a[href*="/products/"]'
          )
        : null;

      if (!link) return;

      cleanProductLink(link);
    },
    true
  );
})();