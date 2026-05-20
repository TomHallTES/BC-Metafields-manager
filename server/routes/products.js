const express = require('express');
const { bc } = require('../lib/bcClient');

const router = express.Router();

// GET /api/products?page=1&limit=50&keyword=widget&category_id=5&brand_id=2
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 50, keyword, category_id, brand_id } = req.query;
    const params = { page, limit, include: 'variants', sort: 'name', direction: 'asc' };
    if (keyword) params.keyword = keyword;
    if (category_id) params.categories_in = category_id;
    if (brand_id) params.brand_id = brand_id;

    const { data } = await bc.get('/v3/catalog/products', { params });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/products/categories — for filter dropdown
router.get('/categories', async (_req, res, next) => {
  try {
    const { data } = await bc.get('/v3/catalog/categories', { params: { limit: 250 } });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/products/brands — for filter dropdown
router.get('/brands', async (_req, res, next) => {
  try {
    const { data } = await bc.get('/v3/catalog/brands', { params: { limit: 250 } });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

// GET /api/products/customer-group
// Proxies BC Current Customer JWT — works cross-domain, no CORS issues
// Returns { groupId: "7" } or { groupId: null } for guests
router.get('/customer-group', async (req, res, next) => {
  try {
    const clientId = process.env.BC_CLIENT_ID;
    if (!clientId) return res.status(500).json({ error: 'BC_CLIENT_ID not configured' });

    // Forward the customer's cookies so BC knows who they are
    const cookieHeader = req.headers.cookie || '';

    const response = await require('axios').get(
      `https://api.bigcommerce.com/stores/${process.env.BC_STORE_HASH}/v2/customers/current.jwt?app_client_id=${clientId}`,
      {
        headers: {
          'Cookie': cookieHeader,
          'X-Auth-Token': process.env.BC_ACCESS_TOKEN,
        },
        validateStatus: () => true,
      }
    );

    if (response.status === 404) {
      // Guest — not logged in
      return res.json({ groupId: null });
    }

    if (response.status !== 200) {
      return res.json({ groupId: null });
    }

    // Decode JWT payload (base64 middle section) — no verification needed,
    // we trust our own BC store's response
    const jwt = response.data;
    const payload = JSON.parse(
      Buffer.from(jwt.split('.')[1], 'base64').toString('utf8')
    );

    const groupId = payload?.customer?.group_id
      ? String(payload.customer.group_id)
      : null;

    res.json({ groupId });
  } catch (err) {
    next(err);
  }
});