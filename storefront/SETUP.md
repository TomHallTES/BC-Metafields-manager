# Storefront visibility script — setup guide

## How it works

The script runs on every storefront page. It:

1. Reads the current customer's group ID from the page
2. Fetches variant metafields for every product visible on the page
3. If any variant has `visibility:disabled_for_groups` containing the customer's group ID — the entire product is hidden
4. On a PDP (product detail page), the customer is redirected away instead

Products are hidden instantly (before metafields load) to prevent a flash of
visible content. If the API call fails for any reason, products stay visible —
fail open, not closed.

---

## Step 1 — Expose the customer group ID in your theme

The script needs to know the current customer's group ID. BigCommerce exposes
this via Handlebars, but only in theme templates.

In your BC admin: **Storefront → My Themes → Edit Theme Files**

Open `templates/layout/base.html` and add this just before `</body>`:

```html
<script>
  window.__bcCustomerGroupId__ = "{{customer.group_id}}";
</script>
```

Save and publish the theme change.

---

## Step 2 — Get your Basic Auth credentials

The script calls your Railway API, which is password protected. You need to
encode your credentials:

1. Open your browser console (F12)
2. Run: `btoa('YOUR_APP_USER:YOUR_APP_PASS')`
3. Copy the output string — this is your `MANAGER_API_CREDENTIALS` value

---

## Step 3 — Configure the script

Open `storefront/visibility-script.js` and update the CONFIG section at the top:

```js
var MANAGER_API_URL = 'https://YOUR-APP.up.railway.app';  // your Railway URL
var MANAGER_API_CREDENTIALS = 'dXNlcjpwYXNz';            // your btoa output
var REDIRECT_PATH = '/not-available';                      // or '/' for homepage
```

---

## Step 4 — Create a "not available" page (optional)

If you want a friendly redirect page instead of bouncing customers to the homepage:

1. BC Admin → **Storefront → Web Pages → Create a Page**
2. Page name: "Not available"
3. URL: `/not-available`
4. Content: "This product is not available for your account."

---

## Step 5 — Add the script via Script Manager

1. BC Admin → **Storefront → Script Manager → Create Script**
2. Fill in:
   - **Name:** Group Visibility
   - **Location on page:** Footer
   - **Select pages where script will be added:** All Pages
   - **Script type:** Script
3. Paste the full contents of `visibility-script.js` into the script body
4. Save

---

## Step 6 — Add metafields to variants

Use the bc-metafields-manager app you already have running:

1. Open your Railway app URL
2. Go to the **Variants** tab
3. Search for a product
4. Click **+ Column** and enter: `visibility:disabled_for_groups`
5. Click the cell next to any variant you want to hide for a group
6. Enter the customer group ID (e.g. `42`)
7. To disable for multiple groups: `42,17`

To bulk-set across many variants at once, select them all and use **Bulk set**.

---

## Finding your customer group ID

BC Admin → **Customers → Customer Groups** → click the group → the ID is in the URL:
`/manage/customers/groups/{ID}/edit`

---

## Testing

1. Log in to your storefront as a customer in the restricted group
2. Navigate to a category page — restricted products should be invisible
3. Try the direct product URL — you should be redirected

To test without a real customer account: temporarily hardcode a group ID in the
script (`var groupId = '42';`) and remove it after testing.

---

## Caching note

The script makes one API call per product on the page. For category pages with
50 products, that's 50 sequential API calls. This is fine for occasional use
but may be slow on high-traffic stores.

**Optimisation for high-traffic stores:** Add a `/api/variants/batch-visibility`
endpoint to the server that accepts multiple product IDs and returns only the
disabled group IDs in a single response, reducing 50 calls to 1.
