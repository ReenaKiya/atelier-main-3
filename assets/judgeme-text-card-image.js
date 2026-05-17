// @ts-nocheck
(function () {
  'use strict';

  var CACHE_PREFIX = 'jdgm_prod_img_v1_';

  function parseHandle(href) {
    if (!href) return null;
    try {
      var url = new URL(href, window.location.origin);
      var match = url.pathname.match(/^\/products\/([^\/?#]+)/);
      return match ? match[1] : null;
    } catch (e) {
      return null;
    }
  }

  function getCached(handle) {
    try { return sessionStorage.getItem(CACHE_PREFIX + handle); } catch (e) { return null; }
  }

  function setCached(handle, url) {
    try { sessionStorage.setItem(CACHE_PREFIX + handle, url || ''); } catch (e) {}
  }

  function normalizeSrc(src) {
    if (!src) return null;
    if (src.indexOf('//') === 0) return 'https:' + src;
    return src;
  }

  function fetchProductImage(handle) {
    var cached = getCached(handle);
    if (cached !== null) return Promise.resolve(cached || null);
    return fetch('/products/' + encodeURIComponent(handle) + '.js', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        var src = data && (data.featured_image || (data.images && data.images[0])) || null;
        src = normalizeSrc(src);
        setCached(handle, src || '');
        return src;
      })
      .catch(function () { return null; });
  }

  function injectImage(card) {
    if (card.dataset.jdgmImgInjected === '1') return;
    if (card.querySelector(':scope > img')) {
      card.dataset.jdgmImgInjected = '1';
      return;
    }
    var link = card.querySelector('.jdgm-product-name a');
    var handle = link ? parseHandle(link.getAttribute('href')) : null;
    if (!handle) return;
    card.dataset.jdgmImgInjected = '1';

    fetchProductImage(handle).then(function (src) {
      if (!src) return;
      if (card.querySelector(':scope > img')) return;
      var img = document.createElement('img');
      img.src = src;
      img.alt = '';
      img.loading = 'lazy';
      card.insertBefore(img, card.firstChild);
      card.classList.remove('jdgm-text-card');
      if (!card.classList.contains('jdgm-media-card')) card.classList.add('jdgm-media-card');
    });
  }

  function processAll() {
    document.querySelectorAll('.jdgm-cards-carousel .jdgm-card.jdgm-text-card').forEach(injectImage);
  }

  function start() {
    processAll();
    var observer = new MutationObserver(function () { processAll(); });
    document.querySelectorAll('.jdgm-cards-carousel').forEach(function (root) {
      observer.observe(root, { childList: true, subtree: true });
    });
    var attempts = 0;
    var poll = setInterval(function () {
      attempts++;
      processAll();
      if (attempts > 40) clearInterval(poll);
    }, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
