/**
 * Updates the recently viewed products in localStorage.
 */
export class RecentlyViewed {
  /** @static @constant {string} The key used to store the viewed products in session storage */
  static #STORAGE_KEY = 'viewedProducts';
  /** @static @constant {string} The key used to store viewed-at timestamps */
  static #TIMESTAMP_KEY = 'viewedProductsTimestamps';
  /** @static @constant {number} The maximum number of products to store */
  static #MAX_PRODUCTS = 12;

  /**
   * Adds a product to the recently viewed products list.
   * @param {string} productId - The ID of the product to add.
   */
  static addProduct(productId) {
    let viewedProducts = this.getProducts();

    viewedProducts = viewedProducts.filter((/** @type {string} */ id) => id !== productId);
    viewedProducts.unshift(productId);
    viewedProducts = viewedProducts.slice(0, this.#MAX_PRODUCTS);

    localStorage.setItem(this.#STORAGE_KEY, JSON.stringify(viewedProducts));

    const timestamps = this.getTimestamps();
    timestamps[productId] = Date.now();
    const validIds = new Set(viewedProducts);
    for (const id of Object.keys(timestamps)) {
      if (!validIds.has(id)) delete timestamps[id];
    }
    localStorage.setItem(this.#TIMESTAMP_KEY, JSON.stringify(timestamps));
  }

  static clearProducts() {
    localStorage.removeItem(this.#STORAGE_KEY);
    localStorage.removeItem(this.#TIMESTAMP_KEY);
  }

  /**
   * Retrieves the list of recently viewed products from session storage.
   * @returns {string[]} The list of viewed products.
   */
  static getProducts() {
    return JSON.parse(localStorage.getItem(this.#STORAGE_KEY) || '[]');
  }

  /**
   * Retrieves the map of product IDs to view timestamps.
   * @returns {Record<string, number>} The timestamp map.
   */
  static getTimestamps() {
    return JSON.parse(localStorage.getItem(this.#TIMESTAMP_KEY) || '{}');
  }
}
