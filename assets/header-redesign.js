// ==============================
// Layout Heights
// ==============================
(() => {
  const body = document.body;
  const headerSection = document.querySelector('#shopify-section-header');
  const announcementSection = document.querySelector(
    '#shopify-section-announcement-bar'
  );

  if (!body) return;

  let headerHeight = -1;
  let announcementHeight = -1;
  let frame = 0;

  const updateLayoutHeights = () => {
    frame = 0;

    const nextHeaderHeight = headerSection
      ? headerSection.offsetHeight
      : 0;
    const nextAnnouncementHeight = announcementSection
      ? announcementSection.offsetHeight
      : 0;

    if (nextHeaderHeight !== headerHeight) {
      headerHeight = nextHeaderHeight;
      body.style.setProperty(
        '--header-height',
        `${headerHeight}px`
      );
    }

    if (nextAnnouncementHeight !== announcementHeight) {
      announcementHeight = nextAnnouncementHeight;
      body.style.setProperty(
        '--announcement-bar-height',
        `${announcementHeight}px`
      );
    }
  };

  const requestLayoutHeightUpdate = () => {
    if (frame) return;

    frame = requestAnimationFrame(updateLayoutHeights);
  };

  updateLayoutHeights();

  window.addEventListener('resize', requestLayoutHeightUpdate, {
    passive: true
  });

  window.addEventListener(
    'orientationchange',
    requestLayoutHeightUpdate,
    { passive: true }
  );

  if ('ResizeObserver' in window) {
    const layoutObserver = new ResizeObserver(
      requestLayoutHeightUpdate
    );

    if (headerSection) layoutObserver.observe(headerSection);
    if (announcementSection) {
      layoutObserver.observe(announcementSection);
    }
  }
})();


