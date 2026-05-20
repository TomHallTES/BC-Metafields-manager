const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const SCHEMA_PATH = path.join(__dirname, '../data/schema.json');

function readSchema() {
  try {
    if (!fs.existsSync(SCHEMA_PATH)) return { product: [], variant: [] };
    return JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  } catch {
    return { product: [], variant: [] };
  }
}

function writeSchema(schema) {
  const dir = path.dirname(SCHEMA_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SCHEMA_PATH, JSON.stringify(schema, null, 2));
}

// GET /api/schema
router.get('/', (req, res) => {
  res.json(readSchema());
});

// PUT /api/schema — replace full schema
router.put('/', (req, res) => {
  const { product = [], variant = [] } = req.body;
  const schema = { product, variant };
  writeSchema(schema);
  res.json(schema);
});

// POST /api/schema/product — add a product field
router.post('/product', (req, res) => {
  const schema = readSchema();
  const field = req.body;
  if (!field.namespace || !field.key || !field.type) {
    return res.status(400).json({ error: 'namespace, key and type are required' });
  }
  const exists = schema.product.some(f => f.namespace === field.namespace && f.key === field.key);
  if (exists) return res.status(409).json({ error: 'Field already exists' });
  schema.product.push(field);
  writeSchema(schema);
  res.json(schema);
});

// POST /api/schema/variant — add a variant field
router.post('/variant', (req, res) => {
  const schema = readSchema();
  const field = req.body;
  if (!field.namespace || !field.key || !field.type) {
    return res.status(400).json({ error: 'namespace, key and type are required' });
  }
  const exists = schema.variant.some(f => f.namespace === field.namespace && f.key === field.key);
  if (exists) return res.status(409).json({ error: 'Field already exists' });
  schema.variant.push(field);
  writeSchema(schema);
  res.json(schema);
});

// DELETE /api/schema/product/:namespace/:key
router.delete('/product/:namespace/:key', (req, res) => {
  const schema = readSchema();
  schema.product = schema.product.filter(
    f => !(f.namespace === req.params.namespace && f.key === req.params.key)
  );
  writeSchema(schema);
  res.json(schema);
});

// DELETE /api/schema/variant/:namespace/:key
router.delete('/variant/:namespace/:key', (req, res) => {
  const schema = readSchema();
  schema.variant = schema.variant.filter(
    f => !(f.namespace === req.params.namespace && f.key === req.params.key)
  );
  writeSchema(schema);
  res.json(schema);
});

// PUT /api/schema/product/:namespace/:key — update a field definition
router.put('/product/:namespace/:key', (req, res) => {
  const schema = readSchema();
  const idx = schema.product.findIndex(
    f => f.namespace === req.params.namespace && f.key === req.params.key
  );
  if (idx === -1) return res.status(404).json({ error: 'Field not found' });
  schema.product[idx] = { ...schema.product[idx], ...req.body };
  writeSchema(schema);
  res.json(schema);
});

// PUT /api/schema/variant/:namespace/:key
router.put('/variant/:namespace/:key', (req, res) => {
  const schema = readSchema();
  const idx = schema.variant.findIndex(
    f => f.namespace === req.params.namespace && f.key === req.params.key
  );
  if (idx === -1) return res.status(404).json({ error: 'Field not found' });
  schema.variant[idx] = { ...schema.variant[idx], ...req.body };
  writeSchema(schema);
  res.json(schema);
});

module.exports = router;
