import { useState, useEffect, useCallback, useRef } from 'react';
import { products as productsApi, metafields as metafieldsApi } from '../lib/api';
import BulkActionModal from '../components/BulkActionModal';
import CsvModal from '../components/CsvModal';

export default function ProductsPage({ addToast, viewMode }) {
  const [productList, setProductList] = useState([]);
  const [metaMap, setMetaMap] = useState({}); // { productId: [metafield,...] }
  const [columns, setColumns] = useState([]); // ['namespace:key', ...]
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [metaLoading, setMetaLoading] = useState(false);
  const [progress, setProgress] = useState(null); // { label, pct }
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [editingCell, setEditingCell] = useState(null); // { productId, col }
  const [editValue, setEditValue] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [showCsv, setShowCsv] = useState(false);
  const searchTimeout = useRef(null);

  // Load filters
  useEffect(() => {
    productsApi.categories().then((d) => setCategories(d.data || []));
    productsApi.brands().then((d) => setBrands(d.data || []));
  }, []);

  // Load products
  const loadProducts = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
    try {
      const data = await productsApi.list({ page, limit: 50, keyword: search || undefined, category_id: categoryId || undefined, brand_id: brandId || undefined });
      setProductList(data.data || []);
      setPagination(data.meta?.pagination);

      // Fetch metafields for this page
      const ids = (data.data || []).map((p) => p.id);
      if (ids.length) {
        setMetaLoading(true);
        const mfData = await metafieldsApi.batchForProducts(ids);
        setMetaMap((prev) => ({ ...prev, ...mfData.data }));

        // Derive column set from all metafields
        const colSet = new Set();
        Object.values({ ...metaMap, ...mfData.data }).forEach((mfs) =>
          mfs.forEach((m) => colSet.add(`${m.namespace}:${m.key}`))
        );
        setColumns([...colSet].sort());
        setMetaLoading(false);
      }
    } catch (err) {
      addToast('Failed to load products', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, search, categoryId, brandId]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  // Debounced search
  function handleSearchChange(val) {
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => { setSearch(val); setPage(1); }, 400);
  }

  // Selection
  function toggleSelect(id) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSelected(selected.size === productList.length ? new Set() : new Set(productList.map((p) => p.id)));
  }

  // Inline cell edit
  function startEdit(productId, col) {
    const mfs = metaMap[productId] || [];
    const [ns, k] = col.split(':');
    const existing = mfs.find((m) => m.namespace === ns && m.key === k);
    setEditingCell({ productId, col });
    setEditValue(existing?.value ?? '');
  }

  async function commitEdit(productId, col) {
    setEditingCell(null);
    const mfs = metaMap[productId] || [];
    const [namespace, key] = col.split(':');
    const existing = mfs.find((m) => m.namespace === namespace && m.key === key);
    try {
      let updated;
      if (existing) {
        const res = await metafieldsApi.update(productId, existing.id, { value: editValue });
        updated = res.data;
        setMetaMap((prev) => ({
          ...prev,
          [productId]: prev[productId].map((m) => (m.id === existing.id ? updated : m)),
        }));
      } else {
        const res = await metafieldsApi.create(productId, { namespace, key, value: editValue, permission_set: 'write' });
        updated = res.data;
        setMetaMap((prev) => ({ ...prev, [productId]: [...(prev[productId] || []), updated] }));
        if (!columns.includes(col)) setColumns((c) => [...c, col].sort());
      }
      addToast('Saved', 'success');
    } catch {
      addToast('Failed to save cell', 'error');
    }
  }

  // Bulk action
  async function handleBulkConfirm(opts) {
    setShowBulk(false);
    const productIds = [...selected];
    const total = productIds.length;
    setProgress({ label: `Processing ${total} products…`, pct: 0 });

    try {
      let result;
      if (opts.operation === 'set') {
        result = await metafieldsApi.bulkSet({ productIds, namespace: opts.namespace, key: opts.key, value: opts.value });
      } else if (opts.operation === 'clear') {
        result = await metafieldsApi.bulkClear({ productIds, namespace: opts.namespace, key: opts.key });
      } else if (opts.operation === 'delete') {
        result = await metafieldsApi.bulkDelete({ productIds, namespace: opts.namespace, key: opts.key });
      } else if (opts.operation === 'copy') {
        result = await metafieldsApi.bulkCopy({ productIds, sourceNamespace: opts.sourceNamespace, sourceKey: opts.sourceKey, destNamespace: opts.destNamespace, destKey: opts.destKey });
      }
      setProgress(null);
      addToast(
        `Done: ${result.succeeded}/${result.total} succeeded${result.errors?.length ? `, ${result.errors.length} errors` : ''}`,
        result.errors?.length ? 'error' : 'success'
      );
      await loadProducts();
    } catch (err) {
      setProgress(null);
      addToast('Bulk operation failed', 'error');
    }
  }

  function getCell(productId, col) {
    const [ns, k] = col.split(':');
    return (metaMap[productId] || []).find((m) => m.namespace === ns && m.key === k);
  }

  const allProductIds = productList.map((p) => p.id);

  return (
    <div className="main">
      <div className="toolbar">
        <input type="search" placeholder="Search products or SKU…" style={{ width: 220 }}
          onChange={(e) => handleSearchChange(e.target.value)} />
        <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={brandId} onChange={(e) => { setBrandId(e.target.value); setPage(1); }}>
          <option value="">All brands</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <div className="divider" />
        <button className="btn" onClick={() => setShowCsv(true)}>
          ↑↓ CSV
        </button>
        <button className="btn btn-primary" onClick={() => {
          const col = prompt('New metafield column (namespace:key):');
          if (col && col.includes(':')) setColumns((c) => [...new Set([...c, col])].sort());
        }}>
          + Column
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {metaLoading && <span className="spinner" />}
          {pagination && (
            <span style={{ fontSize: 12, color: 'var(--text2)', fontFamily: 'var(--mono)' }}>
              {pagination.current_page}/{pagination.total_pages} ({pagination.total} products)
            </span>
          )}
          <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>←</button>
          <button className="btn btn-sm" disabled={!pagination || page >= pagination.total_pages} onClick={() => setPage(p => p + 1)}>→</button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="bulk-bar">
          <span className="bulk-bar-count">{selected.size} selected</span>
          <button className="btn btn-sm" onClick={() => setShowBulk(true)}>Bulk action…</button>
          <button className="btn btn-sm" onClick={() => setSelected(new Set())}>Deselect all</button>
        </div>
      )}

      {progress && (
        <div className="progress-wrap">
          <div className="progress-label">{progress.label}</div>
          <div className="progress-track"><div className="progress-bar" style={{ width: `${progress.pct}%` }} /></div>
        </div>
      )}

      <div className="table-wrap">
        {loading ? (
          <div className="empty"><span className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} /></div>
        ) : productList.length === 0 ? (
          <div className="empty">
            <h3>No products found</h3>
            <p>Try adjusting your filters</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox" className="cb" checked={selected.size === productList.length && productList.length > 0}
                    onChange={toggleAll} />
                </th>
                <th>Product</th>
                <th>SKU</th>
                {columns.map((col) => {
                  const [ns, k] = col.split(':');
                  return (
                    <th key={col} style={{ minWidth: 130 }}>
                      <span className="col-ns">{ns}</span>
                      {k}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {productList.map((product) => (
                <tr key={product.id} className={selected.has(product.id) ? 'selected' : ''}>
                  <td>
                    <input type="checkbox" className="cb" checked={selected.has(product.id)}
                      onChange={() => toggleSelect(product.id)} />
                  </td>
                  <td>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{product.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>ID: {product.id}</div>
                  </td>
                  <td className="mono">{product.sku || '—'}</td>
                  {columns.map((col) => {
                    const mf = getCell(product.id, col);
                    const isEditing = editingCell?.productId === product.id && editingCell?.col === col;
                    return (
                      <td key={col}>
                        {isEditing ? (
                          <input className="cell-input" autoFocus value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => commitEdit(product.id, col)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitEdit(product.id, col);
                              if (e.key === 'Escape') setEditingCell(null);
                            }} />
                        ) : (
                          <span className={`cell-display ${!mf?.value ? 'empty' : ''}`}
                            onClick={() => startEdit(product.id, col)}
                            title={mf?.value || 'Click to edit'}>
                            {mf?.value || '—'}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showBulk && (
        <BulkActionModal selectedCount={selected.size} onConfirm={handleBulkConfirm} onClose={() => setShowBulk(false)} />
      )}
      {showCsv && (
        <CsvModal selectedProductIds={[...selected]} allProductIds={allProductIds}
          onClose={() => setShowCsv(false)} onImportDone={loadProducts} />
      )}
    </div>
  );
}
