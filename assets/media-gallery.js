import { Component } from '@theme/component';
import { ThemeEvents, VariantUpdateEvent, ZoomMediaSelectedEvent } from '@theme/events';

/**
 * A custom element that renders a media gallery.
 *
 * @typedef {object} Refs
 * @property {import('./zoom-dialog').ZoomDialog} [zoomDialogComponent] - The zoom dialog component.
 * @property {import('./slideshow').Slideshow} [slideshow] - The slideshow component.
 * @property {HTMLElement[]} [media] - The media elements.
 *
 * @extends Component<Refs>
 */
export class MediaGallery extends Component {
  connectedCallback() {
    super.connectedCallback();

    // Always create a fresh controller so listeners survive DOM moves
    // (e.g. when the gallery is relocated to .rio-media-gallery on mobile).
    this.#controller = new AbortController();
    const { signal } = this.#controller;
    const target = this.closest('.shopify-section, dialog');

    target?.addEventListener(ThemeEvents.variantUpdate, this.#handleVariantUpdate, { signal });
    // Scroll the slideshow the moment a swatch is tapped — before the variant fetch
    // completes — so the image swap feels like a native carousel.
    target?.addEventListener('change', this.#handleSwatchChange, { signal });
    this.refs.zoomDialogComponent?.addEventListener(ThemeEvents.zoomMediaSelected, this.#handleZoomMediaSelected, {
      signal,
    });
  }

  /**
   * Mobile fade durations — short enough to feel instant, long enough to look smooth.
   */
  static #FADE_OUT_MS = 110;
  static #FADE_IN_MS = 170;

  /**
   * Scrolls the existing slideshow to the slide matching the clicked swatch's media id.
   * @param {Event} event
   */
  #handleSwatchChange = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== 'radio') return;

    const isMobile = window.matchMedia('(max-width: 749px)').matches;
    const mediaId = target.dataset.variantMediaId;

    if (!isMobile) {
      if (mediaId) this.#selectSlideById(mediaId);
      return;
    }

    // Try, in order, to snap to the right slide WITHOUT waiting for the fetch
    // and WITHOUT fading. A fade leaves the OLD image (e.g. gold) on screen
    // for the duration of the transition, which is exactly what we want to
    // avoid — the slide swap itself is already instant.
    //   1. Use the input's data-variant-media-id (best when the merchant set
    //      a per-variant featured_media correctly).
    //   2. Fall back to matching the swatch's background image URL against
    //      slide image src URLs — handles the common case where multiple
    //      variants share data-variant-media-id but each swatch renders the
    //      actual variant image.
    if (mediaId && this.#snapToSlide(mediaId)) {
      this.#localSnapMediaId = mediaId;
      return;
    }

    const swatchMediaId = this.#findSlideIdFromSwatch(target);
    if (swatchMediaId && this.#snapToSlide(swatchMediaId)) {
      this.#localSnapMediaId = swatchMediaId;
      return;
    }

    // Couldn't resolve client-side — fade out and let variant:update deliver
    // the authoritative image. Safety timer prevents a stuck-faded gallery
    // if the variant update never fires.
    this.#fadeOut();
    clearTimeout(this.#fadeSafetyTimer);
    this.#fadeSafetyTimer = window.setTimeout(() => this.#fadeIn(), 1500);
  };

  /**
   * Find the slide id whose image URL matches the swatch's background image
   * for the given input. Returns undefined if no match.
   * @param {HTMLInputElement} input
   * @returns {string | undefined}
   */
  #findSlideIdFromSwatch(input) {
    const label = input.closest('label');
    const swatchEl = label?.querySelector('.swatch');
    if (!(swatchEl instanceof HTMLElement)) return undefined;

    // The swatch URL lives in `style="--swatch-background: url(...)"`. Pull it
    // straight from the inline style — getComputedStyle works too but is slower.
    const styleAttr = swatchEl.getAttribute('style') ?? '';
    const match = styleAttr.match(/--swatch-background:\s*url\(["']?([^"')]+)["']?\)/);
    const swatchUrl = match?.[1];
    if (!swatchUrl) return undefined;

    const swatchKey = stripImageQuery(swatchUrl);
    const slides = this.slideshow?.refs.slides;
    if (!slides) return undefined;

    for (const slide of slides) {
      const img = slide.querySelector('img');
      const src = img?.getAttribute('src');
      if (!src) continue;
      if (stripImageQuery(src) === swatchKey) {
        return slide.getAttribute('slide-id') ?? undefined;
      }
    }
    return undefined;
  }

