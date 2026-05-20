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
