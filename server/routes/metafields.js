const express = require('express');
const { bc, batchProcess } = require('../lib/bcClient');

const router = express.Router();

// GET /api/metafields/product/:productId
router.get('/product/:productId', async (req, res, next) => {
  try {
    const { data } = await bc.get(`/v3/catalog/products/${req.params.productId}/metafields`, {
      params: { limit: 250 },
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/metafields/products/batch?ids=1,2,3
// Fetches metafields for multiple products in parallel (batched)
router.get('/products/batch', async (req, res, next) => {
  try {
    const ids = String(req.query.ids || '').split(',').filter(Boolean).map(Number);
    if (!ids.length) return res.json({ data: {} });

    const { results, errors } = await batchProcess(
      ids,
      async (id) => {
        const { data } = await bc.get(`/v3/catalog/products/${id}/metafields`, {
          params: { limit: 250 },
        });
        return { id, metafields: data.data };
      },
      { batchSize: 10, delayMs: 400 }
    );

    const byProduct = {};
    results.forEach(({ id, metafields }) => { byProduct[id] = metafields; });

    res.json({ data: byProduct, errors });
  } catch (err) {
    next(err);
  }
});

// Valid BC permission_set values
const VALID_PERMISSIONS = ['app_only', 'read', 'write', 'read_and_sf_access'];
function sanitisePermission(p) {
  if (VALID_PERMISSIONS.includes(p)) return p;
  return 'write';
}

// POST /api/metafields/product/:productId — create
router.post('/product/:productId', async (req, res, next) => {
  try {
    const body = { ...req.body, permission_set: sanitisePermission(req.body.permission_set) };
    const { data } = await bc.post(
      `/v3/catalog/products/${req.params.productId}/metafields`,
      body
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// PUT /api/metafields/product/:productId/:metafieldId — update
router.put('/product/:productId/:metafieldId', async (req, res, next) => {
  try {
    const { data } = await bc.put(
      `/v3/catalog/products/${req.params.productId}/metafields/${req.params.metafieldId}`,
      req.body
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/metafields/product/:productId/:metafieldId
router.delete('/product/:productId/:metafieldId', async (req, res, next) => {
  try {
    await bc.delete(
      `/v3/catalog/products/${req.params.productId}/metafields/${req.params.metafieldId}`
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/metafields/bulk/set — set a value across many products
// Body: { productIds: [1,2,3], namespace, key, value, permission_set }
router.post('/bulk/set', async (req, res, next) => {
  try {
    const { productIds, namespace, key, value, permission_set = 'write' } = req.body;
    if (!productIds?.length || !namespace || !key) {
      return res.status(400).json({ error: 'productIds, namespace and key are required' });
    }

    const { results, errors } = await batchProcess(
      productIds,
      async (productId) => {
        // Check if metafield already exists
        const { data: existing } = await bc.get(
          `/v3/catalog/products/${productId}/metafields`,
          { params: { namespace, key, limit: 1 } }
        );

        if (existing.data?.length) {
          const id = existing.data[0].id;
          const { data } = await bc.put(
            `/v3/catalog/products/${productId}/metafields/${id}`,
            { value }
          );
          return { productId, action: 'updated', metafield: data.data };
        } else {
          const { data } = await bc.post(
            `/v3/catalog/products/${productId}/metafields`,
            { namespace, key, value, permission_set }
          );
          return { productId, action: 'created', metafield: data.data };
        }
      },
      { batchSize: 10, delayMs: 500 }
    );

    res.json({ results, errors, total: productIds.length, succeeded: results.length });
  } catch (err) {
    next(err);
  }
});

// POST /api/metafields/bulk/clear — clear value (empty string) across many products
router.post('/bulk/clear', async (req, res, next) => {
  try {
    const { productIds, namespace, key } = req.body;
    if (!productIds?.length || !namespace || !key) {
      return res.status(400).json({ error: 'productIds, namespace and key are required' });
    }

    const { results, errors } = await batchProcess(
      productIds,
      async (productId) => {
        const { data: existing } = await bc.get(
          `/v3/catalog/products/${productId}/metafields`,
          { params: { namespace, key, limit: 1 } }
        );
        if (!existing.data?.length) return { productId, action: 'skipped' };
        const id = existing.data[0].id;
        const { data } = await bc.put(
          `/v3/catalog/products/${productId}/metafields/${id}`,
          { value: '' }
        );
        return { productId, action: 'cleared', metafield: data.data };
      },
      { batchSize: 10, delayMs: 500 }
    );

    res.json({ results, errors, total: productIds.length, succeeded: results.length });
  } catch (err) {
    next(err);
  }
});

// POST /api/metafields/bulk/delete — delete a metafield from many products
router.post('/bulk/delete', async (req, res, next) => {
  try {
    const { productIds, namespace, key } = req.body;
    if (!productIds?.length || !namespace || !key) {
      return res.status(400).json({ error: 'productIds, namespace and key are required' });
    }

    const { results, errors } = await batchProcess(
      productIds,
      async (productId) => {
        const { data: existing } = await bc.get(
          `/v3/catalog/products/${productId}/metafields`,
          { params: { namespace, key, limit: 1 } }
        );
        if (!existing.data?.length) return { productId, action: 'skipped' };
        const id = existing.data[0].id;
        await bc.delete(`/v3/catalog/products/${productId}/metafields/${id}`);
        return { productId, action: 'deleted' };
      },
      { batchSize: 10, delayMs: 500 }
    );

    res.json({ results, errors, total: productIds.length, succeeded: results.length });
  } catch (err) {
    next(err);
  }
});

// POST /api/metafields/bulk/copy — copy one field's value to another
router.post('/bulk/copy', async (req, res, next) => {
  try {
    const { productIds, sourceNamespace, sourceKey, destNamespace, destKey, permission_set = 'write' } = req.body;
    if (!productIds?.length || !sourceNamespace || !sourceKey || !destNamespace || !destKey) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { results, errors } = await batchProcess(
      productIds,
      async (productId) => {
        const { data: src } = await bc.get(
          `/v3/catalog/products/${productId}/metafields`,
          { params: { namespace: sourceNamespace, key: sourceKey, limit: 1 } }
        );
        if (!src.data?.length) return { productId, action: 'skipped_no_source' };
        const value = src.data[0].value;

        const { data: dest } = await bc.get(
          `/v3/catalog/products/${productId}/metafields`,
          { params: { namespace: destNamespace, key: destKey, limit: 1 } }
        );
        if (dest.data?.length) {
          const { data } = await bc.put(
            `/v3/catalog/products/${productId}/metafields/${dest.data[0].id}`,
            { value }
          );
          return { productId, action: 'copied_updated', metafield: data.data };
        } else {
          const { data } = await bc.post(
            `/v3/catalog/products/${productId}/metafields`,
            { namespace: destNamespace, key: destKey, value, permission_set }
          );
          return { productId, action: 'copied_created', metafield: data.data };
        }
      },
      { batchSize: 8, delayMs: 600 }
    );

    res.json({ results, errors, total: productIds.length, succeeded: results.length });
  } catch (err) {
    next(err);
  }
});

module.exports = router;