  /**
   * @param {string} mediaId
   * @param {{ animate?: boolean }} [options]
   * @returns {boolean} true if a slide with that id was found and selected.
   */
  #selectSlideById(mediaId, options = {}) {
    const slideshow = this.slideshow;
    if (!slideshow) return false;
    const slides = slideshow.refs.slides;
    if (!slides) return false;
    const exists = slides.some((slide) => slide.getAttribute('slide-id') == mediaId);
    if (!exists) return false;
    slideshow.select({ id: mediaId }, undefined, options);
    return true;
  }

  /**
   * Snap (no scroll animation) to the slide with the given media id.
   * Returns true ONLY if a different slide was actually selected. A no-op
   * snap (target slide === current slide) returns false so callers can decide
   * to wait for the authoritative variant:update instead of fading the OLD
   * image back in. This matters when a variant's data-variant-media-id is
   * stale or shared across variants (e.g. all colors point to the product's
   * default featured_media).
   * @param {string} mediaId
   * @returns {boolean}
   */
  #snapToSlide(mediaId) {
    const slideshow = this.slideshow;
    const slides = slideshow?.refs.slides;
    if (!slideshow || !slides?.length) return false;

    const targetSlide = slides.find((slide) => slide.getAttribute('slide-id') == mediaId);
    if (!targetSlide) return false;

    const currentSlide = slides[slideshow.current];
    if (currentSlide === targetSlide) return false;

    slideshow.select({ id: mediaId }, undefined, { animate: false });
    return true;
  }

  /** @type {number} */
  #fadeTimer = 0;
  /** @type {number} */
  #fadeSafetyTimer = 0;
  /**
   * Media id we already snapped to client-side from a swatch click. Lets the
   * variant:update handler know the gallery is already correct and skip the
   * fade/replace dance.
   * @type {string | undefined}
   */
  #localSnapMediaId = undefined;

  #fadeOut() {
    clearTimeout(this.#fadeTimer);
    this.style.transition = `opacity ${MediaGallery.#FADE_OUT_MS}ms ease-out`;
    this.style.opacity = '0';
  }

  #fadeIn() {
    clearTimeout(this.#fadeSafetyTimer);
    requestAnimationFrame(() => {
      this.style.transition = `opacity ${MediaGallery.#FADE_IN_MS}ms ease-in`;
      this.style.opacity = '1';
      this.#fadeTimer = window.setTimeout(() => {
        this.style.removeProperty('opacity');
        this.style.removeProperty('transition');
      }, MediaGallery.#FADE_IN_MS + 30);
    });
  }

  #controller = new AbortController();

  disconnectedCallback() {
    super.disconnectedCallback();

    this.#controller.abort();
  }

  /**
   * Handles a variant update event by replacing the current media gallery with a new one.
   *
   * @param {VariantUpdateEvent} event - The variant update event.
   */
  #handleVariantUpdate = (event) => {
    const source = event.detail.data.html;

    if (!source) return;
    const newMediaGallery = /** @type {HTMLElement|null} */ (source.querySelector('media-gallery'));

    if (!newMediaGallery) return;

    const isMobile = window.matchMedia('(max-width: 749px)').matches;
    const newMediaId = event.detail?.resource?.featured_media?.id;

    if (isMobile) {
      // If #handleSwatchChange already snapped to this variant's slide,
      // the gallery is already correct — don't fade or replace it.
      const snappedId = this.#localSnapMediaId;
      this.#localSnapMediaId = undefined;
      if (snappedId && newMediaId && String(newMediaId) === snappedId) {
        if (this.style.opacity === '0') this.#fadeIn();
        return;
      }

      // The gallery is likely already faded out from #handleSwatchChange.
      // Best case: the variant's slide is already in this gallery — snap to it
      // and fade back in.
      if (newMediaId && this.#snapToSlide(String(newMediaId))) {
        this.#fadeIn();
        return;
      }

      // Fallback (combined listing / hide_variants / media not present in
      // this gallery): swap to the new gallery from the variant fetch.
      const fadeIn = MediaGallery.#FADE_IN_MS;

      const doSwap = () => {
        clearTimeout(this.#fadeSafetyTimer);
        newMediaGallery.style.opacity = '0';
        newMediaGallery.style.transition = 'none';
        this.replaceWith(newMediaGallery);
        void newMediaGallery.offsetHeight;
        newMediaGallery.style.transition = `opacity ${fadeIn}ms ease-in`;
        newMediaGallery.style.opacity = '1';
        const cleanup = () => {
          newMediaGallery.style.removeProperty('opacity');
          newMediaGallery.style.removeProperty('transition');
        };
        setTimeout(cleanup, fadeIn + 30);
      };

      // If the gallery is already faded out from #handleSwatchChange (which
      // fired at click time, hundreds of ms before this fetch returned), the
      // fade-out has long since completed — swap immediately. Only schedule a
      // fade-out wait when we somehow arrived here without one in progress.
      if (this.style.opacity === '0') {
        doSwap();
      } else {
        const fadeOut = MediaGallery.#FADE_OUT_MS;
        this.style.transition = `opacity ${fadeOut}ms ease-out`;
        this.style.opacity = '0';
        setTimeout(doSwap, fadeOut + 10);
      }
      return;
    }

    // Desktop: keep a quick crossfade. Durations kept short so the image feels responsive.
    const fadeOutMs = 120;
    const fadeInMs = 160;

    this.style.transition = `opacity ${fadeOutMs}ms ease-out, transform ${fadeOutMs}ms ease-out`;
    this.style.opacity = '0';
    this.style.transform = 'scale(0.96)';

    let swapped = false;
    const onFadeOutDone = () => {
      if (swapped) return;
      swapped = true;

      newMediaGallery.style.opacity = '0';
      newMediaGallery.style.transform = 'scale(0.96)';
      newMediaGallery.style.transition = 'none';
      this.replaceWith(newMediaGallery);

      void newMediaGallery.offsetHeight;

      newMediaGallery.style.transition = `opacity ${fadeInMs}ms ease-in, transform ${fadeInMs}ms ease-in`;
      newMediaGallery.style.opacity = '1';
      newMediaGallery.style.transform = 'scale(1)';

      const onFadeInDone = () => {
        newMediaGallery.style.removeProperty('transition');
        newMediaGallery.style.removeProperty('opacity');
        newMediaGallery.style.removeProperty('transform');
        newMediaGallery.removeEventListener('transitionend', onFadeInDone);
      };
      newMediaGallery.addEventListener('transitionend', onFadeInDone, { once: true });
      setTimeout(onFadeInDone, fadeInMs + 50);
    };

    this.addEventListener('transitionend', onFadeOutDone, { once: true });
    setTimeout(onFadeOutDone, fadeOutMs + 30);
  };

  /**
   * Handles the 'zoom-media:selected' event.
   * @param {ZoomMediaSelectedEvent} event - The zoom-media:selected event.
   */
  #handleZoomMediaSelected = async (event) => {
    this.slideshow?.select(event.detail.index, undefined, { animate: false });
  };

  /**
   * Zooms the media gallery.
   *
   * @param {number} index - The index of the media to zoom.
   * @param {PointerEvent} event - The pointer event.
   */
  zoom(index, event) {
    this.refs.zoomDialogComponent?.open(index, event);
  }

  get slideshow() {
    return this.refs.slideshow;
  }

  get media() {
    return this.refs.media;
  }

  get presentation() {
    return this.dataset.presentation;
  }
}

if (!customElements.get('media-gallery')) {
  customElements.define('media-gallery', MediaGallery);
}

/**
 * Normalize a Shopify CDN image URL to its base path (no query string,
 * no `_NxN.` size suffix). Lets us match a swatch thumbnail like
 *   .../files/whitegold.jpg?width=80
 * against a slide image like
 *   .../files/whitegold_1024x.jpg?v=123
 * @param {string} url
 */
function stripImageQuery(url) {
  // Drop query string.
  let base = url.split('?')[0] ?? url;
  // Drop Shopify's _WIDTHxHEIGHT. size suffix (e.g. _480x.jpg, _600x600.jpg).
  base = base.replace(/_\d+x\d*\.([a-z]+)$/i, '.$1');
  return base;
}
