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
    this.refs.zoomDialogComponent?.addEventListener(ThemeEvents.zoomMediaSelected, this.#handleZoomMediaSelected, {
      signal,
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

    // Scale down and fade out current gallery (recede into back)
    this.style.transition = 'opacity 0.2s ease-out, transform 0.2s ease-out';
    this.style.opacity = '0';
    this.style.transform = 'scale(0.92)';

    const onFadeOutDone = () => {
      // Set new gallery behind (scaled down) and invisible initially
      newMediaGallery.style.opacity = '0';
      newMediaGallery.style.transform = 'scale(0.92)';
      newMediaGallery.style.transition = 'none';
      this.replaceWith(newMediaGallery);

      // Force a reflow so the browser registers the initial state before transitioning
      void newMediaGallery.offsetHeight;

      // Scale up and fade in the new gallery (come from back to front)
      newMediaGallery.style.transition = 'opacity 0.35s ease-in, transform 0.35s ease-in';
      newMediaGallery.style.opacity = '1';
      newMediaGallery.style.transform = 'scale(1)';

      const onFadeInDone = () => {
        newMediaGallery.style.removeProperty('transition');
        newMediaGallery.style.removeProperty('opacity');
        newMediaGallery.style.removeProperty('transform');
        newMediaGallery.removeEventListener('transitionend', onFadeInDone);
      };
      newMediaGallery.addEventListener('transitionend', onFadeInDone, { once: true });

      // Safety cleanup in case transitionend doesn't fire
      setTimeout(onFadeInDone, 400);
    };

    this.addEventListener('transitionend', onFadeOutDone, { once: true });
    // Safety fallback in case transitionend doesn't fire
    setTimeout(onFadeOutDone, 250);
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
