# bc-metafields-manager

A self-hosted bulk metafield editor for BigCommerce. Replaces slow, expensive SaaS tools with a fast spreadsheet-style UI you own.

![License](https://img.shields.io/badge/license-MIT-blue) ![Node](https://img.shields.io/badge/node-%3E%3D18-green)

---

## Features

- **Spreadsheet-style editor** — see all your products and their metafields in one table; click any cell to edit inline
- **Bulk operations** — set, clear, delete, or copy metafields across hundreds of products in one action
- **CSV import/export** — export any selection to CSV, edit in Excel or Google Sheets, re-import
- **Variant support** — full metafield editing for product variants, not just products
- **Fast filtering** — filter by category, brand, or keyword before editing
- **Rate-limit safe** — all bulk writes are batched with automatic retry on 429s

---

## Quick start

### 1. Get a BigCommerce API token

1. Go to **BigCommerce Admin → Advanced Settings → API Accounts**
2. Create a new V2/V3 API account
3. Grant these scopes:
   - Products: **Modify**
   - Store Content: **Read-only** (for categories/brands)
4. Copy your **Store Hash** and **Access Token**

### 2. Clone and configure

```bash
git clone https://github.com/YOUR_USERNAME/bc-metafields-manager.git
cd bc-metafields-manager

# Server config
cp server/.env.example server/.env
# Edit server/.env with your store hash and token
```

`server/.env`:
```
BC_STORE_HASH=abc123xyz
BC_ACCESS_TOKEN=your_token_here
CLIENT_ORIGIN=http://localhost:5173
PORT=3001
```

### 3. Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## CSV format

Columns use `namespace:key` format. The `product_id` or `sku` column is used to match rows to products.

```csv
product_id,sku,name,customer_group_access:approved_groups,warranty:warranty_years
101,WP-3000,Widget Pro 3000,42,2
102,GD-100,Gadget Deluxe,,1
```

On import, the app reads the namespace and key from each column header and upserts the value. Unknown columns (without a `:`) are ignored.

---

## Deploying to Railway

Railway is the recommended host — free tier, automatic deploys on every `git push`, no server management.

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/bc-metafields-manager.git
git push -u origin main
```

### 2. Create a Railway project

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click **New Project → Deploy from GitHub repo**
3. Select your `bc-metafields-manager` repo
4. Railway will detect the `railway.json` and start a build automatically

### 3. Add environment variables

In your Railway project dashboard → **Variables**, add:

| Variable | Value |
|---|---|
| `BC_STORE_HASH` | Your store hash (from BC API settings) |
| `BC_ACCESS_TOKEN` | Your API access token |
| `NODE_ENV` | `production` |

### 4. Done

Railway gives you a public URL (e.g. `https://bc-metafields-manager-production.up.railway.app`). Every `git push` to `main` triggers an automatic redeploy in ~30 seconds.

### Local development (no Railway needed)

```bash
cp server/.env.example server/.env   # add your BC credentials
npm install
npm run dev                           # server :3001, client :5173
```

---

## API rate limits

BigCommerce allows ~150 API requests/minute. The server batches all bulk operations in groups of 8–10 with a 400–600ms delay between batches. A single bulk-set across 200 products takes ~2 minutes. The client shows a progress indicator during long operations.

---

## Metafield namespaces

We recommend consistent namespace conventions:

| Namespace | Purpose |
|---|---|
| `customer_group_access` | Customer group visibility control |
| `warranty` | Warranty information |
| `supplier` | Supplier/vendor codes |
| `seo` | Custom SEO metadata |

Namespaces are arbitrary strings — pick whatever makes sense for your store.

---

## Architecture

```
client/          React + Vite frontend
  src/
    pages/       ProductsPage, VariantsPage
    components/  BulkActionModal, CsvModal, Toasts
    lib/         api.js (axios client)
    hooks/       useToast

server/          Express API proxy
  routes/        products, metafields, variants, csv
  lib/           bcClient.js (axios + batchProcess)
  index.js       Entry point
```

The server acts as an authenticated proxy to the BigCommerce Management API — your BC credentials never leave the server.

---

## Contributing

PRs welcome. Open an issue first for large changes.

### Ideas for future PRs
- [ ] Saved filter presets
- [ ] Column visibility toggle / reorder
- [ ] Metafield schema validation (type enforcement)
- [ ] Multi-store support (multiple `.env` profiles)
- [ ] Bulk variant metafields via CSV

---

## License

MIT — free to use, fork, and modify. No warranty.
