(function () {

  // ─── CONFIG ───────────────────────────────────────────────────────────────
  var DISABLED_GROUPS_NAMESPACE = 'visibility';
  var DISABLED_GROUPS_KEY       = 'disabled_for_groups';
  var REDIRECT_PATH             = '/'; // where to send customers on a blocked PDP
  // ──────────────────────────────────────────────────────────────────────────

  // Read customer group ID — requires this in your theme's base.html before </body>:
  // <script>window.__bcCustomerGroupId__ = "{{customer.group_id}}";</script>
  function getGroupId() {
    if (window.__bcCustomerGroupId__) return String(window.__bcCustomerGroupId__).trim();
    if (window.BCData && window.BCData.customer_group_id) return String(window.BCData.customer_group_id).trim();
    return null;
  }

  var groupId = getGroupId();
  if (!groupId) return; // guest or no group — nothing to do

  // Collect all product IDs on the page
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
      ids.add(String(window.BCData.product_id));
    }
    return Array.from(ids).map(Number).filter(Boolean);
  }

  // Hide all cards immediately to prevent flash of restricted content
  function addPendingStyle() {
    var s = document.createElement('style');
    s.id = 'bc-vis-pending';
    s.textContent = '[data-product-id],[data-entity-id]{visibility:hidden!important}';
    document.head.appendChild(s);
  }

  function removePendingStyle() {
    var el = document.getElementById('bc-vis-pending');
    if (el) el.parentNode.removeChild(el);
  }

  // Hide a specific product card
  function hideProduct(productId) {
    ['[data-product-id="' + productId + '"]', '[data-entity-id="' + productId + '"]'].forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        var card = el.closest('li,article,.product,[class*="productCard"],[class*="product-item"]') || el;
        card.style.setProperty('display', 'none', 'important');
      });
    });
  }

  // Query BC Storefront GraphQL for metafields on a batch of product IDs
  function fetchMetafields(productIds, callback) {
    // Build one fragment per product — GraphQL doesn't support dynamic list queries
    // so we alias each product by its ID
    var fragments = productIds.map(function (id) {
      return 'p' + id + ': product(entityId: ' + id + ') { entityId metafields(namespace: "' + DISABLED_GROUPS_NAMESPACE + '", keys: ["' + DISABLED_GROUPS_KEY + '"]) { edges { node { key value } } } }';
    }).join(' ');

    var query = '{ site { ' + fragments + ' } }';

    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/graphql');
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'application/json');
    // BC requires this header for Storefront API calls
    xhr.setRequestHeader('Authorization', 'Bearer ' + (window.bcStorefrontToken || ''));
    xhr.timeout = 8000;
    xhr.onload = function () {
      if (xhr.status === 200) {
        try { callback(null, JSON.parse(xhr.responseText)); }
        catch (e) { callback(e); }
      } else {
        callback(new Error('GraphQL ' + xhr.status));
      }
    };
    xhr.onerror = function () { callback(new Error('Network error')); };
    xhr.ontimeout = function () { callback(new Error('Timeout')); };
    xhr.send(JSON.stringify({ query: query }));
  }

  // Check if a product's metafield value includes the current group
  function isDisabled(metafieldEdges) {
    if (!metafieldEdges || !metafieldEdges.length) return false;
    return metafieldEdges.some(function (edge) {
      var groups = (edge.node.value || '').split(',').map(function (g) { return g.trim(); });
      return groups.indexOf(groupId) !== -1;
    });
  }

  // ─── MAIN ─────────────────────────────────────────────────────────────────
  function run() {
    var productIds = getPageProductIds();
    if (!productIds.length) return;

    addPendingStyle();

    fetchMetafields(productIds, function (err, data) {
      removePendingStyle();

      if (err) {
        // Fail open — if something goes wrong, show products rather than hide them
        console.warn('[bc-visibility]', err.message);
        return;
      }

      var site = data && data.data && data.data.site;
      if (!site) return;

      productIds.forEach(function (id) {
        var product = site['p' + id];
        if (!product) return;
        var edges = product.metafields && product.metafields.edges;
        if (isDisabled(edges)) {
          hideProduct(id);
          // If we're on this product's PDP, redirect away
          if (window.BCData && String(window.BCData.product_id) === String(id)) {
            window.location.replace(REDIRECT_PATH);
          }
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

})();