// ==============================
// Header / Mega Menu / Sticky
// ==============================
(() => {
  const header = document.querySelector('[data-created-header]');
  const section = document.querySelector('#shopify-section-header');
  const announcementSection = document.querySelector(
    '#shopify-section-announcement-bar'
  );

  if (!header) return;

  const sticky = header.dataset.sticky;
  const triggers = header.querySelectorAll('.new_megamenu_item');
  const singles = header.querySelectorAll('.new_single_item');
  const panels = header.querySelectorAll('.new_megamenu_main');
  const openWrap = header.querySelector('[data-nav-open-wrap]');
  const closeWrap = header.querySelector('[data-nav-close-wrap]');
  const interactiveDetails = header.querySelectorAll('details');
  const predictiveSearches = header.querySelectorAll(
    'predictive-search'
  );

  const state = {
    mega: false,
    nav: false,
    search: document.documentElement.classList.contains(
      'search-drawer-open'
    )
  };

  const TOP_THRESHOLD = 10;
  const DIRECTION_THRESHOLD = 6;

  let lastY = Math.max(window.scrollY, 0);
  let directionAnchorY = lastY;
  let scrollFrame = 0;
  let announcementHeight = announcementSection
    ? announcementSection.offsetHeight
    : 0;
  let headerHeight = section
    ? section.offsetHeight
    : header.offsetHeight;
  const sectionIsFixed = section
    ? getComputedStyle(section).position === 'fixed'
    : false;
  let lastStickyTop = -1;
  let lastSolid = null;
  let lastScrolled = null;
  let lastHidden = null;

  const setClassState = (element, className, value, previous) => {
    if (previous !== value) {
      element.classList.toggle(className, value);
    }

    return value;
  };

  const hasOpenInteractiveElement = () => {
    for (const details of interactiveDetails) {
      const inlineSearch = details.closest(
        '[data-search-mode="inline"]'
      );

      if (details.open && !inlineSearch) {
        return true;
      }
    }

    for (const predictive of predictiveSearches) {
      if (predictive.hasAttribute('open')) {
        return true;
      }
    }

    return false;
  };

  const isBlocked = () =>
    state.mega ||
    state.nav ||
    state.search ||
    hasOpenInteractiveElement();

  const updateMeasuredHeights = () => {
    announcementHeight = announcementSection
      ? announcementSection.offsetHeight
      : 0;
    headerHeight = section
      ? section.offsetHeight
      : header.offsetHeight;
  };

  const updateStickyTop = (y) => {
    if (!section || sticky === 'none') return;

    const stickyTop = Math.max(0, announcementHeight - y);

    if (stickyTop !== lastStickyTop) {
      lastStickyTop = stickyTop;
      section.style.setProperty(
        '--header-sticky-top',
        `${stickyTop}px`
      );
    }
  };

  const setHidden = (hidden) => {
    if (!section || sticky !== 'scroll_up') {
      hidden = false;
    }

    if (section) {
      lastHidden = setClassState(
        section,
        'is-hidden',
        hidden,
        lastHidden
      );
    }

    // Remove any stale class from the inner header left by older code/CSS.
    header.classList.remove('is-hidden');
  };

  const render = (y = Math.max(window.scrollY, 0)) => {
    const isScrolled = y > TOP_THRESHOLD;
    const isSolid = isScrolled || state.mega || state.nav || state.search;

    lastSolid = setClassState(
      header,
      'is-solid',
      isSolid,
      lastSolid
    );

    if (section && sticky !== 'none') {
      lastScrolled = setClassState(
        section,
        'is-scrolled',
        isScrolled,
        lastScrolled
      );

      updateStickyTop(y);
    } else if (section) {
      lastScrolled = setClassState(
        section,
        'is-scrolled',
        false,
        lastScrolled
      );

      section.classList.remove('is-hidden');
      section.style.removeProperty('--header-sticky-top');
    }
  };

  const closeMega = () => {
    triggers.forEach((item) => {
      item.classList.remove('is-open');
      item.setAttribute('aria-expanded', 'false');
    });

    panels.forEach((panel) => {
      panel.classList.remove('is-open');
    });

    state.mega = false;

    render();
  };

  const openMega = (item) => {
    closeMega();

    item.classList.add('is-open');
    item.setAttribute('aria-expanded', 'true');

    const panel = header.querySelector(
      `.new_megamenu_main[data-id="${item.id}"]`
    );

    if (panel) {
      panel.classList.add('is-open');
    }

    state.mega = true;
    setHidden(false);

    render();
  };

  const processScroll = () => {
    scrollFrame = 0;

    const y = Math.max(window.scrollY, 0);

    render(y);

    if (sticky === 'scroll_up') {
      const blocked = isBlocked();

      if (y <= TOP_THRESHOLD || blocked) {
        setHidden(false);
        directionAnchorY = y;
      } else {
        const delta = y - directionAnchorY;

        if (Math.abs(delta) >= DIRECTION_THRESHOLD) {
          const hideStart = sectionIsFixed
            ? TOP_THRESHOLD
            : announcementHeight + headerHeight;

          setHidden(delta > 0 && y > hideStart);
          directionAnchorY = y;
        }
      }
    } else {
      setHidden(false);
      directionAnchorY = y;
    }

    lastY = y;
  };

  const onScroll = () => {
    if (scrollFrame) return;

    scrollFrame = requestAnimationFrame(processScroll);
  };

  const onResize = () => {
    updateMeasuredHeights();
    directionAnchorY = Math.max(window.scrollY, 0);
    render(directionAnchorY);
  };

  triggers.forEach((item) => {
    item.addEventListener('mouseenter', () => {
      openMega(item);
    });

    item.addEventListener('focus', () => {
      openMega(item);
    });
  });

  singles.forEach((item) => {
    item.addEventListener('mouseenter', closeMega);
  });

  header.addEventListener('pointerleave', (event) => {
    if (event.pointerType === 'mouse') {
      closeMega();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMega();
    }
  });

  if (openWrap && closeWrap) {
    const openButton = openWrap.querySelector('button');
    const closeButton = closeWrap.querySelector('button');

    if (openButton) {
      openButton.addEventListener('click', () => {
        openWrap.hidden = true;
        closeWrap.hidden = false;

        state.nav = true;
        setHidden(false);

        render();
      });
    }

    if (closeButton) {
      closeButton.addEventListener('click', () => {
        closeWrap.hidden = true;
        openWrap.hidden = false;

        state.nav = false;

        const drawerClose = document.querySelector(
          '[js-close-mobile-nav]'
        );

        if (drawerClose) {
          drawerClose.click();
        }

        render();
      });
    }
  }

  // Search drawer (search-drawer.js) sits below the header: keep the
  // header shown while it is open, resume scroll-up hiding once closed
  const onSearchDrawerOpen = () => {
    state.search = true;
    setHidden(false);
    directionAnchorY = Math.max(window.scrollY, 0);
    render(directionAnchorY);
  };

  const onSearchDrawerClose = () => {
    state.search = false;
    directionAnchorY = Math.max(window.scrollY, 0);
    render(directionAnchorY);
  };

  if (window.createdHeaderOff) {
    window.createdHeaderOff();
  }

  document.addEventListener('search-drawer:open', onSearchDrawerOpen);
  document.addEventListener('search-drawer:close', onSearchDrawerClose);

  window.addEventListener('scroll', onScroll, {
    passive: true
  });

  window.addEventListener('resize', onResize, {
    passive: true
  });

  window.addEventListener('orientationchange', onResize, {
    passive: true
  });

  let stickyResizeObserver;

  if ('ResizeObserver' in window && (section || announcementSection)) {
    stickyResizeObserver = new ResizeObserver(() => {
      updateMeasuredHeights();
      render(Math.max(window.scrollY, 0));
    });

    if (section) stickyResizeObserver.observe(section);
    if (announcementSection) {
      stickyResizeObserver.observe(announcementSection);
    }
  }

  window.createdHeaderOff = () => {
    document.removeEventListener('search-drawer:open', onSearchDrawerOpen);
    document.removeEventListener('search-drawer:close', onSearchDrawerClose);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);

    if (scrollFrame) {
      cancelAnimationFrame(scrollFrame);
      scrollFrame = 0;
    }

    if (stickyResizeObserver) {
      stickyResizeObserver.disconnect();
    }
  };

  updateMeasuredHeights();
  render(lastY);
  processScroll();
})();


