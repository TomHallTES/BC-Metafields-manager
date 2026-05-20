# bc-metafields-manager

A self-hosted bulk metafield editor for BigCommerce. Replaces slow, expensive SaaS tools with a fast spreadsheet-style UI you own and deploy yourself.

![License](https://img.shields.io/badge/license-MIT-blue) ![Node](https://img.shields.io/badge/node-%3E%3D18-green)

---

## Features

- **Spreadsheet-style editor** — see all your products and their metafields in one table; click any cell to edit inline
- **Bulk operations** — set, clear, delete, or copy metafields across hundreds of products in one action
- **CSV import/export** — export any selection to CSV, edit in Excel or Google Sheets, re-import
- **Variant support** — full metafield editing for product variants, not just products
- **Fast filtering** — filter by category, brand, or keyword before editing
- **Password protected** — simple HTTP basic auth keeps your catalogue private
- **Rate-limit safe** — all bulk writes are batched with automatic retry on 429s

---

## Quick start (local)

### 1. Get a BigCommerce API token

1. Go to **BigCommerce Admin → Advanced Settings → API Accounts**
2. Create a new V2/V3 API account
3. Grant these scopes:
   - Products: **Modify**
   - Store Content: **Read-only** (for categories/brands)
4. Copy your **Store Hash** and **Access Token**

Your store hash is the string shown in your BC admin URL: `https://store-{hash}.mybigcommerce.com` — just the `{hash}` portion.

### 2. Clone and configure

```bash
git clone https://github.com/YOUR_USERNAME/bc-metafields-manager.git
cd bc-metafields-manager
cp server/.env.example server/.env
```

Edit `server/.env`:

```
BC_STORE_HASH=abc123xyz
BC_ACCESS_TOKEN=your_token_here
CLIENT_ORIGIN=http://localhost:5173
PORT=3001

# Optional: enable password protection locally
APP_USER=admin
APP_PASS=your-password-here
```

### 3. Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Deploying to Railway

Railway is the recommended host — free tier, zero server management, automatic deploys on every `git push`.

### 1. Push your fork to GitHub

```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/bc-metafields-manager.git
git push -u origin master
```

> Note: Railway works with any branch name — `master` or `main` both work. Just make sure the branch you push matches what Railway is watching (it auto-detects on first connect).

### 2. Create a Railway project

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click **New Project → Deploy from GitHub repo**
3. Select your `bc-metafields-manager` repo
4. Railway detects `railway.json` and starts building automatically
5. Once deployed, go to **Settings → Networking → Generate Domain** to get your public URL

### 3. Add environment variables

In your Railway project dashboard → your service → **Variables**, add:

| Variable | Value | Required |
|---|---|---|
| `BC_STORE_HASH` | Your store hash (e.g. `abc123xyz`) | Yes |
| `BC_ACCESS_TOKEN` | Your BC API access token | Yes |
| `NODE_ENV` | `production` | Yes |
| `APP_USER` | Username for login prompt | Recommended |
| `APP_PASS` | Password for login prompt | Recommended |

> **Important:** `APP_USER` and `APP_PASS` enable HTTP basic auth. Without them the app is publicly accessible. Always set these in production.

### 4. Done

Every `git push` to your watched branch triggers an automatic redeploy in ~30 seconds. No SSH, no server management — the push is the deploy.

---

## Password protection

The app uses HTTP Basic Auth. When `APP_USER` and `APP_PASS` are set, the browser will show a login prompt before anything loads.

- Credentials live only in your environment variables — never in the repo
- To share access, give someone the username and password
- To revoke access, change `APP_PASS` in Railway Variables — it redeploys automatically

---

## CSV format

Columns use `namespace:key` format. The `product_id` or `sku` column is used to match rows to products.

```csv
product_id,sku,name,customer_group_access:approved_groups,warranty:warranty_years
101,WP-3000,Widget Pro 3000,42,2
102,GD-100,Gadget Deluxe,,1
```

On import, the app reads the namespace and key from each column header and upserts the value. Unknown columns (without a `:`) are ignored. Rows are matched by `product_id` if present, falling back to `sku`.

---

## API rate limits

BigCommerce allows ~150 API requests/minute. The server batches all bulk operations in groups of 8–10 with a 400–600ms delay between batches. A bulk-set across 200 products takes roughly 2 minutes. A progress indicator is shown during long operations, and any failures are surfaced in a post-operation summary.

---

## Metafield namespaces

Namespaces are arbitrary strings — use whatever makes sense for your store. Some suggestions:

| Namespace | Purpose |
|---|---|
| `customer_group_access` | Customer group visibility control |
| `warranty` | Warranty information |
| `supplier` | Supplier/vendor codes |
| `seo` | Custom SEO metadata |

Pick a convention early — namespaces are hard to rename in bulk later.

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

railway.json     Railway deployment config
```

The server is an authenticated proxy to the BigCommerce Management API — your BC credentials never leave the server and are never exposed to the browser.

---

## Troubleshooting

**"Failed to load products" on first load**
- Check that `BC_STORE_HASH` and `BC_ACCESS_TOKEN` are set correctly in your environment variables
- The store hash should be just the hash string, not a full URL
- Check Railway logs for `stores/undefined` in the error — this means `BC_STORE_HASH` isn't being picked up

**Railway created two services (client + server)**
- Delete the `client` service — you only need one
- The single service builds the client and serves it as static files from Express

**Blank page after deploy**
- Make sure `NODE_ENV=production` is set — this tells the server to serve the built React app
- Check that the build step completed successfully in the Railway deploy log

**429 errors during bulk operations**
- This is normal for very large stores — the app retries automatically
- If it persists, the batch delay can be increased in `server/lib/bcClient.js`

---

## Contributing

PRs welcome. Open an issue first for large changes.

### Ideas for future PRs
- [ ] Saved filter presets
- [ ] Column visibility toggle / reorder
- [ ] Metafield schema validation (type enforcement)
- [ ] Multi-store support (multiple `.env` profiles)
- [ ] Bulk variant metafields via CSV
- [ ] Customer group product restriction storefront script

---

## License

MIT — free to use, fork, and modify. No warranty.