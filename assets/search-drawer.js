// ==============================
// Search Drawer
// Opened by:
// - the desktop header search input (inline mode, header-redesign.js)
// - the mobile header search icon (modal mode, header-redesign.js)
// - [data-search-drawer-trigger] (search input inside the mobile menu drawer)
// Handles: results view while typing (sections/search-drawer-results.liquid
// via the Section Rendering API), Enter → search page, suggestion chips,
// bestseller / FAQ sliders (Swiper, theme's swiper-bundle.min.js), FAQ read more,
// position below the header,
// quick add, focus trap, body scroll lock and menu drawer exclusivity.
// ==============================
(() => {
  if (window.searchDrawerInit) {
    window.searchDrawerInit();
    return;
  }

  const SEARCH_DELAY = 250;
  const MAX_FAQS = 6;
  const MOBILE_QUERY = window.matchMedia('(max-width: 768px)');
  const HEADER_SEARCH = '[data-created-header] .created-header__icon--search';
  const TRIGGER_SELECTOR = [
    '[data-search-drawer-trigger]',
    `${HEADER_SEARCH} summary`,
    `${HEADER_SEARCH} input[type="search"]`,
    `${HEADER_SEARCH} .search__button`
  ].join(', ');
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), [tabindex]:not([tabindex="-1"])';

  const escapeHtml = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);

  const isVisible = (element) =>
    !!(element && element.isConnected && element.getClientRects().length);

  const initDrawer = (drawer) => {
    // Portal: the header section can get a transform (sticky scroll-up),
    // which would make it the containing block of this fixed drawer.
    document.querySelectorAll('body > [data-search-drawer]').forEach((node) => {
      if (node !== drawer) node.remove();
    });
    document.body.appendChild(drawer);

    const panel = drawer.querySelector('.search-drawer__panel');
    const form = drawer.querySelector('[data-search-drawer-form]');
    const input = drawer.querySelector('[data-search-drawer-input]');
    const results = drawer.querySelector('[data-search-drawer-results]');
    const defaults = drawer.querySelector('[data-search-drawer-default]');
    const text = drawer.dataset;

    const state = {
      open: false,
      trigger: null,
      ignoreFocus: false
    };

    let searchTimer = 0;
    let resetTimer = 0;
    let controller = null;
    const cache = new Map();

    // The drawer starts at the header's bottom edge (sticky / responsive
    // heights included) so the header stays visible above it
    const headerSection = document.getElementById('shopify-section-header');

    // Measured without the sticky scroll-up transform: header-redesign.js
    // reveals the header on 'search-drawer:open', so it may still be hidden
    // (or sliding in) at this point
    const setTop = () => {
      let bottom = 0;

      if (headerSection) {
        const transform = getComputedStyle(headerSection).transform;
        const offset = transform && transform !== 'none' ? new DOMMatrixReadOnly(transform).m42 : 0;

        bottom = headerSection.getBoundingClientRect().bottom - offset;
      }

      drawer.style.setProperty('--search-drawer-top', `${Math.max(0, Math.round(bottom))}px`);
    };

    // The scroll lock can leak (iOS); the header's sticky top follows the
    // scroll, so the drawer does too. Queued after the header's own frame.
    let topFrame = 0;

    const onScroll = () => {
      if (topFrame) return;

      topFrame = requestAnimationFrame(() => {
        topFrame = 0;
        setTop();
      });
    };

    const setPlaceholder = () => {
      input.placeholder = MOBILE_QUERY.matches ? text.placeholderMobile : text.placeholder;
    };

    // ------------------------------
    // Sliders (Swiper): one instance per [data-search-drawer-swiper]
    // ------------------------------
    const createSlider = (root) => {
      const container = root.querySelector('[data-search-drawer-swiper]');

      if (!container || typeof window.Swiper !== 'function') return null;

      // Never initialise the same container twice
      if (container.swiper) return container.swiper;

      const faq = container.dataset.searchDrawerSwiper === 'faq';
      const prev = root.querySelector('[data-search-drawer-prev]');
      const next = root.querySelector('[data-search-drawer-next]');
      const progress = root.querySelector('.search-drawer__progress');
      const nav = root.querySelector('.search-drawer__nav, .search-drawer__arrows');

      // Hide arrows / progress when everything fits
      const syncNav = (swiper) => {
        if (nav) nav.hidden = swiper.isLocked;
      };

      // Mobile: 1.3 slides visible; desktop: 2.2 FAQs / 3 products (Swiper sets the slide widths inline)
      return new window.Swiper(container, {
        slidesPerView: faq ? 1.2 : 1.35,
        spaceBetween: 16,
        speed: 400,
        watchOverflow: true,
        // The drawer and its views are hidden/shown; re-measure on change
        observer: true,
        observeParents: true,
        breakpoints: {
          500: { slidesPerView: 1.4, spaceBetween: faq ? 16 : 20 },
          769: { slidesPerView: faq ? 2.4 : 3, spaceBetween: faq ? 22 : 24 }
        },
        navigation: prev && next ? { prevEl: prev, nextEl: next } : false,
        scrollbar: progress
          ? { el: progress, draggable: true, dragClass: 'search-drawer__progress-bar' }
          : false,
        on: {
          afterInit: syncNav,
          lock: syncNav,
          unlock: syncNav
        }
      });
    };

    const sliders = [...drawer.querySelectorAll('[data-search-drawer-slider]')]
      .map(createSlider)
      .filter(Boolean);

    let resultSliders = [];

    const destroyResultSliders = () => {
      resultSliders.forEach((slider) => slider.destroy(true, true));
      resultSliders = [];
    };

    const updateSliders = () => [...sliders, ...resultSliders].forEach((slider) => slider.update());

    // ------------------------------
    // FAQ read more: only shown when the answer is clamped
    // ------------------------------
    const updateFaqToggles = (scope = drawer) => {
      scope.querySelectorAll('[data-search-drawer-faq]').forEach((item) => {
        const answer = item.querySelector('.search-drawer__faq-answer');
        const toggle = item.querySelector('[data-search-drawer-faq-toggle]');

        if (!answer || !toggle || item.classList.contains('is-expanded')) return;

        toggle.hidden = answer.scrollHeight <= answer.clientHeight + 1;
      });
    };

    const toggleFaq = (button) => {
      const item = button.closest('[data-search-drawer-faq]');
      const expanded = !item.classList.contains('is-expanded');

      item.classList.toggle('is-expanded', expanded);
      button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      button.textContent = expanded ? button.dataset.textLess : button.dataset.textMore;
    };

    // ------------------------------
    // Search
    // ------------------------------
    const showResults = (show) => {
      results.hidden = !show;

      if (!defaults || defaults.hidden === show) return;

      defaults.hidden = show;

      // Hidden sliders measure as empty; re-measure once shown again
      if (!show) {
        requestAnimationFrame(() => {
          updateSliders();
          updateFaqToggles(defaults);
        });
      }
    };

    const setStatus = (message, modifier = '') => {
      results.innerHTML = `
        <p class="search-drawer__status${modifier ? ` search-drawer__status--${modifier}` : ''}" role="status">
          ${modifier === 'loading' ? '<span class="search-drawer__spinner" aria-hidden="true"></span>' : ''}
          <span>${escapeHtml(message)}</span>
        </p>`;
    };

    // FAQs are rendered in Liquid; match them by question and answer text
    const matchingFaqs = (query) => {
      const needle = query.toLowerCase();

      return [...(defaults ? defaults.querySelectorAll('[data-search-drawer-faq]') : [])]
        .filter((item) => {
          const question = item.querySelector('.search-drawer__faq-question');
          const answer = item.querySelector('.search-drawer__faq-answer');

          return `${question ? question.textContent : ''} ${answer ? answer.textContent : ''}`
            .toLowerCase()
            .includes(needle);
        })
        .slice(0, MAX_FAQS);
    };

    const renderResults = (query, html) => {
      const view = new DOMParser()
        .parseFromString(html, 'text/html')
        .querySelector('[data-search-drawer-results-view]');

      if (!view) {
        setStatus(text.textError || text.textLoading, 'error');
        return;
      }

      destroyResultSliders();
      results.innerHTML = '';
      results.appendChild(document.importNode(view, true));

      const faqs = matchingFaqs(query);
      const faqSlot = results.querySelector('[data-search-drawer-faq-slot]');

      if (faqSlot && faqs.length) {
        faqSlot.outerHTML = `
          <div class="search-drawer__section search-drawer__result-faqs" data-search-drawer-slider>
            ${text.textFaq ? `<h2 class="search-drawer__heading">${escapeHtml(text.textFaq)}</h2>` : ''}
            <div class="search-drawer__swiper swiper" data-search-drawer-swiper="faq">
              <ul class="search-drawer__track search-drawer__track--faq swiper-wrapper" role="list" data-search-drawer-result-faqs></ul>
            </div>
          </div>`;

        const faqList = results.querySelector('[data-search-drawer-result-faqs]');

        faqs.forEach((item, index) => {
          const slide = item.closest('.search-drawer__slide').cloneNode(true);
          const clone = slide.querySelector('[data-search-drawer-faq]');
          const answer = clone.querySelector('.search-drawer__faq-answer');
          const toggle = clone.querySelector('[data-search-drawer-faq-toggle]');
          const id = `SearchDrawerResultFaq-${index + 1}`;

          // Drop the state Swiper put on the original slide
          slide.removeAttribute('style');
          slide.removeAttribute('role');
          slide.removeAttribute('aria-label');
          slide.classList.remove('swiper-slide-active', 'swiper-slide-next', 'swiper-slide-prev', 'swiper-slide-visible', 'swiper-slide-fully-visible');

          clone.classList.remove('is-expanded');
          answer.id = id;
          toggle.setAttribute('aria-controls', id);
          toggle.setAttribute('aria-expanded', 'false');
          toggle.textContent = toggle.dataset.textMore;
          faqList.appendChild(slide);
        });
      }

      resultSliders = [...results.querySelectorAll('[data-search-drawer-slider]')]
        .map(createSlider)
        .filter(Boolean);

      requestAnimationFrame(() => {
        resultSliders.forEach((slider) => slider.update());
        updateFaqToggles(results);
      });
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
        'resources[type]': 'product,collection,page,article,query',
        'resources[limit]': '10',
        'resources[limit_scope]': 'each',
        'resources[options][unavailable_products]': 'last',
        section_id: text.resultsSection
      });

      try {
        const response = await fetch(`${text.searchUrl}?${params}`, {
          signal: controller.signal
        });

        if (!response.ok) throw new Error(response.status);

        const data = await response.text();

        cache.set(query, data);

        if (input.value.trim() === query) renderResults(query, data);
      } catch (error) {
        if (error.name !== 'AbortError') setStatus(text.textError || text.textLoading, 'error');
      }
    };

    const resetSearch = () => {
      clearTimeout(searchTimer);
      if (controller) controller.abort();

      input.value = '';
      destroyResultSliders();
      results.innerHTML = '';
      showResults(false);
    };

    const runSearch = (immediate = false) => {
      const query = input.value.trim();

      clearTimeout(searchTimer);

      if (!query) {
        resetSearch();
        return;
      }

      showResults(true);

      if (immediate) {
        search(query);
      } else {
        searchTimer = setTimeout(() => search(query), SEARCH_DELAY);
      }
    };

    // ------------------------------
    // Open / close
    // ------------------------------
    const closeMenuDrawer = () => {
      const host = document.getElementById('MobileNavDrawer');

      if (!host || !host.classList.contains('open')) return;

      // The header close button also resets the header's open/close toggles
      const headerClose = document.querySelector('[data-nav-close-wrap]:not([hidden]) button');

      if (headerClose) {
        headerClose.click();
      } else if (typeof host.close === 'function') {
        host.close();
      }
    };

    const focusInput = () => {
      input.focus({ preventScroll: true });

      // Place the caret after a transferred query
      const end = input.value.length;
      try {
        input.setSelectionRange(end, end);
      } catch (error) {
        // type="search" may not support selection in older browsers
      }
    };

    const onKeydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = [...panel.querySelectorAll(FOCUSABLE)].filter(isVisible);

      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const open = ({ trigger = null, query = '' } = {}) => {
      clearTimeout(resetTimer);
      closeMenuDrawer();

      if (query) {
        input.value = query;
        runSearch(true);
      }

      if (!state.open) {
        state.open = true;
        state.trigger = trigger;

        setTop();
        setPlaceholder();
        drawer.inert = false;
        drawer.removeAttribute('inert');
        drawer.setAttribute('aria-hidden', 'false');
        drawer.classList.add('is-open');
        document.documentElement.classList.add('search-drawer-open');
        document.addEventListener('keydown', onKeydown);
        window.addEventListener('scroll', onScroll, { passive: true });
        document.dispatchEvent(new CustomEvent('search-drawer:open'));

        requestAnimationFrame(() => {
          updateSliders();
          updateFaqToggles(defaults || drawer);
        });
      }

      // Synchronous so mobile browsers keep the keyboard for the tap
      focusInput();
    };

    const close = ({ restoreFocus = true } = {}) => {
      if (!state.open) return;

      state.open = false;

      if (drawer.contains(document.activeElement)) document.activeElement.blur();

      drawer.classList.remove('is-open');
      drawer.setAttribute('aria-hidden', 'true');
      drawer.inert = true;
      drawer.setAttribute('inert', '');
      document.documentElement.classList.remove('search-drawer-open');
      document.removeEventListener('keydown', onKeydown);
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(topFrame);
      topFrame = 0;
      document.dispatchEvent(new CustomEvent('search-drawer:close'));

      const trigger = state.trigger;
      state.trigger = null;

      // Return focus without reopening (the trigger opens on focus)
      if (restoreFocus && isVisible(trigger)) {
        state.ignoreFocus = true;
        trigger.focus({ preventScroll: true });
        state.ignoreFocus = false;
      }

      resetTimer = setTimeout(resetSearch, 300);
    };

    // ------------------------------
    // Triggers (delegated, capture phase: the menu drawer stops click
    // propagation and the header search summary has its own handlers).
    // 'focus' (not 'focusin') so the query moves into the drawer before the
    // header predictive-search's own focus handler can fetch results for it.
    // ------------------------------
    const onTrigger = (event) => {
      // Capturing 'focus' on document also receives window focus
      if (!(event.target instanceof Element)) return;
      if (state.ignoreFocus || drawer.contains(event.target)) return;

      const trigger = event.target.closest(TRIGGER_SELECTOR);

      if (!trigger) return;

      // Only inputs open on focus; icons and buttons open on click
      if (event.type === 'focus' && trigger.tagName !== 'INPUT') return;

      if (event.type === 'click') {
        event.preventDefault();
        event.stopPropagation();
      }

      if (state.open) {
        focusInput();
        return;
      }

      let query = '';

      if (trigger.tagName === 'INPUT') {
        query = trigger.value.trim();
        trigger.value = '';
      } else {
        const sibling = trigger.closest(HEADER_SEARCH);
        const field = sibling && sibling.querySelector('input[type="search"]');

        if (field) {
          query = field.value.trim();
          field.value = '';
        }
      }

      // Keep the header's own predictive search closed
      const predictive = trigger.closest('predictive-search') ||
        (trigger.closest(HEADER_SEARCH) && trigger.closest(HEADER_SEARCH).querySelector('predictive-search'));

      if (predictive && typeof predictive.close === 'function') predictive.close();

      // Triggers inside the menu drawer are hidden once it closes
      const inMenuDrawer = !!trigger.closest('#MobileNavDrawer');
      const returnTarget = trigger.matches('summary, input')
        ? trigger
        : trigger.closest(HEADER_SEARCH) && trigger.closest(HEADER_SEARCH).querySelector('input[type="search"]');

      open({ trigger: inMenuDrawer ? null : returnTarget, query });
    };

    // Header search form (inline mode) never submits to the search page
    const onTriggerSubmit = (event) => {
      if (drawer.contains(event.target) || !event.target.closest(HEADER_SEARCH)) return;

      event.preventDefault();
      event.stopPropagation();

      const field = event.target.querySelector('input[type="search"]');
      const query = field ? field.value.trim() : '';

      if (field) field.value = '';

      open({ trigger: field, query });
    };

    // ------------------------------
    // Drawer interactions
    // ------------------------------
    const onDrawerClick = (event) => {
      const closer = event.target.closest('[data-search-drawer-close]');

      if (closer) {
        event.preventDefault();
        close();
        return;
      }

      const suggestion = event.target.closest('[data-search-drawer-suggestion]');

      if (suggestion) {
        // Results stay in the drawer; the link is the no-JS fallback
        event.preventDefault();
        input.value = suggestion.dataset.searchDrawerSuggestion;
        runSearch(true);
        focusInput();
        return;
      }

      const faqToggle = event.target.closest('[data-search-drawer-faq-toggle]');

      if (faqToggle) toggleFaq(faqToggle);
    };

    // Enter opens the full search page (native GET to routes.search_url)
    const onSubmit = (event) => {
      if (!input.value.trim()) event.preventDefault();
    };

    const onInputKeydown = (event) => {
      if (event.key === 'Escape' && input.value) {
        event.preventDefault();
        event.stopPropagation();
        resetSearch();
      }
    };

    // Quick add from product-item cards (drawer and search page)
    const addedTimers = new WeakMap();

    const onQuickAdd = async (event) => {
      const cardForm = event.target.closest('.product-item--card .product-item__form');

      if (!cardForm) return;

      event.preventDefault();

      const button = cardForm.querySelector('.product-item__atc');

      if (!button || button.disabled || button.classList.contains('is-loading')) return;

      const root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';

      // A previous success may still show its checkmark
      clearTimeout(addedTimers.get(button));
      button.classList.remove('is-added');
      button.classList.add('is-loading');
      button.setAttribute('aria-busy', 'true');

      try {
        const response = await fetch(`${root}cart/add.js`, {
          method: 'POST',
          headers: { Accept: 'application/json' },
          body: new FormData(cardForm)
        });
        const added = await response.json();

        if (!response.ok) throw new Error(added.description || added.message || 'Could not add to cart');

        const cart = await fetch(`${root}cart.js`, { headers: { Accept: 'application/json' } })
          .then((res) => res.json());

        // Spinner → checkmark
        button.classList.remove('is-loading');
        button.classList.add('is-added');
        addedTimers.set(button, setTimeout(() => button.classList.remove('is-added'), 1800));

        document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true, detail: { cart } }));
        document.documentElement.dispatchEvent(new CustomEvent('variant:add', {
          bubbles: true,
          detail: { items: added.items || [added], cart }
        }));

        // Close the search drawer only once the add succeeded; the cart drawer stays closed
        close({ restoreFocus: false });
      } catch (error) {
        window.alert(error.message);
      } finally {
        button.classList.remove('is-loading');
        button.removeAttribute('aria-busy');
      }
    };

    // Cart / menu drawers (FocusableWidget) open → close the search drawer
    const onOtherDrawerOpen = () => close({ restoreFocus: false });

    // The header stays clickable above the drawer. The cart may open via Rebuy
    // (not a FocusableWidget), so close on its trigger too. Window capture runs
    // before the layout's document-level Rebuy handler stops propagation.
    const onCartClick = (event) => {
      if (state.open && event.target instanceof Element && event.target.closest('[js-open-cart-drawer]')) {
        close({ restoreFocus: false });
      }
    };

    const onResize = () => {
      if (!state.open) return;

      setTop();
      setPlaceholder();
      updateSliders();
      updateFaqToggles();
    };

    // Theme editor: show the drawer while its block is selected
    const onBlockSelect = (event) => {
      if (drawer.contains(event.target)) open();
    };

    const onBlockDeselect = (event) => {
      if (drawer.contains(event.target)) close({ restoreFocus: false });
    };

    document.addEventListener('click', onTrigger, true);
    document.addEventListener('focus', onTrigger, true);
    document.addEventListener('submit', onTriggerSubmit, true);
    document.addEventListener('focusable-widget:open', onOtherDrawerOpen);
    window.addEventListener('click', onCartClick, true);
    document.addEventListener('shopify:block:select', onBlockSelect);
    document.addEventListener('shopify:block:deselect', onBlockDeselect);
    drawer.addEventListener('click', onDrawerClick);
    document.addEventListener('submit', onQuickAdd);
    form.addEventListener('submit', onSubmit);
    input.addEventListener('input', () => runSearch());
    input.addEventListener('keydown', onInputKeydown);
    window.addEventListener('resize', onResize, { passive: true });

    return () => {
      close({ restoreFocus: false });
      clearTimeout(resetTimer);
      clearTimeout(searchTimer);
      if (controller) controller.abort();

      document.removeEventListener('click', onTrigger, true);
      document.removeEventListener('focus', onTrigger, true);
      document.removeEventListener('submit', onTriggerSubmit, true);
      document.removeEventListener('focusable-widget:open', onOtherDrawerOpen);
      document.removeEventListener('submit', onQuickAdd);
      window.removeEventListener('click', onCartClick, true);
      destroyResultSliders();
      sliders.forEach((slider) => slider.destroy(true, true));
      document.removeEventListener('shopify:block:select', onBlockSelect);
      document.removeEventListener('shopify:block:deselect', onBlockDeselect);
      window.removeEventListener('resize', onResize);
    };
  };

  let destroyDrawer = () => {};

  const init = () => {
    destroyDrawer();
    destroyDrawer = () => {};

    // A fresh render (still inside the header section) wins over a drawer
    // already moved to <body> by a previous init (theme editor re-renders)
    const drawers = [...document.querySelectorAll('[data-search-drawer]')];
    const drawer = drawers.find((node) => node.parentElement !== document.body) || drawers[0];

    if (!drawer) return;

    destroyDrawer = initDrawer(drawer);
  };

  window.searchDrawerInit = init;
  init();

  document.addEventListener('shopify:section:load', (event) => {
    if (event.target.querySelector('[data-search-drawer]')) init();
  });

  document.addEventListener('shopify:section:unload', (event) => {
    if (event.target.id !== 'shopify-section-header') return;

    destroyDrawer();
    destroyDrawer = () => {};
    document.querySelectorAll('body > [data-search-drawer]').forEach((node) => node.remove());
  });
})();