// ==============================
// Search
// ==============================
(() => {
  const header = document.querySelector('[data-created-header]');
  const wrap =
    header &&
    header.querySelector('.created-header__icon--search');

  if (!wrap) return;

  const modal = wrap.querySelector('details-modal');
  const details = wrap.querySelector('details');
  const summary = details.querySelector('summary');
  const label = summary.querySelector(
    '.created-header__search-label'
  );
  const icon = summary.querySelector('svg');
  const dialog = details.querySelector('.search-modal');
  const input = details.querySelector(
    'input[type="search"]'
  );
  const submit = details.querySelector('.search__button');
  const predictive = details.querySelector(
    'predictive-search'
  );

  const dialogAttributes = [
    'role',
    'aria-modal',
    'aria-label'
  ].map((name) => [
    name,
    dialog.getAttribute(name)
  ]);

  const pillProperties = [
    'color',
    'font-family',
    'font-size',
    'font-weight',
    'letter-spacing'
  ];

  let inline = false;
  let frame;

  const isDesktop = () =>
    label.offsetWidth > 1 &&
    getComputedStyle(label).display !== 'none';

  const closeResults = () => {
    if (
      predictive &&
      typeof predictive.close === 'function'
    ) {
      predictive.close();
    }
  };

  const syncPill = () => {
    const pill = summary.getBoundingClientRect();
    const labelStyle = getComputedStyle(label);

    wrap.style.setProperty(
      '--search-pill-start',
      `${
        label.getBoundingClientRect().left -
        pill.left
      }px`
    );

    wrap.style.setProperty(
      '--search-pill-end',
      `${
        pill.right -
        icon.getBoundingClientRect().left
      }px`
    );

    wrap.style.setProperty(
      '--search-pill-radius',
      getComputedStyle(summary).borderRadius
    );

    pillProperties.forEach((property) => {
      wrap.style.setProperty(
        `--search-pill-${property}`,
        labelStyle.getPropertyValue(property)
      );
    });
  };

  const setInline = () => {
    if (
      details.open &&
      typeof modal.close === 'function'
    ) {
      modal.close(false);
    }

    inline = true;

    wrap.dataset.searchMode = 'inline';

    summary.inert = true;

    dialogAttributes.forEach(([name]) => {
      dialog.removeAttribute(name);
    });

    details.open = true;

    syncPill();
  };

  const setModal = () => {
    inline = false;

    wrap.dataset.searchMode = 'modal';

    summary.inert = false;

    dialogAttributes.forEach(([name, value]) => {
      if (value !== null) {
        dialog.setAttribute(name, value);
      }
    });

    closeResults();

    details.open = false;
  };

  const update = () => {
    const desktop = isDesktop();

    if (
      !wrap.dataset.searchMode ||
      desktop !== inline
    ) {
      desktop
        ? setInline()
        : setModal();
    } else if (inline) {
      syncPill();
    }
  };

  modal.addEventListener(
    'keyup',
    (event) => {
      if (
        !inline ||
        (
          event.code !== 'Escape' &&
          event.key !== 'Escape'
        )
      ) {
        return;
      }

      event.stopPropagation();

      closeResults();
    },
    true
  );

  details.addEventListener('toggle', () => {
    if (inline && !details.open) {
      details.open = true;
    }
  });

  if (submit) {
    submit.addEventListener('click', (event) => {
      if (
        !inline ||
        input.value.trim().length
      ) {
        return;
      }

      event.preventDefault();

      input.focus();
    });
  }

  wrap.addEventListener(
    'transitionend',
    (event) => {
      if (
        inline &&
        summary.contains(event.target)
      ) {
        syncPill();
      }
    }
  );

  const classObserver = new MutationObserver(() => {
    if (inline) {
      syncPill();
    }
  });

  classObserver.observe(header, {
    attributes: true,
    attributeFilter: ['class']
  });

  const onResize = () => {
    cancelAnimationFrame(frame);

    frame = requestAnimationFrame(update);
  };

  if (window.createdHeaderSearchOff) {
    window.createdHeaderSearchOff();
  }

  window.addEventListener(
    'resize',
    onResize
  );

  window.createdHeaderSearchOff = () => {
    window.removeEventListener(
      'resize',
      onResize
    );

    classObserver.disconnect();
  };

  update();
})();
