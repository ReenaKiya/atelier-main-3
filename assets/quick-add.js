import { morph } from '@theme/morph';
import { Component } from '@theme/component';
import { CartUpdateEvent, ThemeEvents } from '@theme/events';
import { DialogComponent, DialogCloseEvent } from '@theme/dialog';
import { mediaQueryLarge, isMobileBreakpoint } from '@theme/utilities';

export class QuickAddComponent extends Component {
  /** @type {AbortController | null} */
  #abortController = null;
  /** @type {Document | null} */
  #cachedProductHtml = null;

  get cachedProductHtml() {
    return this.#cachedProductHtml;
  }

  get productPageUrl() {
    return /** @type {HTMLAnchorElement} */ (this.closest('product-card')?.querySelector('a[ref="productCardLink"]'))
      ?.href;
  }

  connectedCallback() {
    super.connectedCallback();

    mediaQueryLarge.addEventListener('change', this.#closeQuickAddModal);
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    mediaQueryLarge.removeEventListener('change', this.#closeQuickAddModal);
  }

  /**
   * Handles quick add button click
   * @param {Event} event - The click event
   */
  handleClick = async (event) => {
    event.preventDefault();

    if (!this.#cachedProductHtml) {
      await this.fetchProductPage(this.productPageUrl);
    }

    if (this.#cachedProductHtml) {
      // Create a fresh copy of the cached HTML to avoid modifying the original
      const freshHtmlCopy = new DOMParser().parseFromString(
        this.#cachedProductHtml.documentElement.outerHTML,
        'text/html'
      );

      await this.updateQuickAddModal(freshHtmlCopy);
    }

    this.#openQuickAddModal();
  };

  /** @param {QuickAddDialog} dialogComponent */
  #stayVisibleUntilDialogCloses(dialogComponent) {
    this.toggleAttribute('stay-visible', true);

    dialogComponent.addEventListener(DialogCloseEvent.eventName, () => this.toggleAttribute('stay-visible', false), {
      once: true,
    });
  }

  #openQuickAddModal = () => {
    const dialogComponent = document.getElementById('quick-add-dialog');
    if (!(dialogComponent instanceof QuickAddDialog)) return;

    this.#stayVisibleUntilDialogCloses(dialogComponent);

    dialogComponent.showDialog();
  };

  #closeQuickAddModal = () => {
    const dialogComponent = document.getElementById('quick-add-dialog');
    if (!(dialogComponent instanceof QuickAddDialog)) return;

