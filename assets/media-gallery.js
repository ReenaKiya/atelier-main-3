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

    // Fade out current gallery
    this.style.transition = 'opacity 0.2s ease-out';
    this.style.opacity = '0';

    const onFadeOutDone = () => {
      // Hide scroll-snap sliding by making new gallery invisible initially
      newMediaGallery.style.opacity = '0';
      this.replaceWith(newMediaGallery);

      // Force a reflow so the browser registers opacity:0 before transitioning to 1
      void newMediaGallery.offsetHeight;

      // Fade in the new gallery
      newMediaGallery.style.transition = 'opacity 0.35s ease-in';
      newMediaGallery.style.opacity = '1';

      const onFadeInDone = () => {
        newMediaGallery.style.removeProperty('transition');
        newMediaGallery.style.removeProperty('opacity');
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
