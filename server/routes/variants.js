const express = require('express');
const { bc, batchProcess } = require('../lib/bcClient');

const router = express.Router();

// GET /api/variants/:productId — list all variants with their metafields
router.get('/:productId', async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { data: variantData } = await bc.get(`/v3/catalog/products/${productId}/variants`, {
      params: { limit: 250 },
    });
    const variants = variantData.data || [];

    // Fetch metafields for each variant
    const { results } = await batchProcess(
      variants,
      async (variant) => {
        const { data } = await bc.get(
          `/v3/catalog/products/${productId}/variants/${variant.id}/metafields`,
          { params: { limit: 250 } }
        );
        return { ...variant, metafields: data.data || [] };
      },
      { batchSize: 10, delayMs: 300 }
    );

    res.json({ data: results });
  } catch (err) {
    next(err);
  }
});

// POST /api/variants/:productId/:variantId — create variant metafield
router.post('/:productId/:variantId', async (req, res, next) => {
  try {
    const { productId, variantId } = req.params;
    const { data } = await bc.post(
      `/v3/catalog/products/${productId}/variants/${variantId}/metafields`,
      req.body
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// PUT /api/variants/:productId/:variantId/:metafieldId
router.put('/:productId/:variantId/:metafieldId', async (req, res, next) => {
  try {
    const { productId, variantId, metafieldId } = req.params;
    const { data } = await bc.put(
      `/v3/catalog/products/${productId}/variants/${variantId}/metafields/${metafieldId}`,
      req.body
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/variants/:productId/:variantId/:metafieldId
router.delete('/:productId/:variantId/:metafieldId', async (req, res, next) => {
  try {
    const { productId, variantId, metafieldId } = req.params;
    await bc.delete(
      `/v3/catalog/products/${productId}/variants/${variantId}/metafields/${metafieldId}`
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/variants/bulk/set
// Body: { items: [{productId, variantId}], namespace, key, value }
router.post('/bulk/set', async (req, res, next) => {
  try {
    const { items, namespace, key, value, permission_set = 'write' } = req.body;
    if (!items?.length || !namespace || !key) {
      return res.status(400).json({ error: 'items, namespace and key are required' });
    }

    const { results, errors } = await batchProcess(
      items,
      async ({ productId, variantId }) => {
        const { data: existing } = await bc.get(
          `/v3/catalog/products/${productId}/variants/${variantId}/metafields`,
          { params: { namespace, key, limit: 1 } }
        );
        if (existing.data?.length) {
          const { data } = await bc.put(
            `/v3/catalog/products/${productId}/variants/${variantId}/metafields/${existing.data[0].id}`,
            { value }
          );
          return { productId, variantId, action: 'updated', metafield: data.data };
        } else {
          const { data } = await bc.post(
            `/v3/catalog/products/${productId}/variants/${variantId}/metafields`,
            { namespace, key, value, permission_set }
          );
          return { productId, variantId, action: 'created', metafield: data.data };
        }
      },
      { batchSize: 8, delayMs: 500 }
    );

    res.json({ results, errors, total: items.length, succeeded: results.length });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

// GET /api/variants/visibility?ids=1,2,3&group=42
// Checks both product-level AND variant-level metafields.
// If either is set for the group, the whole product is hidden.
router.get('/visibility', async (req, res, next) => {
  try {
    const ids = String(req.query.ids || '').split(',').filter(Boolean).map(Number);
    const group = String(req.query.group || '').trim();

    if (!ids.length || !group) {
      return res.status(400).json({ error: 'ids and group are required' });
    }

    const NAMESPACE = 'visibility';
    const KEY = 'disabled_for_groups';

    function groupMatches(value) {
      return (value || '').split(',').map(g => g.trim()).includes(group);
    }

    const { results } = await batchProcess(
      ids,
      async (productId) => {
        // Check 1: product-level metafield
        const { data: productMfData } = await bc.get(
          `/v3/catalog/products/${productId}/metafields`,
          { params: { namespace: NAMESPACE, key: KEY, limit: 10 } }
        );
        const productMfs = productMfData.data || [];
        const disabledAtProduct = productMfs.some(mf => groupMatches(mf.value));
        if (disabledAtProduct) return { productId, isDisabled: true };

        // Check 2: variant-level metafields
        const { data: variantData } = await bc.get(
          `/v3/catalog/products/${productId}/variants`,
          { params: { limit: 250 } }
        );
        const variants = variantData.data || [];

        // No variants — product only, already checked above
        if (!variants.length) return { productId, isDisabled: false };

        const variantMetafields = await Promise.all(
          variants.map(async (v) => {
            const { data } = await bc.get(
              `/v3/catalog/products/${productId}/variants/${v.id}/metafields`,
              { params: { namespace: NAMESPACE, key: KEY, limit: 10 } }
            );
            return data.data || [];
          })
        );

        const disabledAtVariant = variantMetafields.some(mfs =>
          mfs.some(mf => groupMatches(mf.value))
        );

        return { productId, isDisabled: disabledAtVariant };
      },
      { batchSize: 5, delayMs: 300 }
    );

    const disabledIds = results.filter((r) => r.isDisabled).map((r) => r.productId);
    res.json({ group, disabledProductIds: disabledIds });
  } catch (err) {
    next(err);
  }
});