    dialogComponent.closeDialog();
  };

  /**
   * Fetches the product page content
   * @param {string} productPageUrl - The URL of the product page to fetch
   * @returns {Promise<void>}
   * @throws {Error} If the fetch request fails or returns a non-200 response
   */
  async fetchProductPage(productPageUrl) {
    if (!productPageUrl) return;

    // We use this to abort the previous fetch request if it's still pending.
    this.#abortController?.abort();
    this.#abortController = new AbortController();

    try {
      const response = await fetch(productPageUrl, {
        signal: this.#abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch product page: HTTP error ${response.status}`);
      }

      const responseText = await response.text();
      const html = new DOMParser().parseFromString(responseText, 'text/html');

      // Store the HTML for later use
      this.#cachedProductHtml = html;
    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      } else {
        throw error;
      }
    } finally {
      this.#abortController = null;
    }
  }

  /**
   * Re-renders the variant picker.
   * @param {Document} newHtml - The new HTML.
   */
  async updateQuickAddModal(newHtml) {
    const productGrid = newHtml.querySelector('[data-product-grid-content]');
    const modalContent = document.getElementById('quick-add-modal-content');

    if (!productGrid || !modalContent) return;

    // Extract description from the product page (from description tabs or product description block)
    let descriptionText = '';
    // Try the description tabs section first
    const tabContent = newHtml.querySelector('[data-pdt-panel="description"]');
    if (tabContent) {
      descriptionText = tabContent.textContent.trim().substring(0, 200);
    }
    // Fallback: try any product description block
    if (!descriptionText) {
      const descBlock = newHtml.querySelector('.product-description, [class*="product-description"]');
      if (descBlock) {
        descriptionText = descBlock.textContent.trim().substring(0, 200);
      }
    }
    // Fallback: try the quick-add-description we added in Liquid
    if (!descriptionText) {
      const qaDesc = productGrid.querySelector('.quick-add-description');
      if (qaDesc) {
        descriptionText = qaDesc.textContent.trim();
      }
    }

    // Inject description into the product details area if found
    if (descriptionText) {
      const productDetails = productGrid.querySelector('.product-details');
      if (productDetails) {
        // Check if description already exists
        let descEl = productDetails.querySelector('.quick-add-description');
        if (!descEl) {
          descEl = newHtml.createElement('div');
          descEl.className = 'quick-add-description';
          descEl.textContent = descriptionText;
          // Insert after buy buttons or at end of group-block-content
          const groupContent = productDetails.querySelector('.group-block-content');
          if (groupContent) {
            groupContent.appendChild(descEl);
          }
        } else {
          // Make sure it has content
          if (!descEl.textContent.trim()) {
            descEl.textContent = descriptionText;
          }
        }
      }
    }

    if (isMobileBreakpoint()) {
      const productDetails = productGrid.querySelector('.product-details');
      if (!productDetails) return;
      const productFormComponent = productGrid.querySelector('product-form-component');
      const variantPicker = productGrid.querySelector('variant-picker');
      const productPrice = productGrid.querySelector('product-price');
      const productTitle = document.createElement('a');
      productTitle.textContent = this.dataset.productTitle || '';

      // Make product title as a link to the product page
      productTitle.href = this.productPageUrl;

      if (!productFormComponent || !variantPicker || !productPrice || !productTitle) return;

      // Get vendor and description before removing product details
      const vendor = productDetails.querySelector('.quick-add-vendor');
      const description = productDetails.querySelector('.quick-add-description');

      const productHeader = document.createElement('div');
      productHeader.classList.add('product-header');

      productHeader.appendChild(productTitle);
      if (vendor) productHeader.appendChild(vendor);
      productHeader.appendChild(productPrice);
      productGrid.appendChild(productHeader);
      if (description) productGrid.appendChild(description);
      productGrid.appendChild(variantPicker);
      productGrid.appendChild(productFormComponent);
      productDetails.remove();
    }

    morph(modalContent, productGrid);

    // Reinitialize Shopify's dynamic checkout buttons (Buy with Shop Pay / More payment options)
    // after morphing content into the modal, since Shopify's JS needs to detect new DOM elements
    this.#reinitializePaymentButtons();
  }

  /**
   * Reinitializes Shopify's dynamic payment buttons in the modal.
   * This is needed because Shopify's payment button JS doesn't automatically
   * detect elements that are dynamically inserted via DOM morphing.
   */
  #reinitializePaymentButtons() {
    if (window.Shopify && window.Shopify.PaymentButton) {
      window.Shopify.PaymentButton.init();
    } else {
      // If PaymentButton isn't loaded yet, wait for it
      const checkInterval = setInterval(() => {
        if (window.Shopify && window.Shopify.PaymentButton) {
          window.Shopify.PaymentButton.init();
          clearInterval(checkInterval);
        }
      }, 100);
      // Stop checking after 5 seconds
      setTimeout(() => clearInterval(checkInterval), 5000);
    }
  }
}

if (!customElements.get('quick-add-component')) {
  customElements.define('quick-add-component', QuickAddComponent);
}

class QuickAddDialog extends DialogComponent {
  #abortController = new AbortController();

  connectedCallback() {
    super.connectedCallback();

    this.addEventListener(ThemeEvents.cartUpdate, this.handleCartUpdate, { signal: this.#abortController.signal });
    this.addEventListener(ThemeEvents.variantUpdate, this.#updateProductTitleLink);
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    this.#abortController.abort();
  }

  /**
   * Closes the dialog
   * @param {CartUpdateEvent} event - The cart update event
   */
  handleCartUpdate = (event) => {
    if (event.detail.data.didError) return;
    this.closeDialog();
  };

  #updateProductTitleLink = (/** @type {CustomEvent} */ event) => {
    const anchorElement = /** @type {HTMLAnchorElement} */ (
      event.detail.data.html?.querySelector('.view-product-title a')
    );
    const viewMoreDetailsLink = /** @type {HTMLAnchorElement} */ (this.querySelector('.view-product-title a'));
    const mobileProductTitle = /** @type {HTMLAnchorElement} */ (this.querySelector('.product-header a'));

    if (!anchorElement) return;

    if (viewMoreDetailsLink) viewMoreDetailsLink.href = anchorElement.href;
    if (mobileProductTitle) mobileProductTitle.href = anchorElement.href;
  };
}

if (!customElements.get('quick-add-dialog')) {
  customElements.define('quick-add-dialog', QuickAddDialog);
}
