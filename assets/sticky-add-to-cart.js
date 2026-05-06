class StickyAddToCart extends HTMLElement {
  connectedCallback() {
    // Reparent to <body> so position: fixed is always relative to the viewport,
    // not to a transformed/filtered ancestor (e.g. product-details column).
    if (this.parentElement && this.parentElement !== document.body) {
      document.body.appendChild(this);
      // appendChild triggers another connectedCallback — bail out of this one
      // so we don't double-bind listeners.
      return;
    }

    this.button = this.querySelector('[data-sticky-add-to-cart]');
    this.priceEl = this.querySelector('[data-sticky-price]');
    this.buttonLabel = this.querySelector('[data-sticky-button-label]');
    this.indicatorEl = this.querySelector('[data-sticky-indicator]');

    this.button?.addEventListener('click', this.#handleAddToCart);
    this.addEventListener('click', this.#handleVariantClick);
    document.addEventListener('variant:update', this.#handleVariantUpdate);

    this.#observeRecommendations();
  }

  disconnectedCallback() {
    document.removeEventListener('variant:update', this.#handleVariantUpdate);
    this.#observer?.disconnect();
    if (this.#scrollHandler) window.removeEventListener('scroll', this.#scrollHandler);
  }

  /** @type {IntersectionObserver | undefined} */
  #observer;

  /** @type {((event: Event) => void) | undefined} */
  #scrollHandler;

  /** Latched: once the user has reached "You may also like", stay shown forever (until FBT scrolls back into view). */
  #reachedRecommendations = false;
  #fbtVisible = false;
  #upsellVisible = false;
  /** Latched: once the upsell section has been seen, keep the bar hidden until the user scrolls back to the top of the page. */
  #upsellSeen = false;

  /** @type {Element[]} */
  #fbtElements = [];

  /** @type {Element[]} */
  #upsellElements = [];

  #findUpsellElements = () => {
    // 1. Explicit attribute hook — easiest for theme authors to opt in.
    const byAttr = Array.from(document.querySelectorAll('[data-essential-upsell-element]'));

    // 2. Auto-detect Shopify "Essential Upsell" app block wrappers.
    //    Shopify renders app blocks as <div id="shopify-block-{blockId}">,
    //    where {blockId} contains "essential_upsell" for this app.
    //    Exclude the FBT variant — that's handled by #findFbtElements.
    const byId = Array.from(
      document.querySelectorAll('[id*="essential_upsell" i], [id*="essential-upsell" i]')
    ).filter((el) => !/frequently[_-]bought[_-]together/i.test(el.id));

    return Array.from(new Set([...byAttr, ...byId]));
  };

  #findFbtElements = () => {
    // 1. Match by id/class containing the phrase (Shopify app block wrappers,
    //    custom CSS classes, etc.)
    const byAttr = Array.from(
      document.querySelectorAll(
        '[id*="frequently_bought_together" i], [id*="frequently-bought-together" i], [class*="frequently-bought-together" i], [class*="frequently_bought_together" i], [data-testid*="frequently-bought-together" i], [data-block-name*="frequently-bought-together" i]'
      )
    );

    // 2. Fallback — find any heading whose text contains "Frequently bought
    //    together" and use its closest section/block ancestor. This catches
    //    apps that render the section without any matching id/class on a
    //    wrapper.
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4'));
    const byText = headings
      .filter((h) => /frequently\s+bought\s+together/i.test(h.textContent || ''))
      .map((h) => h.closest('[id^="shopify-block-"], section, .shopify-section, [data-section-type], div') || h);

    // De-duplicate.
    const set = new Set([...byAttr, ...byText]);
    return Array.from(set);
  };

  #observeRecommendations = () => {
    // Make sure we start hidden no matter what.
    this.dataset.visible = 'false';

    const recommendations = document.querySelector('product-recommendations');

    this.#fbtElements = this.#findFbtElements();
    this.#upsellElements = this.#findUpsellElements();

    if (!recommendations && this.#fbtElements.length === 0 && this.#upsellElements.length === 0) return;

    const updateVisibility = () => {
      // Hide whenever we're near the top of the page — even if the user has
      // already scrolled past "You may also like" and back up. This guarantees
      // the bar never appears at the top of the product page.
      const nearPageTop = window.scrollY <= 200;

      // Show when: user has reached "You may also like"
      // AND not at the page top
      // AND Frequently Bought Together is not in view
      // AND the essential-upsell element is not in view
      // AND the upsell hasn't been seen yet on this scroll session
      //     (latched on first sighting; only reset when user scrolls back to top).
      // (Footer is intentionally NOT a hide trigger — the bar should stay
      //  sticky all the way through the footer.)
      const shouldShow =
        this.#reachedRecommendations &&
        !nearPageTop &&
        !this.#fbtVisible &&
        !this.#upsellVisible &&
        !this.#upsellSeen;
      this.dataset.visible = shouldShow ? 'true' : 'false';
    };

    const isInView = (el) => {
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const rect = el.getBoundingClientRect();
      return rect.top < vh && rect.bottom > 0 && rect.height > 0;
    };

    const recomputeFbtVisibility = () => {
      this.#fbtVisible = this.#fbtElements.some(isInView);
      updateVisibility();
    };

    const recomputeUpsellVisibility = () => {
      this.#upsellVisible = this.#upsellElements.some(isInView);
      // Latch only AFTER the user has reached "You may also like" — otherwise
      // the initial scroll-down (which passes the upsell before recommendations)
      // would latch immediately and the bar would never appear.
      if (this.#upsellVisible && this.#reachedRecommendations) this.#upsellSeen = true;
      updateVisibility();
    };

    // Watch scroll position to:
    //  1. Reset BOTH the upsell latch AND the "reached recommendations" latch
    //     when the user is fully back at the top. Resetting the recommendations
    //     latch ensures the bar stays hidden on the next scroll-down until the
    //     user actually reaches "You may also like" again — without this, a
    //     small scroll-down would re-show the bar immediately.
    //  2. Re-evaluate the page-top guard so the bar hides as soon as the user
    //     scrolls into the top region (the IntersectionObserver alone won't
    //     fire just from scroll position changes).
    let lastNearTop = window.scrollY <= 200;
    const onScroll = () => {
      if (window.scrollY <= 10) {
        this.#upsellSeen = false;
        this.#reachedRecommendations = false;
      }
      const nearTop = window.scrollY <= 200;
      if (nearTop !== lastNearTop) {
        lastNearTop = nearTop;
        updateVisibility();
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    this.#scrollHandler = onScroll;

    this.#observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === recommendations) {
            // Latch — once recommendations has entered view, keep "reached" true.
            if (entry.isIntersecting) this.#reachedRecommendations = true;
          } else if (this.#fbtElements.includes(/** @type {Element} */ (entry.target))) {
            recomputeFbtVisibility();
            return; // recomputeFbtVisibility already calls updateVisibility
          } else if (this.#upsellElements.includes(/** @type {Element} */ (entry.target))) {
            recomputeUpsellVisibility();
            return;
          }
        }
        updateVisibility();
      },
      { threshold: 0, rootMargin: '0px 0px 0px 0px' }
    );

    if (recommendations) this.#observer.observe(recommendations);
    this.#fbtElements.forEach((el) => this.#observer?.observe(el));
    this.#upsellElements.forEach((el) => this.#observer?.observe(el));

    // Apps sometimes render sections asynchronously (after our initial
    // querySelectorAll). Re-scan a couple of times to pick up late-rendered
    // elements.
    const rescan = () => {
      const freshFbt = this.#findFbtElements();
      let addedFbt = false;
      freshFbt.forEach((el) => {
        if (!this.#fbtElements.includes(el)) {
          this.#fbtElements.push(el);
          this.#observer?.observe(el);
          addedFbt = true;
        }
      });
      if (addedFbt) recomputeFbtVisibility();

      const freshUpsell = this.#findUpsellElements();
      let addedUpsell = false;
      freshUpsell.forEach((el) => {
        if (!this.#upsellElements.includes(el)) {
          this.#upsellElements.push(el);
          this.#observer?.observe(el);
          addedUpsell = true;
        }
      });
      if (addedUpsell) recomputeUpsellVisibility();
    };
    setTimeout(rescan, 600);
    setTimeout(rescan, 2000);
    setTimeout(rescan, 5000);
  };

  #mainVariantPicker() {
    return document.querySelector('variant-picker[data-template-product-match="true"]') ||
      document.querySelector('variant-picker');
  }

  /**
   * Click on a sticky variant button -> proxy to the matching main picker input
   * (its existing change handler runs the fetch and dispatches variant:update).
   * @param {Event} event
   */
  #handleVariantClick = (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-option-value-id]') : null;
    if (!target || target === this.button) return;
    if (target.classList.contains('is-unavailable')) return;
    if (target.classList.contains('is-selected')) {
      // Already selected — if it's an accordion option, just close the accordion.
      const details = target.closest('details.sticky-add-to-cart__accordion');
      if (details instanceof HTMLDetailsElement) details.open = false;
      return;
    }

    const id = target.getAttribute('data-option-value-id');
    if (!id) return;

    const picker = this.#mainVariantPicker();
    if (!picker) return;

    const mainInput = picker.querySelector(`input[data-option-value-id="${CSS.escape(id)}"]`);
    if (!(mainInput instanceof HTMLInputElement)) return;

    mainInput.checked = true;
    mainInput.dispatchEvent(new Event('change', { bubbles: true }));

    // Optimistic UI: mark this sticky button as selected immediately.
    this.#updateSelectedStates(id, target);

    // Close the accordion after picking, mirroring native dropdown UX.
    const details = target.closest('details.sticky-add-to-cart__accordion');
    if (details instanceof HTMLDetailsElement) {
      const valueEl = details.querySelector('[data-sticky-option-value]');
      if (valueEl) valueEl.textContent = target.textContent?.trim() ?? valueEl.textContent;
      details.open = false;
    }
  };

  /**
   * Mark the sticky button matching the given option value id as selected,
   * and clear the others within its parent group.
   * @param {string} id
   * @param {Element} [knownTarget]
   */
  #updateSelectedStates(id, knownTarget) {
    const button = knownTarget instanceof Element
      ? knownTarget
      : this.querySelector(`[data-option-value-id="${CSS.escape(id)}"]`);
    if (!button) return;

    const group = button.closest('[data-sticky-color-option], .sticky-add-to-cart__option-values');
    if (!group) return;

    group.querySelectorAll('[data-option-value-id]').forEach((el) => {
      const isSelected = el === button;
      el.classList.toggle('is-selected', isSelected);
      el.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    });
  }

  #handleAddToCart = () => {
    const form = document.querySelector(
      'product-form-component form[data-type="add-to-cart-form"]'
    );
    if (!(form instanceof HTMLFormElement)) return;
    if (typeof form.requestSubmit === 'function') {
      form.requestSubmit();
    } else {
      form.submit();
    }
  };

  /**
   * After the main variant picker fetches the new section HTML, sync our price,
   * image, button label, and selected states from that fresh markup.
   * @param {Event} event
   */
  #handleVariantUpdate = (event) => {
    const detail = /** @type {{ data?: { html?: Document } } | undefined} */ (
      /** @type {CustomEvent} */ (event).detail
    );
    const html = detail?.data?.html;
    if (!html) return;

    // Price — read from the freshest source available in the response.
    // The response includes the sticky bar itself with the new price already
    // formatted, so [data-sticky-price] is the most reliable selector. The
    // bare .price fallback would otherwise pick up the first product card's
    // price from the recommendations carousel.
    const priceEl = html.querySelector('[data-sticky-price]')
      || html.querySelector('.price__regular .price__current')
      || html.querySelector('.price .price__current')
      || html.querySelector('[data-price]')
      || html.querySelector('.product-details .price, .product-information .price')
      || html.querySelector('.price');
    const priceText = priceEl?.textContent?.trim();
    if (priceText) {
      if (this.priceEl) this.priceEl.textContent = priceText;
      if (this.buttonLabel) this.buttonLabel.textContent = `Add to cart: ${priceText}`;
    }

    // Selected states — re-read from the new variant picker markup.
    const newPicker = html.querySelector('variant-picker');
    if (newPicker) {
      /** @type {NodeListOf<HTMLInputElement>} */
      const selectedInputs = newPicker.querySelectorAll('input[checked], input[type="radio"]:checked');
      selectedInputs.forEach((input) => {
        const id = input.getAttribute('data-option-value-id');
        if (id) this.#updateSelectedStates(id);
      });

      // Also refresh accordion summary values.
      this.querySelectorAll('details.sticky-add-to-cart__accordion').forEach((details) => {
        const selectedBtn = details.querySelector('.sticky-add-to-cart__option-button.is-selected');
        const valueEl = details.querySelector('[data-sticky-option-value]');
        if (selectedBtn && valueEl) valueEl.textContent = selectedBtn.textContent?.trim() ?? '';
      });
    }

    // Indicator swatch — pull from the new variant's featured image.
    const newImg = html.querySelector('media-gallery img');
    const newSrc = newImg?.getAttribute('src');
    if (newSrc && this.indicatorEl instanceof HTMLElement) {
      this.indicatorEl.style.setProperty('--sticky-indicator-bg', `url(${newSrc})`);
    }
  };
}

if (!customElements.get('sticky-add-to-cart')) {
  customElements.define('sticky-add-to-cart', StickyAddToCart);
}
