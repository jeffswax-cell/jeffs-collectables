/* Jeffs Digital Collectibles - Storefront Logic */

(function () {
  'use strict';

  var WAX_API_URL = '/api/wax';
  var LISTINGS_URL = '/listings.json';
  var DEFAULT_COLLECTION = 'tmnt.funko';
  var ITEMS_PER_PAGE = 24;
  var MIN_COLLECTION_SIZE = 5;
  var JEFF_PHONE = '+17158946330';

  // ---- DOM refs ----
  var gridEl = document.getElementById('collection-grid');
  var stateEl = document.getElementById('collection-state');
  var statAvailable = document.getElementById('stat-available');
  var statCollections = document.getElementById('stat-collections');
  var statTotal = document.getElementById('stat-total');
  var navEl = document.getElementById('site-nav');
  var filterWrap = document.getElementById('collection-filter');
  var selectEl = document.getElementById('collection-select');
  var paginationEl = document.getElementById('pagination');

  // Modal refs
  var modalEl = document.getElementById('enquiry-modal');
  var modalStage1 = document.getElementById('modal-stage-1');
  var modalStage2 = document.getElementById('modal-stage-2');
  var modalCollection = document.getElementById('modal-collection');
  var modalItemName = document.getElementById('modal-item-name');
  var modalItemId = document.getElementById('modal-item-id');
  var modalConfirmName = document.getElementById('modal-confirm-name');
  var modalPhone = document.getElementById('enquiry-phone');
  var modalConsent = document.getElementById('enquiry-consent');
  var modalSendBtn = document.getElementById('modal-send');
  var modalSmsLink = document.getElementById('modal-sms-link');

  // ---- State ----
  var currentItems = [];
  var currentPage = 1;
  var listingMap = {};

  // ---- Nav scroll + hamburger ----
  window.addEventListener('scroll', function () {
    if (window.scrollY > 40) {
      navEl.classList.add('scrolled');
    } else {
      navEl.classList.remove('scrolled');
    }
  });

  var hamburger = document.getElementById('nav-hamburger');
  var navLinks = document.getElementById('nav-links');
  if (hamburger) {
    hamburger.addEventListener('click', function () {
      navLinks.classList.toggle('open');
      hamburger.classList.toggle('open');
    });
    // Close menu when a link is clicked
    navLinks.addEventListener('click', function (e) {
      if (e.target.classList.contains('nav-link')) {
        navLinks.classList.remove('open');
        hamburger.classList.remove('open');
      }
    });
  }

  // ---- Helpers ----
  function fetchJSON(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ---- UI States ----
  function showLoading(msg) {
    stateEl.innerHTML =
      '<div class="state-message">' +
      '<div class="loading-spinner"></div>' +
      '<h3>' + escapeHtml(msg || 'Loading collection...') + '</h3>' +
      '<p>Fetching live data from the WAX blockchain</p>' +
      '</div>';
    stateEl.style.display = '';
    gridEl.style.display = 'none';
    paginationEl.style.display = 'none';
  }

  function showError(message) {
    stateEl.innerHTML =
      '<div class="state-message">' +
      '<h3>Unable to load collection</h3>' +
      '<p>' + escapeHtml(message) + '</p>' +
      '</div>';
    stateEl.style.display = '';
    gridEl.style.display = 'none';
    paginationEl.style.display = 'none';
  }

  function showEmpty() {
    stateEl.innerHTML =
      '<div class="state-message">' +
      '<h3>No items in this collection</h3>' +
      '<p>Try selecting a different collection from the dropdown above.</p>' +
      '</div>';
    stateEl.style.display = '';
    gridEl.style.display = 'none';
    paginationEl.style.display = 'none';
  }

  // ---- Enquiry Modal ----
  function openModal(name, collection, assetId) {
    modalCollection.textContent = collection;
    modalItemName.textContent = name;
    modalItemId.textContent = '#' + assetId;
    modalConfirmName.textContent = name;
    modalPhone.value = '';
    modalConsent.checked = false;
    modalSendBtn.disabled = true;
    modalStage1.style.display = '';
    modalStage2.style.display = 'none';
    modalEl.classList.add('open');
    document.body.style.overflow = 'hidden';
    modalPhone.focus();

    // Build SMS link
    var body = encodeURIComponent(
      "Hi Jeff, I'm interested in " + name + " (Asset #" + assetId + ") from your collection. Is it still available?"
    );
    modalSmsLink.href = 'sms:' + JEFF_PHONE + '?body=' + body;
  }

  function closeModal() {
    modalEl.classList.remove('open');
    document.body.style.overflow = '';
  }

  function validateModal() {
    var phone = modalPhone.value.replace(/\D/g, '');
    var hasPhone = phone.length >= 7;
    var hasConsent = modalConsent.checked;
    modalSendBtn.disabled = !(hasPhone && hasConsent);
  }

  // Modal event listeners
  modalPhone.addEventListener('input', validateModal);
  modalConsent.addEventListener('change', validateModal);

  modalSendBtn.addEventListener('click', function () {
    modalStage1.style.display = 'none';
    modalStage2.style.display = '';
  });

  // Close buttons
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  var closeButtons = document.querySelectorAll('.modal-close-2');
  for (var i = 0; i < closeButtons.length; i++) {
    closeButtons[i].addEventListener('click', closeModal);
  }

  // Close on overlay click
  modalEl.addEventListener('click', function (e) {
    if (e.target === modalEl) closeModal();
  });

  // Close on Escape
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modalEl.classList.contains('open')) closeModal();
  });

  // Delegated click handler for Enquire buttons
  gridEl.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-enquire]');
    if (!btn) return;
    e.preventDefault();
    openModal(
      btn.getAttribute('data-name'),
      btn.getAttribute('data-collection'),
      btn.getAttribute('data-asset-id')
    );
  });

  // ---- Card rendering ----
  function buildCard(item) {
    var listing = item.listing || {};
    var asset = item.asset;
    var name = listing.title_override || asset.name;
    var mediaUrl = asset.media_url || asset.image_url;
    var mediaType = asset.media_type || 'image';
    var collection = asset.collection_display || asset.collection_name;
    var price = listing.price || '';
    var note = listing.note || '';
    var assetId = asset.asset_id;
    var qty = item.quantity;

    var mediaHtml;
    if (mediaType === 'video' || (mediaUrl && mediaUrl.match(/\.(mp4|webm|mov)(\?|$)/i))) {
      mediaHtml =
        '<div class="card-image-shimmer"></div>' +
        '<video src="' + escapeHtml(mediaUrl) + '" muted autoplay loop playsinline preload="metadata" ' +
        'onloadeddata="this.previousElementSibling.style.display=\'none\';this.style.opacity=1;" ' +
        'onerror="this.style.display=\'none\';this.previousElementSibling.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';" style="opacity:0;transition:opacity 0.3s ease;">' +
        '</video>' +
        '<div class="card-image-placeholder" style="display:none;">Media unavailable</div>';
    } else {
      mediaHtml =
        '<div class="card-image-shimmer"></div>' +
        '<img src="' + escapeHtml(mediaUrl) + '" alt="' + escapeHtml(name) + '" loading="lazy" ' +
        'onload="this.previousElementSibling.style.display=\'none\';this.style.opacity=1;" ' +
        'onerror="this.style.display=\'none\';this.previousElementSibling.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';" style="opacity:0;transition:opacity 0.3s ease;">' +
        '<div class="card-image-placeholder" style="display:none;">Image unavailable</div>';
    }

    var noteHtml = note ? '<div class="card-note">' + escapeHtml(note) + '</div>' : '';
    var qtyHtml = qty > 1 ? '<div class="card-qty">x' + qty + ' available</div>' : '';

    var metaLine = '';
    if (asset.rarity) {
      metaLine += '<span class="card-rarity">' + escapeHtml(asset.rarity) + '</span>';
    }
    if (asset.variant) {
      metaLine += (metaLine ? ' ' : '') + '<span class="card-variant">' + escapeHtml(asset.variant) + '</span>';
    }

    return (
      '<div class="card">' +
      '  <div class="card-image-wrap">' + mediaHtml + '</div>' +
      '  <div class="card-body">' +
      (collection ? '    <div class="card-collection">' + escapeHtml(collection) + '</div>' : '') +
      '    <div class="card-name">' + escapeHtml(name) + '</div>' +
      (metaLine ? '    <div class="card-meta">' + metaLine + '</div>' : '') +
      qtyHtml +
      noteHtml +
      '    <div class="card-footer">' +
      (price ? '      <div class="card-price">' + escapeHtml(price) + '</div>' : '<div></div>') +
      '      <button class="card-cta" data-enquire data-name="' + escapeHtml(name) + '" data-collection="' + escapeHtml(collection) + '" data-asset-id="' + escapeHtml(assetId) + '">Enquire</button>' +
      '    </div>' +
      '  </div>' +
      '</div>'
    );
  }

  function renderCards(items, page) {
    if (!items.length) {
      showEmpty();
      return;
    }

    var totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
    if (page > totalPages) page = totalPages;
    if (page < 1) page = 1;
    currentPage = page;

    var start = (page - 1) * ITEMS_PER_PAGE;
    var end = start + ITEMS_PER_PAGE;
    var pageItems = items.slice(start, end);

    gridEl.innerHTML = pageItems.map(buildCard).join('');
    stateEl.style.display = 'none';
    gridEl.style.display = '';

    renderPagination(page, totalPages, items.length);
  }

  function renderPagination(page, totalPages, totalItems) {
    if (totalPages <= 1) {
      paginationEl.style.display = 'none';
      return;
    }

    var html = '';

    html += '<button class="page-btn' + (page <= 1 ? ' disabled' : '') + '" data-page="' + (page - 1) + '"' +
      (page <= 1 ? ' disabled' : '') + '>&lsaquo; Prev</button>';

    var pages = getPageRange(page, totalPages);
    for (var i = 0; i < pages.length; i++) {
      if (pages[i] === '...') {
        html += '<span class="page-ellipsis">...</span>';
      } else {
        html += '<button class="page-btn' + (pages[i] === page ? ' active' : '') + '" data-page="' + pages[i] + '">' + pages[i] + '</button>';
      }
    }

    html += '<button class="page-btn' + (page >= totalPages ? ' disabled' : '') + '" data-page="' + (page + 1) + '"' +
      (page >= totalPages ? ' disabled' : '') + '>Next &rsaquo;</button>';

    var start = (page - 1) * ITEMS_PER_PAGE + 1;
    var end = Math.min(page * ITEMS_PER_PAGE, totalItems);
    html += '<div class="page-info">' + start + '-' + end + ' of ' + totalItems + '</div>';

    paginationEl.innerHTML = html;
    paginationEl.style.display = '';

    var buttons = paginationEl.querySelectorAll('.page-btn:not(.disabled)');
    for (var j = 0; j < buttons.length; j++) {
      buttons[j].addEventListener('click', function () {
        var targetPage = parseInt(this.getAttribute('data-page'));
        renderCards(currentItems, targetPage);
        var section = document.getElementById('collection-section');
        if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  function getPageRange(current, total) {
    if (total <= 7) {
      var arr = [];
      for (var i = 1; i <= total; i++) arr.push(i);
      return arr;
    }
    if (current <= 3) return [1, 2, 3, 4, '...', total];
    if (current >= total - 2) return [1, '...', total - 3, total - 2, total - 1, total];
    return [1, '...', current - 1, current, current + 1, '...', total];
  }

  function updateStats(availableCount, walletCount, collectionNames) {
    statAvailable.textContent = availableCount;
    statCollections.textContent = collectionNames;
    statTotal.textContent = walletCount;
  }

  // ---- Deduplication ----
  function deduplicateByTemplate(assets) {
    var seen = {};
    var unique = [];

    for (var i = 0; i < assets.length; i++) {
      var a = assets[i];
      var key = a.template_id || a.asset_id;
      if (seen[key]) {
        seen[key].count++;
      } else {
        seen[key] = { asset: a, count: 1 };
        unique.push(seen[key]);
      }
    }

    return unique.map(function (entry) {
      return {
        asset: entry.asset,
        listing: listingMap[entry.asset.asset_id] || {},
        quantity: entry.count
      };
    });
  }

  // ---- Collection loading ----
  function loadCollection(collectionName) {
    showLoading('Loading ' + collectionName + '...');

    fetchJSON(WAX_API_URL + '?collection=' + encodeURIComponent(collectionName))
      .then(function (data) {
        if (!data.success || !Array.isArray(data.assets)) {
          showError('Could not load this collection.');
          return;
        }

        var withMedia = data.assets.filter(function (a) {
          return (a.media_url && a.media_url.length > 0) || (a.image_url && a.image_url.length > 0);
        });

        var items = deduplicateByTemplate(withMedia);

        items = items.filter(function (item) {
          return !item.listing || item.listing.status !== 'hidden';
        });

        items.sort(function (a, b) {
          var aOrder = a.listing && a.listing.sort_order;
          var bOrder = b.listing && b.listing.sort_order;
          var aHas = typeof aOrder === 'number';
          var bHas = typeof bOrder === 'number';
          if (aHas && bHas) return aOrder - bOrder;
          if (aHas) return -1;
          if (bHas) return 1;
          var aName = (a.asset.name || '').toLowerCase();
          var bName = (b.asset.name || '').toLowerCase();
          return aName.localeCompare(bName);
        });

        currentItems = items;
        statAvailable.textContent = items.length;
        renderCards(items, 1);
      })
      .catch(function (err) {
        console.error('Failed to load collection:', err);
        showError('Something went wrong. Please try again.');
      });
  }

  // ---- Init ----
  function init() {
    var listingsPromise = fetchJSON(LISTINGS_URL).catch(function () {
      return { listings: [] };
    });

    var collectionsPromise = fetchJSON(WAX_API_URL);

    Promise.all([collectionsPromise, listingsPromise])
      .then(function (results) {
        var colData = results[0];
        var listingsData = results[1];

        if (!colData.success) {
          showError('Could not fetch wallet data.');
          return;
        }

        (listingsData.listings || []).forEach(function (l) {
          listingMap[l.asset_id] = l;
        });

        var collections = colData.collections || [];
        var totalAssets = colData.total_assets || 0;

        statTotal.textContent = totalAssets.toLocaleString();
        statCollections.textContent = collections.length;

        var shown = collections.filter(function (c) { return c.count >= MIN_COLLECTION_SIZE; });

        selectEl.innerHTML = '';
        shown.forEach(function (col) {
          var opt = document.createElement('option');
          opt.value = col.collection_name;
          opt.textContent = col.display_name + ' (' + col.count + ')';
          selectEl.appendChild(opt);
        });

        filterWrap.style.display = '';

        var defaultExists = shown.some(function (c) { return c.collection_name === DEFAULT_COLLECTION; });
        if (defaultExists) {
          selectEl.value = DEFAULT_COLLECTION;
        }

        selectEl.addEventListener('change', function () {
          loadCollection(selectEl.value);
        });

        loadCollection(selectEl.value);
      })
      .catch(function (err) {
        console.error('Failed to load collections:', err);
        showError('Something went wrong loading the collection. Please refresh and try again.');
      });
  }

  init();
})();
