const express = require('express');
const Papa = require('papaparse');
const { bc, batchProcess } = require('../lib/bcClient');

const router = express.Router();

// POST /api/csv/export
// Body: { productIds: [1,2,3], columns: ['namespace:key', ...] }
router.post('/export', async (req, res, next) => {
  try {
    const { productIds, columns = [] } = req.body;
    if (!productIds?.length) return res.status(400).json({ error: 'productIds required' });

    // Fetch product info + metafields for all requested products
    const { results } = await batchProcess(
      productIds,
      async (id) => {
        const [productRes, metaRes] = await Promise.all([
          bc.get(`/v3/catalog/products/${id}`),
          bc.get(`/v3/catalog/products/${id}/metafields`, { params: { limit: 250 } }),
        ]);
        return { product: productRes.data.data, metafields: metaRes.data.data || [] };
      },
      { batchSize: 10, delayMs: 400 }
    );

    // Determine columns if not specified
    let colSet = new Set(columns);
    if (!colSet.size) {
      results.forEach(({ metafields }) =>
        metafields.forEach((m) => colSet.add(`${m.namespace}:${m.key}`))
      );
    }
    const metaCols = [...colSet];

    // Build CSV rows
    const rows = results.map(({ product, metafields }) => {
      const row = {
        product_id: product.id,
        sku: product.sku,
        name: product.name,
      };
      const mfMap = {};
      metafields.forEach((m) => { mfMap[`${m.namespace}:${m.key}`] = m.value; });
      metaCols.forEach((col) => { row[col] = mfMap[col] ?? ''; });
      return row;
    });

    const csv = Papa.unparse(rows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="metafields-export.csv"');
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

// POST /api/csv/import/preview
// Accepts raw CSV text, returns parsed rows with validation info
router.post('/import/preview', express.text({ type: 'text/csv', limit: '5mb' }), (req, res) => {
  const { data, errors, meta } = Papa.parse(req.body, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (errors.length) {
    return res.status(400).json({ error: 'CSV parse error', details: errors.slice(0, 5) });
  }

  const metaCols = meta.fields.filter((f) => f.includes(':'));
  const hasId = meta.fields.includes('product_id');
  const hasSku = meta.fields.includes('sku');

  if (!hasId && !hasSku) {
    return res.status(400).json({ error: 'CSV must include a product_id or sku column' });
  }
  if (!metaCols.length) {
    return res.status(400).json({ error: 'No metafield columns found (expected namespace:key format)' });
  }

  res.json({
    rowCount: data.length,
    metaColumns: metaCols,
    identifierField: hasId ? 'product_id' : 'sku',
    preview: data.slice(0, 5),
  });
});

// POST /api/csv/import/apply
// Applies parsed CSV rows to BC metafields
router.post('/import/apply', express.text({ type: 'text/csv', limit: '5mb' }), async (req, res, next) => {
  try {
    const { data, meta } = Papa.parse(req.body, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });

    const metaCols = meta.fields.filter((f) => f.includes(':'));
    const useId = meta.fields.includes('product_id');

    // Resolve SKUs to product IDs if needed
    let rows = data;
    if (!useId) {
      const skus = [...new Set(data.map((r) => r.sku).filter(Boolean))];
      const { results: productResults } = await batchProcess(
        skus,
        async (sku) => {
          const { data: pd } = await bc.get('/v3/catalog/products', { params: { sku, limit: 1 } });
          return pd.data?.[0] ? { sku, id: pd.data[0].id } : null;
        },
        { batchSize: 10, delayMs: 300 }
      );
      const skuToId = {};
      productResults.filter(Boolean).forEach(({ sku, id }) => { skuToId[sku] = id; });
      rows = data.map((r) => ({ ...r, product_id: skuToId[r.sku] })).filter((r) => r.product_id);
    }

    // Build flat list of upsert tasks
    const tasks = [];
    rows.forEach((row) => {
      const productId = row.product_id;
      metaCols.forEach((col) => {
        const [namespace, key] = col.split(':');
        if (namespace && key && row[col] !== undefined) {
          tasks.push({ productId, namespace, key, value: row[col] });
        }
      });
    });

    const { results, errors } = await batchProcess(
      tasks,
      async ({ productId, namespace, key, value }) => {
        const { data: existing } = await bc.get(
          `/v3/catalog/products/${productId}/metafields`,
          { params: { namespace, key, limit: 1 } }
        );
        if (existing.data?.length) {
          await bc.put(
            `/v3/catalog/products/${productId}/metafields/${existing.data[0].id}`,
            { value }
          );
          return { productId, namespace, key, action: 'updated' };
        } else {
          await bc.post(`/v3/catalog/products/${productId}/metafields`, {
            namespace, key, value, permission_set: 'write',
          });
          return { productId, namespace, key, action: 'created' };
        }
      },
      { batchSize: 8, delayMs: 500 }
    );

    res.json({
      total: tasks.length,
      succeeded: results.length,
      failed: errors.length,
      errors: errors.slice(0, 20),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
