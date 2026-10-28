// ==============================
// Mega Menu Redesign
// Open/close of the desktop panels is handled by header-redesign.js
// (.new_megamenu_item / .new_megamenu_main). This file adds:
// - third-level link hover → matching block content (links without a block
//   keep the last content visible)
// - collection hover → products column
// - desktop best seller Swiper sliders
// - mobile drawer views, mounted into the existing #MobileNavDrawer
// - drawer search input: opens the search drawer (search-drawer.js)
// ==============================
(() => {
  if (window.megaMenuRedesignInit) {
    window.megaMenuRedesignInit();
    return;
  }

  const SEARCH_DELAY = 250;
  const LINK_HOVER_DELAY = 120;
  const MAX_PRODUCTS = 6;

  const escapeHtml = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);

  const sizedImage = (src, width) => {
    if (!src) return '';

    try {
      const url = new URL(src, window.location.origin);
      url.searchParams.set('width', width);
      return url.href;
    } catch (error) {
      return src;
    }
  };

  // Mirrors Shopify's money formats + money_without_trailing_zeros
  const createMoneyFormatter = (format) => (value) => {
    const cents = Math.round(parseFloat(value) * 100);

    if (!Number.isFinite(cents)) return '';

    const delimit = (precision, thousands = ',', decimal = '.') => {
      const [whole, fraction] = (cents / 100).toFixed(precision).split('.');
      const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, thousands);

      return fraction ? `${grouped}${decimal}${fraction}` : grouped;
    };

    return (format || '${{amount}}')
      .replace(/\{\{\s*(\w+)\s*\}\}/, (match, key) => {
        switch (key) {
          case 'amount_no_decimals':
            return delimit(0);
          case 'amount_with_comma_separator':
            return delimit(2, '.', ',');
          case 'amount_no_decimals_with_comma_separator':
            return delimit(0, '.', ',');
          case 'amount_with_apostrophe_separator':
            return delimit(2, "'", '.');
          default:
            return delimit(2);
        }
      })
      .replace(/[.,]00(?!\d)/, '');
  };

  // ------------------------------
  // Desktop: third-level link → block content, collection → products
  // ------------------------------
  const initPanels = (root) => {
    root.querySelectorAll('[data-mmr-panel]').forEach((panel) => {
      if (panel.dataset.mmrReady) return;
      panel.dataset.mmrReady = 'true';

      let linkTimer = 0;

      const showBlock = (link) => {
        const id = link.dataset.mmrTarget;
        const current = panel.querySelector('[data-mmr-block]:not([hidden])');

        if (current && current.dataset.mmrBlock === id) return;

        panel.querySelectorAll('[data-mmr-target]').forEach((item) => {
          item.classList.toggle('is-active', item === link);
        });

        panel.querySelectorAll('[data-mmr-block]').forEach((block) => {
          block.hidden = block.dataset.mmrBlock !== id;
        });
      };

      const showProducts = (row) => {
        const block = row.closest('[data-mmr-block]');

        if (!block || row.classList.contains('is-active')) return;

        const id = row.dataset.mmrCollection;

        block.querySelectorAll('[data-mmr-collection]').forEach((item) => {
          item.classList.toggle('is-active', item === row);
        });

        block.querySelectorAll('[data-mmr-products]').forEach((group) => {
          group.hidden = group.dataset.mmrProducts !== id;
        });
      };

      panel.addEventListener('mouseover', (event) => {
        const link = event.target.closest('[data-mmr-target]');

        if (link) {
          clearTimeout(linkTimer);
          linkTimer = setTimeout(() => showBlock(link), LINK_HOVER_DELAY);
          return;
        }

        const row = event.target.closest('[data-mmr-collection]');

        if (row) showProducts(row);
      });

      // Passing over a link on the way to the collections must not switch content
      panel.addEventListener('mouseout', (event) => {
        if (event.target.closest('[data-mmr-target]')) clearTimeout(linkTimer);
      });

      panel.addEventListener('focusin', (event) => {
        const link = event.target.closest('[data-mmr-target]');
        const row = event.target.closest('[data-mmr-collection]');

        if (link) showBlock(link);
        if (row) showProducts(row);
      });
    });
  };

  // ------------------------------
  // Desktop best sellers: two visible, the rest slide (Swiper)
  // ------------------------------
  const initSwipers = (scope) => {
    if (typeof window.Swiper !== 'function') return;

    scope.querySelectorAll('[data-mmr-swiper]').forEach((wrap) => {
      const container = wrap.querySelector('[data-mmr-swiper-container]');

      // Skip duplicates (theme editor re-renders)
      if (!container || container.swiper) return;

      new window.Swiper(container, {
        slidesPerView: 2,
        slidesPerGroup: 1,
        spaceBetween: 12,
        speed: 400,
        grabCursor: true,
        watchOverflow: true,
        // Panels start hidden; re-measure when they open
        observer: true,
        observeParents: true,
        navigation: {
          prevEl: wrap.querySelector('[data-mmr-swiper-prev]'),
          nextEl: wrap.querySelector('[data-mmr-swiper-next]')
        }
      });
    });
  };

  // ------------------------------
  // Mobile drawer
  // ------------------------------
  const initDrawer = (root) => {
    const template = root.querySelector('[data-mmr-drawer-template]');
    const host = document.getElementById('MobileNavDrawer');

    if (!template || !host) return () => {};

    host.querySelectorAll('[data-mmr-drawer]').forEach((node) => node.remove());
    host.appendChild(template.content.cloneNode(true));
    host.classList.add('mega-menu-redesign-host');

    const drawer = host.querySelector('[data-mmr-drawer]');
    const views = drawer.querySelectorAll('[data-mmr-view]');
    const form = drawer.querySelector('[data-mmr-search-form]');
    const input = drawer.querySelector('[data-mmr-search-input]');
    const clear = drawer.querySelector('[data-mmr-search-clear]');
    const results = drawer.querySelector('[data-mmr-search-results]');
    const rootMenu = drawer.querySelector('[data-mmr-root-menu]');
    const text = drawer.dataset;
    const formatMoney = createMoneyFormatter(text.moneyFormat);

    let currentView = 'root';
    let searchTimer = 0;
    let controller = null;
    const cache = new Map();

    // Views
    const showView = (id, direction = 'forward') => {
      const target = drawer.querySelector(`[data-mmr-view="${id}"]`);

      if (!target || id === currentView) return;

      views.forEach((view) => {
        const active = view === target;

        view.hidden = !active;
        view.classList.toggle('is-active', active);
        view.classList.remove('is-entering', 'is-entering-back');
      });

      target.classList.add(direction === 'back' ? 'is-entering-back' : 'is-entering');
      currentView = id;

      // Each panel scrolls its own body (footer stays pinned). Going back keeps
      // the previous scroll position so the user returns to the tapped item.
      const body = target.querySelector('.mega-menu-redesign-drawer__body');
      if (body && direction !== 'back') body.scrollTop = 0;
    };

    // Panel 2: show a matched third-level link's collection groups in the
    // content area below the navigation and hide the previous section
    const showDrawerBlock = (button) => {
      const view = button.closest('[data-mmr-view]');
      const id = button.dataset.mmrDrawerTarget;

      view.querySelectorAll('[data-mmr-drawer-target]').forEach((item) => {
        const active = item === button;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-expanded', active ? 'true' : 'false');
      });

      view.querySelectorAll('[data-mmr-drawer-block]').forEach((block) => {
        block.hidden = block.dataset.mmrDrawerBlock !== id;
      });

      // Bring the newly shown section into view (it sits below the navigation)
      const body = view.querySelector('.mega-menu-redesign-drawer__body');
      const shown = view.querySelector('[data-mmr-drawer-block]:not([hidden])');
      if (body && shown) {
        const top = Math.max(0, shown.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - 8);

        if (typeof body.scrollTo === 'function') {
          body.scrollTo({ top, behavior: 'smooth' });
        } else {
          body.scrollTop = top;
        }
      }
    };

    const closeDrawer = () => {
      const headerClose = document.querySelector('[data-nav-close-wrap]:not([hidden]) button');

      if (headerClose) {
        headerClose.click();
      } else if (typeof host.close === 'function') {
        host.close();
      }
    };

    // Search
    const setStatus = (message, modifier = '') => {
      results.innerHTML = `
        <p class="mega-menu-redesign-drawer__status${modifier ? ` mega-menu-redesign-drawer__status--${modifier}` : ''}" role="status">
          ${modifier === 'loading' ? '<span class="mega-menu-redesign-drawer__spinner" aria-hidden="true"></span>' : ''}
          <span>${escapeHtml(message)}</span>
        </p>`;
    };

    const withTerms = (template, query) =>
      escapeHtml(template).replace('[terms]', escapeHtml(query));

    const renderResults = (query, data) => {
      const resources = (data && data.resources && data.resources.results) || {};
      const products = (resources.products || [])
        .filter((product) => !(product.tags || []).includes('hidden-variant'))
        .slice(0, MAX_PRODUCTS);
      const collections = resources.collections || [];
      const searchUrl = `${text.searchPageUrl}?q=${encodeURIComponent(query)}&options%5Bprefix%5D=last`;

      if (!products.length && !collections.length) {
        results.innerHTML = `
          <p class="mega-menu-redesign-drawer__status" role="status">${withTerms(text.textEmpty, query)}</p>`;
        return;
      }

      const productItems = products.map((product) => {
        const image = sizedImage(
          (product.featured_image && product.featured_image.url) || product.image,
          120
        );

        return `
          <li>
            <a href="${escapeHtml(product.url)}" class="mega-menu-redesign__product">
              <span class="mega-menu-redesign__product-media">
                ${image ? `<img src="${escapeHtml(image)}" alt="" width="60" height="60" loading="lazy">` : ''}
              </span>
              <span class="mega-menu-redesign__product-info">
                <span class="mega-menu-redesign__product-title">${escapeHtml(product.title)}</span>
                <span class="mega-menu-redesign__product-price">${escapeHtml(formatMoney(product.price_min || product.price))}</span>
              </span>
              <span class="mega-menu-redesign__chevron">${chevron}</span>
            </a>
          </li>`;
      }).join('');

      const collectionItems = collections.map((collection) => `
        <li>
          <a href="${escapeHtml(collection.url)}" class="mega-menu-redesign-drawer__row">
            <span>${escapeHtml(collection.title)}</span>
            <span class="mega-menu-redesign__chevron">${chevron}</span>
          </a>
        </li>`).join('');

      results.innerHTML = `
        ${products.length ? `
          <p class="mega-menu-redesign__label">${escapeHtml(text.textProducts)}</p>
          <ul class="mega-menu-redesign__product-list" role="list">${productItems}</ul>` : ''}
        ${collections.length ? `
          <div class="mega-menu-redesign__group">
            <ul class="mega-menu-redesign-drawer__rows" role="list">${collectionItems}</ul>
          </div>` : ''}
        <a href="${escapeHtml(searchUrl)}" class="mega-menu-redesign-drawer__row mega-menu-redesign-drawer__row--primary">
          <span>${withTerms(text.textViewAll, query)}</span>
          <span class="mega-menu-redesign__chevron">${chevron}</span>
        </a>`;
    };

    const search = async (query) => {
      if (controller) controller.abort();

      if (cache.has(query)) {
        renderResults(query, cache.get(query));
        return;
      }

      controller = new AbortController();
      setStatus(text.textLoading, 'loading');

      const params = new URLSearchParams({
        q: query,
        'resources[type]': 'product,collection',
        'resources[limit]': '10',
        'resources[options][unavailable_products]': 'last'
      });

      try {
        const response = await fetch(`${text.searchUrl}.json?${params}`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' }
        });

        if (!response.ok) throw new Error(response.status);

        const data = await response.json();

        cache.set(query, data);

        if (input.value.trim() === query) renderResults(query, data);
      } catch (error) {
        if (error.name !== 'AbortError') setStatus(text.textError, 'error');
      }
    };

    const resetSearch = () => {
      clearTimeout(searchTimer);
      if (controller) controller.abort();

      input.value = '';
      clear.hidden = true;
      results.hidden = true;
      results.innerHTML = '';
      rootMenu.hidden = false;
    };

    const onInput = () => {
      const query = input.value.trim();

      clearTimeout(searchTimer);
      clear.hidden = !input.value.length;

      if (!query) {
        resetSearch();
        return;
      }

      results.hidden = false;
      rootMenu.hidden = true;
      searchTimer = setTimeout(() => search(query), SEARCH_DELAY);
    };

    // Reuse the theme caret for result chevrons
    const chevronSource = drawer.querySelector('.mega-menu-redesign__chevron');
    const chevron = chevronSource ? chevronSource.innerHTML : '';

    input.addEventListener('input', onInput);

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && input.value) {
        event.stopPropagation();
        resetSearch();
      }
    });

    form.addEventListener('submit', (event) => {
      // Results stay in the drawer; "Search for…" links to the full page
      event.preventDefault();

      const query = input.value.trim();

      if (!query) return;

      clearTimeout(searchTimer);
      results.hidden = false;
      rootMenu.hidden = true;
      search(query);
      input.blur();
    });

    clear.addEventListener('click', () => {
      resetSearch();
      input.focus();
    });

    // Drawer stops click propagation, so delegate on the drawer itself
    drawer.addEventListener('click', (event) => {
      // Inactive matched link: swap the content. Active one: follow its link.
      const blockTarget = event.target.closest('[data-mmr-drawer-target]');

      if (blockTarget) {
        if (!blockTarget.classList.contains('is-active')) {
          event.preventDefault();
          showDrawerBlock(blockTarget);
        }
        return;
      }

      const opener = event.target.closest('[data-mmr-open]');
      const collection = event.target.closest('[data-mmr-collection]');
      const back = event.target.closest('[data-mmr-back]');
      const close = event.target.closest('[data-mmr-close]');

      if (opener) {
        showView(opener.dataset.mmrOpen);
      } else if (collection && drawer.querySelector(`[data-mmr-view="${collection.dataset.mmrCollection}"]`)) {
        event.preventDefault();
        showView(collection.dataset.mmrCollection);
      } else if (back) {
        const view = back.closest('[data-mmr-view]');
        showView((view && view.dataset.mmrParent) || 'root', 'back');
      } else if (close) {
        closeDrawer();
      }
    });

    // The mobile header search icon and this drawer's search input open the
    // search drawer instead (search-drawer.js, [data-search-drawer-trigger])

    const onDrawerClose = () => {
      setTimeout(() => {
        showView('root', 'back');
        resetSearch();
      }, 200);
    };

    document.addEventListener('MobileNavDrawer:close', onDrawerClose);

    // Like the search drawer, the drawer starts at the header's bottom edge so the
    // header stays visible above it at every breakpoint. With sticky "scroll up" the
    // header section has will-change: transform, which makes it the drawer's
    // containing block; otherwise it is the viewport. --mmr-drawer-offset is the
    // header's bottom edge in that containing block, and --mmr-drawer-top the
    // drawer's real top, so its height ends exactly at the viewport bottom.
    // Re-measure when the header finishes sliding back in (it may be hidden when the
    // drawer opens), when its height changes and whenever the page moves while open.
    const headerSection = host.closest('.shopify-section');

    const fitToViewport = () => {
      if (!host.classList.contains('open')) return;

      if (headerSection) {
        const transform = getComputedStyle(headerSection).transform;
        const slide = transform && transform !== 'none' ? new DOMMatrixReadOnly(transform).m42 : 0;
        const headerRect = headerSection.getBoundingClientRect();
        const containerTop = host.getBoundingClientRect().top - (parseFloat(getComputedStyle(host).top) || 0);

        host.style.setProperty('--mmr-drawer-offset', `${Math.round(headerRect.bottom - containerTop)}px`);
        // Final top once the header has slid back in (it may be hidden when the drawer opens)
        host.style.setProperty('--mmr-drawer-top', `${Math.max(0, Math.round(headerRect.bottom - slide))}px`);
      } else {
        host.style.setProperty('--mmr-drawer-top', `${Math.max(0, host.getBoundingClientRect().top)}px`);
      }
    };

    // Queued after the header's own scroll frame (sticky top / hidden state)
    let fitFrame = 0;

    const onPageMove = () => {
      if (fitFrame) return;

      fitFrame = requestAnimationFrame(() => {
        fitFrame = 0;
        fitToViewport();
      });
    };

    const headerObserver = 'ResizeObserver' in window && headerSection ? new ResizeObserver(onPageMove) : null;

    document.addEventListener('MobileNavDrawer:open', fitToViewport);
    window.addEventListener('resize', onPageMove);
    window.addEventListener('scroll', onPageMove, { passive: true });
    if (headerSection) headerSection.addEventListener('transitionend', fitToViewport);
    if (headerObserver) headerObserver.observe(headerSection);

    return () => {
      document.removeEventListener('MobileNavDrawer:close', onDrawerClose);
      document.removeEventListener('MobileNavDrawer:open', fitToViewport);
      window.removeEventListener('resize', onPageMove);
      window.removeEventListener('scroll', onPageMove);
      cancelAnimationFrame(fitFrame);
      if (headerSection) headerSection.removeEventListener('transitionend', fitToViewport);
      if (headerObserver) headerObserver.disconnect();
      if (controller) controller.abort();
    };
  };

  let destroyDrawer = () => {};

  const init = () => {
    const root = document.querySelector('[data-mega-menu-redesign]');

    destroyDrawer();
    destroyDrawer = () => {};

    if (!root) return;

    initPanels(root);
    initSwipers(root);
    destroyDrawer = initDrawer(root);
  };

  window.megaMenuRedesignInit = init;
  init();

  document.addEventListener('shopify:section:load', (event) => {
    if (event.target.querySelector('[data-mega-menu-redesign]')) init();
  });
})();
