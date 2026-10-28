// ==============================
// Bundle Builder (sections/bundle-builder.liquid)
// <bundle-builder> custom element, so it sets itself up again when the theme editor
// re-renders the section (connectedCallback / disconnectedCallback).
// Handles: collection tabs (the "All" tab = every product once), the product slider
// (Swiper, theme's swiper-bundle.min.js: horizontal on desktop, vertical native-scroll list
// on mobile), colour swatches, bundle selection (min / max pieces), progress tracker,
// totals with the estimated tier discount, and add to cart.
// The real discount is an automatic discount in Shopify admin.
// ==============================
(() => {
  if (customElements.get('bundle-builder')) return;

  const DESKTOP_QUERY = '(min-width: 769px)';

  const escapeHtml = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);

  const formatMoney = (cents, format) => {
    const amount = (decimals, thousands, decimal) => {
      const [whole, fraction] = (Math.round(cents) / 100).toFixed(decimals).split('.');
      const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
      return fraction ? grouped + decimal + fraction : grouped;
    };

    return String(format || '${{amount}}').replace(/\{\{\s*(\w+)\s*\}\}/, (match, key) => {
      switch (key) {
        case 'amount_no_decimals': return amount(0, ',', '.');
        case 'amount_with_comma_separator': return amount(2, '.', ',');
        case 'amount_no_decimals_with_comma_separator': return amount(0, '.', ',');
        case 'amount_with_apostrophe_separator': return amount(2, "'", '.');
        default: return amount(2, ',', '.');
      }
    });
  };

  // "$40.00" → "$40" (desktop card prices)
  const formatMoneyShort = (cents, format) => {
    const value = formatMoney(cents, format);
    return cents % 100 === 0 ? value.replace(/[.,]00(?=\D*$)/, '') : value;
  };

  // [placeholder] → value
  const fillTemplate = (template, values) =>
    String(template || '').replace(/\[(\w+)\]/g, (match, key) => (key in values ? values[key] : match));

  // escape, then *text* → highlighted span
  const highlight = (text) =>
    escapeHtml(text).replace(/\*([^*]+)\*/g, '<span class="bundle-builder__highlight">$1</span>');

  // Fisher–Yates: a new random order on every page load
  const shuffle = (items) => {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };

  class BundleBuilder extends HTMLElement {
    connectedCallback() {
      if (this.ready) return;

      const configEl = this.querySelector('[data-bundle-builder-config]');
      try {
        this.config = JSON.parse(configEl.textContent);
      } catch (error) {
        console.error('Bundle builder: invalid config', error);
        return;
      }

      this.ready = true;
      this.strings = this.config.strings;
      this.selection = [];
      this.alertTimer = null;
      this.noteOverride = '';

      this.slider = this.querySelector('[data-bundle-builder-slider]');
      this.wrapper = this.querySelector('[data-bundle-builder-wrapper]');
      this.viewport = this.querySelector('[data-bundle-builder-viewport]');
      this.tabsScroller = this.querySelector('[data-bundle-builder-tabs]');
      this.tabsNext = this.querySelector('[data-bundle-builder-tabs-next]');
      this.tabs = [...this.querySelectorAll('[data-bundle-builder-tab]')];
      this.slots = this.querySelector('[data-bundle-builder-slots]');
      this.submit = this.querySelector('[data-bundle-builder-submit]');
      this.submitLabel = this.querySelector('[data-bundle-builder-submit-label]');
      this.note = this.querySelector('[data-bundle-builder-note]');

      // Rendered once each (deduplicated by product id in Liquid), from every collection block
      this.cards = [...this.querySelectorAll('[data-bundle-builder-slide]')].map((slide) => this.createCard(slide));
      // "All" tab: the combined pool in random order, so the collections are mixed
      this.mixedSlides = shuffle(this.cards.map((card) => card.slide));

      this.onClick = this.onClick.bind(this);
      this.onBlockSelect = this.onBlockSelect.bind(this);
      this.onBreakpointChange = this.onBreakpointChange.bind(this);
      this.updateTabsArrow = this.updateTabsArrow.bind(this);

      this.addEventListener('click', this.onClick);
      document.addEventListener('shopify:block:select', this.onBlockSelect);

      this.mediaQuery = window.matchMedia(DESKTOP_QUERY);
      this.mediaQuery.addEventListener('change', this.onBreakpointChange);

      if (this.tabsScroller) {
        this.tabsScroller.addEventListener('scroll', this.updateTabsArrow, { passive: true });
        this.resizeObserver = new ResizeObserver(this.updateTabsArrow);
        this.resizeObserver.observe(this.tabsScroller);
      }

      const activeTab = this.tabs.find((tab) => tab.classList.contains('is-active')) || this.tabs[0];
      if (activeTab) this.selectTab(activeTab, { scroll: false });

      this.initSlider();
      this.render();
    }

    disconnectedCallback() {
      if (!this.ready) return;
      this.ready = false;
      this.removeEventListener('click', this.onClick);
      document.removeEventListener('shopify:block:select', this.onBlockSelect);
      this.mediaQuery.removeEventListener('change', this.onBreakpointChange);
      this.resizeObserver?.disconnect();
      this.destroySlider();
      window.removeEventListener('load', this.waitForSwiper);
    }

    /* ---------- Cards ---------- */

    createCard(slide) {
      let options = [];
      try {
        options = JSON.parse(slide.querySelector('[data-bundle-builder-options]').textContent);
      } catch (error) {
        console.error('Bundle builder: invalid product data', error);
      }

      const card = slide.querySelector('[data-bundle-builder-product]');
      return {
        slide,
        el: card,
        options,
        index: 0,
        productId: slide.dataset.productId,
        image: card.querySelector('[data-bundle-builder-image]'),
        rating: card.querySelector('[data-bundle-builder-rating]'),
        stars: card.querySelector('.bundle-builder__stars'),
        ratingValue: card.querySelector('[data-bundle-builder-rating-value]'),
        ratingCount: card.querySelector('[data-bundle-builder-rating-count]'),
        title: card.querySelector('[data-bundle-builder-title]'),
        subtitle: card.querySelector('[data-bundle-builder-subtitle]'),
        priceShort: card.querySelector('[data-bundle-builder-price-short]'),
        priceFull: card.querySelector('[data-bundle-builder-price-full]'),
        priceCompare: card.querySelector('[data-bundle-builder-price-compare]'),
        swatches: [...card.querySelectorAll('[data-bundle-builder-swatch]')],
        toggle: card.querySelector('[data-bundle-builder-toggle]'),
        toggleLabel: card.querySelector('[data-bundle-builder-toggle-label]')
      };
    }

    currentOption(card) {
      return card.options[card.index];
    }

    // Swatch: show another colour product in the same card
    setCardOption(card, index) {
      const option = card.options[index];
      if (!option || index === card.index) return;
      card.index = index;

      const format = this.config.moneyFormat;

      if (card.image && option.image) {
        card.image.src = option.image;
        card.image.srcset = option.srcset || '';
        card.image.alt = option.alt || option.title;
      }

      card.title.textContent = option.title;
      card.subtitle.textContent = option.subtitle;
      card.subtitle.hidden = !option.subtitle;

      const rating = parseFloat(option.rating) || 0;
      card.rating.hidden = !rating;
      card.stars.style.setProperty('--bundle-builder-rating', `${(rating / 5) * 100}%`);
      card.ratingValue.textContent = rating.toFixed(1);
      card.ratingCount.textContent = `(${option.ratingCount || 0})`;

      card.priceShort.textContent = formatMoneyShort(option.price, format);
      card.priceFull.textContent = formatMoney(option.price, format);
      card.priceCompare.hidden = !option.compareAt;
      if (option.compareAt) card.priceCompare.textContent = formatMoneyShort(option.compareAt, format);

      card.swatches.forEach((swatch, i) => {
        swatch.classList.toggle('is-active', i === index);
        swatch.setAttribute('aria-pressed', String(i === index));
      });

      this.render();
    }

    /* ---------- Selection ---------- */

    isSelected(variantId) {
      return this.selection.some((item) => item.variantId === variantId);
    }

    toggle(card) {
      const option = this.currentOption(card);
      if (!option || !option.available) return;

      const index = this.selection.findIndex((item) => item.variantId === option.variantId);
      if (index > -1) {
        this.selection.splice(index, 1);
      } else if (this.selection.length >= this.config.max) {
        this.alert(fillTemplate(this.strings.noteLimit, { max: this.config.max }));
        return;
      } else {
        this.selection.push(option);
      }

      this.noteOverride = '';
      this.render();
    }

    remove(variantId) {
      this.selection = this.selection.filter((item) => String(item.variantId) !== String(variantId));
      this.noteOverride = '';
      this.render();
    }

    // Highest tier reached, and the next one
    tiers() {
      const count = this.selection.length;
      const tiers = this.config.tiers;
      const current = [...tiers].reverse().find((tier) => count >= tier.quantity) || null;
      const next = tiers.find((tier) => count < tier.quantity) || null;
      return { current, next };
    }

    pieces(count) {
      return count === 1 ? this.strings.pieceSingular : this.strings.piecePlural;
    }

    /* ---------- Render ---------- */

    render() {
      const { min, max, moneyFormat } = this.config;
      const count = this.selection.length;
      const full = count >= max;
      const { current, next } = this.tiers();

      const subtotal = this.selection.reduce((sum, item) => sum + item.price, 0);
      const percent = current ? current.percent : 0;
      const saving = Math.round((subtotal * percent) / 100);
      const total = subtotal - saving;

      const values = {
        count,
        min,
        max,
        percent,
        next_percent: next ? next.percent : percent,
        remaining: next ? next.quantity - count : 0,
        pieces: this.pieces(next ? next.quantity - count : 0),
        amount: formatMoney(saving, moneyFormat)
      };

      this.renderCards(full);
      this.renderProgress(count, current, next, values);
      this.renderSlots(count);

      // summary + totals
      const countLabel = this.querySelector('[data-bundle-builder-count]');
      countLabel.textContent = count >= min && current
        ? fillTemplate(this.strings.countApplied, values)
        : fillTemplate(this.strings.countBelow, values);

      const compare = this.querySelector('[data-bundle-builder-compare]');
      compare.hidden = saving <= 0;
      compare.textContent = formatMoney(subtotal, moneyFormat);
      this.querySelector('[data-bundle-builder-total]').textContent = formatMoney(total, moneyFormat);

      let note = '';
      if (saving > 0) {
        note = fillTemplate(this.strings.noteSave, values);
      } else if (next && next.percent > 0) {
        note = fillTemplate(this.strings.noteAdd, { ...values, percent: next.percent });
      }
      this.note.textContent = this.noteOverride || note;

      // button
      const complete = count >= min;
      this.submit.setAttribute('aria-disabled', String(!complete));
      if (!this.submit.classList.contains('is-loading')) {
        this.submitLabel.textContent = complete
          ? `${this.strings.submit} · ${formatMoney(total, moneyFormat)}`
          : this.strings.submit;
      }
    }

    renderCards(full) {
      this.cards.forEach((card) => {
        const option = this.currentOption(card);
        if (!option) return;

        const selected = this.isSelected(option.variantId);
        card.el.classList.toggle('is-selected', selected);

        card.toggle.disabled = !option.available;
        card.toggle.setAttribute('aria-pressed', String(selected));
        card.toggle.setAttribute('aria-disabled', String(option.available && full && !selected));
        card.toggle.setAttribute(
          'aria-label',
          `${selected ? this.strings.added : this.strings.add}: ${option.title}${option.subtitle ? ` – ${option.subtitle}` : ''}`
        );

        let label = this.strings.soldOut;
        if (option.available) label = selected ? this.strings.added : this.strings.add;
        card.toggleLabel.textContent = label;
      });
    }

    renderProgress(count, current, next, values) {
      const { min, tiers } = this.config;
      const last = tiers[tiers.length - 1].quantity;

      let message = this.strings.progressMax;
      if (!current) message = this.strings.progressAdd;
      else if (next) message = this.strings.progressUnlocked;

      this.querySelector('[data-bundle-builder-message]').innerHTML = highlight(
        fillTemplate(message, {
          ...values,
          percent: current ? current.percent : next.percent
        })
      );

      // desktop: markers at each tier
      const tiersTrack = this.querySelector('.bundle-builder__track--tiers');
      tiersTrack.querySelector('[data-bundle-builder-fill]').style.width = `${Math.min(count / last, 1) * 100}%`;
      tiersTrack.querySelectorAll('[data-bundle-builder-marker]').forEach((marker) => {
        marker.classList.toggle('is-reached', count >= Number(marker.dataset.bundleBuilderMarker));
      });

      // mobile: one step per piece up to the minimum
      const stepsTrack = this.querySelector('.bundle-builder__track--steps');
      stepsTrack.querySelector('[data-bundle-builder-fill]').style.width = `${Math.min(count / min, 1) * 100}%`;
      stepsTrack.querySelectorAll('[data-bundle-builder-step]').forEach((step) => {
        const position = Number(step.dataset.bundleBuilderStep);
        step.classList.toggle('is-reached', count >= position);
        step.classList.toggle('is-current', position === count && count < min);
      });
    }

    renderSlots(count) {
      const { min, max } = this.config;
      // desktop: one free slot after the picks (up to max); mobile hides that extra slot
      const slotCount = Math.min(max, Math.max(min, count + 1));

      const filled = this.selection.map((item) => {
        const label = fillTemplate(this.strings.remove, {
          title: `${item.title}${item.subtitle ? ` – ${item.subtitle}` : ''}`
        });
        const image = item.thumb ? `<img src="${escapeHtml(item.thumb)}" alt="" width="52" height="52" loading="lazy">` : '';
        return `<button type="button" class="bundle-builder__slot bundle-builder__slot--filled" data-bundle-builder-remove="${item.variantId}" aria-label="${escapeHtml(label)}">${image}</button>`;
      });

      const empty = [];
      for (let i = count; i < slotCount; i += 1) {
        const extra = i >= min ? ' bundle-builder__slot--extra' : '';
        empty.push(
          `<button type="button" class="bundle-builder__slot bundle-builder__slot--empty${extra}" data-bundle-builder-empty aria-label="${escapeHtml(this.strings.emptySlot)}">` +
            '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M6 0v12M0 6h12" stroke="currentColor" stroke-width="1.2"/></svg>' +
          '</button>'
        );
      }

      this.slots.innerHTML = filled.concat(empty).join('');
    }

    // Short message in the price note (bundle full / too small / error), with a nudge
    alert(message) {
      this.noteOverride = message;
      this.note.textContent = message;
      this.note.classList.remove('is-alert');
      void this.note.offsetWidth; // restart the animation
      this.note.classList.add('is-alert');

      clearTimeout(this.alertTimer);
      this.alertTimer = setTimeout(() => {
        this.noteOverride = '';
        this.note.classList.remove('is-alert');
        this.render();
      }, 3500);
    }

    /* ---------- Events ---------- */

    onClick(event) {
      const target = event.target;

      const tab = target.closest('[data-bundle-builder-tab]');
      if (tab) {
        this.selectTab(tab);
        return;
      }

      if (target.closest('[data-bundle-builder-tabs-next]')) {
        this.tabsScroller.scrollBy({ left: this.tabsScroller.clientWidth * 0.6, behavior: 'smooth' });
        return;
      }

      const swatch = target.closest('[data-bundle-builder-swatch]');
      if (swatch) {
        const card = this.cards.find((item) => item.el.contains(swatch));
        if (card) this.setCardOption(card, Number(swatch.dataset.bundleBuilderSwatch));
        return;
      }

      const toggle = target.closest('[data-bundle-builder-toggle], [data-bundle-builder-media]');
      if (toggle) {
        // a drag on the desktop slider ends with a click: ignore it
        if (this.swiper && this.swiper.allowClick === false) return;
        const card = this.cards.find((item) => item.el.contains(toggle));
        if (card) this.toggle(card);
        return;
      }

      const removeSlot = target.closest('[data-bundle-builder-remove]');
      if (removeSlot) {
        this.remove(removeSlot.dataset.bundleBuilderRemove);
        return;
      }

      if (target.closest('[data-bundle-builder-empty]')) {
        this.viewport?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }

      if (target.closest('[data-bundle-builder-submit]')) {
        this.addToCart();
      }
    }

    // Theme editor: selecting a "Collection tab" block opens that tab
    onBlockSelect(event) {
      if (!this.contains(event.target)) return;
      const tab = event.target.closest('[data-bundle-builder-tab]');
      if (tab) this.selectTab(tab);
    }

    /* ---------- Tabs ---------- */

    selectTab(tab, { scroll = true } = {}) {
      this.tabs.forEach((item) => {
        const active = item === tab;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-selected', String(active));
        item.tabIndex = active ? 0 : -1;
      });
      if (tab.id) this.slider?.setAttribute('aria-labelledby', tab.id);

      const ids = tab.dataset.bundleBuilderTab;
      const slides = ids === 'all'
        ? this.mixedSlides
        : ids.split(',').map((id) => this.cards.find((card) => card.productId === id)?.slide).filter(Boolean);

      this.wrapper?.replaceChildren(...slides);
      this.resetSlideStyles();

      if (this.swiper) {
        this.swiper.update();
        this.swiper.slideTo(0, 0);
      } else if (this.wrapper) {
        this.wrapper.scrollTo({ top: 0, left: 0 });
      }

      if (scroll && this.tabsScroller) {
        const start = tab.offsetLeft - this.tabsScroller.offsetLeft;
        const end = start + tab.offsetWidth;
        const { scrollLeft, clientWidth } = this.tabsScroller;
        if (start < scrollLeft || end > scrollLeft + clientWidth) {
          this.tabsScroller.scrollTo({ left: start - 24, behavior: 'smooth' });
        }
      }
    }

    updateTabsArrow() {
      if (!this.tabsScroller || !this.tabsNext) return;
      const { scrollLeft, scrollWidth, clientWidth } = this.tabsScroller;
      this.tabsNext.hidden = scrollLeft + clientWidth >= scrollWidth - 2;
    }

    /* ---------- Slider (Swiper) ---------- */

    initSlider() {
      if (!this.slider || !this.ready) return;

      if (typeof window.Swiper !== 'function') {
        // Swiper is loaded (deferred) by the header's search drawer: wait for the page load
        this.waitForSwiper = () => this.initSlider();
        if (document.readyState !== 'complete') window.addEventListener('load', this.waitForSwiper, { once: true });
        return;
      }

      const desktop = this.mediaQuery.matches;
      const scrollbar = this.querySelector('[data-bundle-builder-scrollbar]');

      const shared = {
        wrapperClass: 'bundle-builder__wrapper',
        slideClass: 'bundle-builder__slide',
        watchOverflow: true,
        scrollbar: {
          el: scrollbar,
          draggable: true,
          dragClass: 'bundle-builder__scrollbar-drag',
          lockClass: 'is-locked'
        },
        a11y: { enabled: false }
      };

      const options = desktop
        ? {
            ...shared,
            direction: 'horizontal',
            slidesPerView: 4.2,
            spaceBetween: 16,
            grabCursor: true,
            breakpoints: {
              1024: { slidesPerView: 5.2 },
              1280: { slidesPerView: 6.2 }
            },
            navigation: {
              prevEl: this.querySelector('[data-bundle-builder-prev]'),
              nextEl: this.querySelector('[data-bundle-builder-next]'),
              disabledClass: 'is-disabled',
              lockClass: 'is-locked'
            },
            on: {
              afterInit: (swiper) => this.updateArrowPosition(swiper),
              resize: (swiper) => this.updateArrowPosition(swiper),
              update: (swiper) => this.updateArrowPosition(swiper)
            }
          }
        : {
            ...shared,
            direction: 'vertical',
            slidesPerView: 'auto',
            cssMode: true,
            spaceBetween: 0
          };

      this.swiper = new window.Swiper(this.slider, options);
    }

    destroySlider() {
      if (!this.swiper) return;
      this.swiper.destroy(true, true);
      this.swiper = null;
      this.resetSlideStyles();
      this.viewport?.style.removeProperty('--bundle-builder-arrow-top');
    }

    // Swiper only sizes the slides of the current tab: clear sizes left on the others
    resetSlideStyles() {
      this.cards.forEach((card) => card.slide.removeAttribute('style'));
    }

    onBreakpointChange() {
      this.destroySlider();
      this.initSlider();
    }

    // Desktop arrows sit at the middle of the (square) product images
    updateArrowPosition(swiper) {
      const size = swiper.slidesSizesGrid?.[0];
      if (size) this.viewport.style.setProperty('--bundle-builder-arrow-top', `${size / 2}px`);
    }

    /* ---------- Cart ---------- */

    async addToCart() {
      const { min, cartAddUrl } = this.config;
      const count = this.selection.length;

      if (count < min) {
        const remaining = min - count;
        this.alert(fillTemplate(this.strings.noteMin, { remaining, pieces: this.pieces(remaining), min, count }));
        return;
      }

      this.submit.classList.add('is-loading');
      this.submit.setAttribute('aria-busy', 'true');
      this.submitLabel.textContent = this.strings.adding;

      try {
        const response = await fetch(cartAddUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            items: this.selection.map((item) => ({ id: item.variantId, quantity: 1 }))
          })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.description || data.message || this.strings.error);

        this.afterAdd();
      } catch (error) {
        this.submit.classList.remove('is-loading');
        this.submit.removeAttribute('aria-busy');
        this.render();
        this.alert(error.message || this.strings.error);
      }
    }

    afterAdd() {
      const { afterAdd, cartUrl, checkoutUrl } = this.config;
      document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));

      if (afterAdd === 'checkout') {
        window.location.href = checkoutUrl;
        return;
      }

      const rebuy = window.Rebuy;
      if (afterAdd === 'drawer' && rebuy?.SmartCart && typeof rebuy.SmartCart.show === 'function') {
        const refresh = typeof rebuy.Cart?.fetchCart === 'function' ? rebuy.Cart.fetchCart() : null;
        Promise.resolve(refresh)
          .catch(() => {})
          .then(() => rebuy.SmartCart.show());

        this.selection = [];
        this.submit.classList.remove('is-loading');
        this.submit.removeAttribute('aria-busy');
        this.render();
        return;
      }

      window.location.href = cartUrl;
    }
  }

  customElements.define('bundle-builder', BundleBuilder);
})();
