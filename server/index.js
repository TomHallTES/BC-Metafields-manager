require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const productsRouter = require('./routes/products');
const metafieldsRouter = require('./routes/metafields');
const variantsRouter = require('./routes/variants');
const csvRouter = require('./routes/csv');

const app = express();
const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';

// Trust Railway's proxy so rate limiter works correctly
app.set('trust proxy', 1);

if (!IS_PROD) {
  app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
}
app.use(express.json({ limit: '10mb' }));

// Basic auth — set APP_USER and APP_PASS in Railway Variables
const APP_USER = process.env.APP_USER;
const APP_PASS = process.env.APP_PASS;

console.log('Auth enabled:', !!(APP_USER && APP_PASS));

if (APP_USER && APP_PASS) {
  app.use((req, res, next) => {
    if (req.path === '/health') return next();
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Basic ')) {
      res.set('WWW-Authenticate', 'Basic realm="bc-metafields-manager"');
      return res.status(401).send('Authentication required');
    }
    const [user, pass] = Buffer.from(auth.slice(6), 'base64').toString().split(':');
    if (user === APP_USER && pass === APP_PASS) return next();
    res.set('WWW-Authenticate', 'Basic realm="bc-metafields-manager"');
    return res.status(401).send('Invalid credentials');
  });
}

const limiter = rateLimit({ windowMs: 60_000, max: 200, standardHeaders: true });
app.use('/api', limiter);

app.use('/api/products', productsRouter);
app.use('/api/metafields', metafieldsRouter);
app.use('/api/variants', variantsRouter);
app.use('/api/csv', csvRouter);

app.get('/health', (_, res) => res.json({ status: 'ok', ts: Date.now() }));

// Serve built React client in production
if (IS_PROD) {
  const clientDist = path.join(__dirname, '../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));