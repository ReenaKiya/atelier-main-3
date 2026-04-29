// @ts-nocheck
(function () {
  'use strict';

  var STORAGE_PREFIX = 'jdgm_card_v1_';

  function pad(n) { return String(n).padStart(2, '0'); }

  function formatDate(d) {
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  function dateForCard(card) {
    var idx = parseInt(card.getAttribute('data-card-index') || '0', 10);
    var rid = card.getAttribute('data-review-id') || '';
    var hashOffset = 0;
    for (var i = 0; i < Math.min(rid.length, 8); i++) hashOffset += rid.charCodeAt(i);
    var d = new Date();
    d.setDate(d.getDate() - (idx * 7 + (hashOffset % 14)));
    return formatDate(d);
  }

  function buildTopRow(card) {
    if (card.querySelector('.jdgm-card-top-row')) return;
    var stars = card.querySelector('.jdgm-stars');
    if (!stars || !stars.parentElement) return;

    var row = document.createElement('div');
    row.className = 'jdgm-card-top-row';

    var date = document.createElement('span');
    date.className = 'jdgm-card-date';
    date.textContent = dateForCard(card);

    stars.parentElement.insertBefore(row, stars);
    row.appendChild(stars);
    row.appendChild(date);
  }

  function makeThumb(direction, reviewId) {
    var key = STORAGE_PREFIX + reviewId + '_' + direction;
    var userKey = STORAGE_PREFIX + reviewId + '_user_' + direction;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'jdgm-card-thumb jdgm-card-thumb--' + direction;
    btn.setAttribute('aria-label', direction === 'up' ? 'Mark helpful' : 'Mark not helpful');

    var icon = direction === 'up'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M7 22V11l5-7 1 1c.6.6.7 1.5.5 2.3L13 10h6c1 0 1.8.9 1.7 2l-1.4 7c-.2 1-1 1.7-2 1.7H7zM3 22h4V11H3z"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M17 2v11l-5 7-1-1c-.6-.6-.7-1.5-.5-2.3L11 13H5c-1 0-1.8-.9-1.7-2l1.4-7c.2-1 1-1.7 2-1.7H17zM21 2h-4v11h4z"/></svg>';

    var count = parseInt(localStorage.getItem(key) || '0', 10);
    btn.innerHTML = icon + '<span class="jdgm-card-thumb__count">' + count + '</span>';

    if (localStorage.getItem(userKey) === '1') btn.classList.add('is-active');

    function stop(e) {
      e.stopPropagation();
      e.preventDefault();
    }

    btn.addEventListener('mousedown', stop, true);
    btn.addEventListener('touchstart', stop, true);
    btn.addEventListener('click', function (e) {
      stop(e);
      var alreadyVoted = localStorage.getItem(userKey) === '1';
      var c = parseInt(localStorage.getItem(key) || '0', 10);
      var nowVoted;
      if (alreadyVoted) {
        c = Math.max(0, c - 1);
        localStorage.setItem(userKey, '0');
        nowVoted = false;
      } else {
        c += 1;
        localStorage.setItem(userKey, '1');
        nowVoted = true;
      }
      localStorage.setItem(key, String(c));

      var selector = '.jdgm-cards-carousel .jdgm-card[data-review-id="' + reviewId + '"] .jdgm-card-thumb--' + direction;
      document.querySelectorAll(selector).forEach(function (other) {
        var countEl = other.querySelector('.jdgm-card-thumb__count');
        if (countEl) countEl.textContent = c;
        other.classList.toggle('is-active', nowVoted);
      });
    });

    return btn;
  }

  function buildThumbs(card) {
    var productName = card.querySelector('.jdgm-product-name');
    if (!productName) return;
    if (productName.querySelector('.jdgm-card-thumbs')) return;

    var rid = card.getAttribute('data-review-id');
    if (!rid) return;

    var wrap = document.createElement('div');
    wrap.className = 'jdgm-card-thumbs';
    wrap.appendChild(makeThumb('up', rid));
    wrap.appendChild(makeThumb('down', rid));

    productName.classList.add('jdgm-product-name--enhanced');
    productName.appendChild(wrap);
  }

  function openLightboxFor(card) {
    var target = card.querySelector('.jdgm-text') || card;
    setTimeout(function () {
      var evt = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
      });
      target.dispatchEvent(evt);
    }, 0);
  }

  function enhanceFullReviewLink(card) {
    var link = card.querySelector('.jdgm-product-name a');
    if (!link || link.dataset.jdgmFullReview === '1') return;
    link.dataset.jdgmFullReview = '1';

    link.removeAttribute('target');
    link.removeAttribute('rel');
    link.setAttribute('href', 'javascript:void(0)');
    link.style.cursor = 'pointer';

    link.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopImmediatePropagation();
      openLightboxFor(card);
    });
  }

  function enhanceCard(card) {
    if (card.dataset.jdgmEnhanced === '1') return;
    card.dataset.jdgmEnhanced = '1';
    buildTopRow(card);
    buildThumbs(card);
    enhanceFullReviewLink(card);
  }

  function enhanceAll() {
    var cards = document.querySelectorAll('.jdgm-cards-carousel .jdgm-card');
    cards.forEach(enhanceCard);
  }

  var observer = new MutationObserver(function () { enhanceAll(); });

  function start() {
    enhanceAll();
    document.querySelectorAll('.jdgm-cards-carousel').forEach(function (root) {
      observer.observe(root, { childList: true, subtree: true });
    });

    var attempts = 0;
    var poll = setInterval(function () {
      attempts++;
      enhanceAll();
      if (attempts > 40) clearInterval(poll);
    }, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
