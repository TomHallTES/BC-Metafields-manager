/**
 * bc-metafields-manager — Group Visibility Script
 *
 * Hides products from specific customer groups based on variant metafields.
 *
 * Metafield convention:
 *   Resource:  Product Variant
 *   Namespace: visibility
 *   Key:       disabled_for_groups
 *   Value:     group ID, or comma-separated IDs e.g. "42" or "42,17"
 *
 * If ANY variant of a product has a matching group ID, the entire product is hidden.
 *
 * See storefront/SETUP.md for full installation instructions.
 */

(function () {
  // ─── CONFIG — update these before installing ──────────────────────────────
  var MANAGER_API_URL = 'https://YOUR-APP.up.railway.app';
  var MANAGER_API_CREDENTIALS = 'BASE64_OF_USER:PASS'; // btoa('user:pass') in browser console
  var REDIRECT_PATH = '/not-available'; // page to redirect to on a disabled PDP
  // ──────────────────────────────────────────────────────────────────────────

  // Read current customer group ID
  // Requires window.__bcCustomerGroupId__ to be set in your theme — see SETUP.md
  function getCustomerGroupId() {
    if (window.__bcCustomerGroupId__) return window.__bcCustomerGroupId__.toString().trim();
    if (window.BCData && window.BCData.customer_group_id) return window.BCData.customer_group_id.toString().trim();
    return null;
  }

  var groupId = getCustomerGroupId();
  if (!groupId) return; // guest or no group — nothing to restrict

  // Collect all product IDs on the current page
  function getPageProductIds() {
    var ids = new Set();
    document.querySelectorAll('[data-product-id]').forEach(function (el) {
      var id = el.getAttribute('data-product-id');
      if (id) ids.add(id);
    });
    document.querySelectorAll('[data-entity-id]').forEach(function (el) {
      var id = el.getAttribute('data-entity-id');
      if (id) ids.add(id);
    });
    if (window.BCData && window.BCData.product_id) {
      ids.add(window.BCData.product_id.toString());
    }
    return Array.from(ids);
  }

  // Hide all product cards immediately to prevent flash of restricted content
  function addPendingStyles() {
    var style = document.createElement('style');
    style.id = 'bc-vis-pending';
    style.textContent = '[data-product-id],[data-entity-id]{visibility:hidden!important}';
    document.head.appendChild(style);
  }

  function removePendingStyles() {
    var el = document.getElementById('bc-vis-pending');
    if (el) el.parentNode.removeChild(el);
  }

  // Hide a specific product everywhere on the page
  function hideProduct(productId) {
    var selectors = [
      '[data-product-id="' + productId + '"]',
      '[data-entity-id="' + productId + '"]',
    ];
    selectors.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        var card = el.closest('li,article,.product,[class*="productCard"],[class*="product-item"]') || el;
        card.style.setProperty('display', 'none', 'important');
      });
    });
  }

  // If we're on a PDP for a disabled product, redirect away
  function redirectIfDisabledPDP(disabledIds) {
    if (!window.BCData || !window.BCData.product_id) return;
    var currentId = window.BCData.product_id.toString();
    if (disabledIds.indexOf(currentId) !== -1) {
      window.location.replace(REDIRECT_PATH);
    }
  }

  // Single API call — returns only the disabled product IDs for this group
  function fetchDisabledProducts(productIds, callback) {
    var url = MANAGER_API_URL + '/api/variants/visibility'
      + '?ids=' + productIds.join(',')
      + '&group=' + encodeURIComponent(groupId);

    var xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.setRequestHeader('Authorization', 'Basic ' + MANAGER_API_CREDENTIALS);
    xhr.timeout = 8000;
    xhr.onload = function () {
      if (xhr.status === 200) {
        try { callback(null, JSON.parse(xhr.responseText)); }
        catch (e) { callback(e); }
      } else {
        callback(new Error('API ' + xhr.status));
      }
    };
    xhr.onerror = function () { callback(new Error('Network error')); };
    xhr.ontimeout = function () { callback(new Error('Timeout')); };
    xhr.send();
  }

  // ─── MAIN ─────────────────────────────────────────────────────────────────
  function run() {
    var productIds = getPageProductIds();
    if (!productIds.length) return;

    addPendingStyles();

    fetchDisabledProducts(productIds, function (err, data) {
      removePendingStyles();

      if (err) {
        // Fail open — if API is unreachable, show products rather than hiding them
        console.warn('[bc-visibility] API error:', err.message);
        return;
      }

      var disabledIds = (data.disabledProductIds || []).map(String);
      disabledIds.forEach(hideProduct);
      redirectIfDisabledPDP(disabledIds);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

})();
