import { useState, useEffect, useCallback, useRef } from 'react';
import { products as productsApi, metafields as metafieldsApi, schema as schemaApi } from '../lib/api';
import BulkActionModal from '../components/BulkActionModal';
import CsvModal from '../components/CsvModal';
import JsonEditor from '../components/JsonEditor';

export default function ProductsPage({ addToast }) {
  const [productList, setProductList] = useState([]);
  const [metaMap, setMetaMap] = useState({});
  const [schemaFields, setSchemaFields] = useState([]); // shared field definitions
  const [columns, setColumns] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [metaLoading, setMetaLoading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [showCsv, setShowCsv] = useState(false);
  const searchTimeout = useRef(null);

  // Load schema + filters on mount
  useEffect(() => {
    productsApi.categories().then((d) => setCategories(d.data || []));
    productsApi.brands().then((d) => setBrands(d.data || []));
    schemaApi.get().then((s) => {
      setSchemaFields(s.product || []);
    }).catch(() => {});
  }, []);

  // Merge schema columns with discovered columns — schema always first
  function buildColumns(schemaFields, discoveredCols) {
    const schemaCols = schemaFields.map(f => `${f.namespace}:${f.key}`);
    const extra = discoveredCols.filter(c => !schemaCols.includes(c));
    return [...schemaCols, ...extra];
  }

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
    try {
      const data = await productsApi.list({
        page, limit: 50,
        keyword: search || undefined,
        category_id: categoryId || undefined,
        brand_id: brandId || undefined,
      });
      setProductList(data.data || []);
      setPagination(data.meta?.pagination);

      const ids = (data.data || []).map((p) => p.id);
      if (ids.length) {
        setMetaLoading(true);
        const mfData = await metafieldsApi.batchForProducts(ids);
        setMetaMap((prev) => ({ ...prev, ...mfData.data }));

        // Discover any extra columns not in schema
        const colSet = new Set();
        Object.values(mfData.data).forEach((mfs) =>
          mfs.forEach((m) => colSet.add(`${m.namespace}:${m.key}`))
        );

        setColumns((prev) => {
          const merged = buildColumns(schemaFields, [...colSet]);
          // keep any manually added columns too
          const manual = prev.filter(c => !merged.includes(c));
          return [...merged, ...manual];
        });
        setMetaLoading(false);
      }
    } catch {
      addToast('Failed to load products', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, search, categoryId, brandId, schemaFields]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  // When schema loads/changes, rebuild columns
  useEffect(() => {
    setColumns((prev) => {
      const schemaCols = schemaFields.map(f => `${f.namespace}:${f.key}`);
      const extra = prev.filter(c => !schemaCols.includes(c));
      return [...schemaCols, ...extra];
    });
  }, [schemaFields]);

  function handleSearchChange(val) {
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => { setSearch(val); setPage(1); }, 400);
  }

  function toggleSelect(id) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSelected(selected.size === productList.length ? new Set() : new Set(productList.map((p) => p.id)));
  }

  function getFieldDef(col) {
    const [ns, k] = col.split(':');
    return schemaFields.find(f => f.namespace === ns && f.key === k);
  }

  function startEdit(productId, col) {
    const mfs = metaMap[productId] || [];
    const [ns, k] = col.split(':');
    const existing = mfs.find((m) => m.namespace === ns && m.key === k);
    setEditingCell({ productId, col });
    setEditValue(existing?.value ?? '');
  }

  async function commitEdit(productId, col, overrideValue) {
    const value = overrideValue !== undefined ? overrideValue : editValue;
    setEditingCell(null);
    const mfs = metaMap[productId] || [];
    const [namespace, key] = col.split(':');
    const existing = mfs.find((m) => m.namespace === namespace && m.key === key);
    const fieldDef = getFieldDef(col);
    const permission_set = fieldDef?.storefront ? 'read' : 'write';
    try {
      let updated;
      if (existing) {
        const res = await metafieldsApi.update(productId, existing.id, { value });
        updated = res.data;
        setMetaMap((prev) => ({
          ...prev,
          [productId]: prev[productId].map((m) => (m.id === existing.id ? updated : m)),
        }));
      } else {
        const res = await metafieldsApi.create(productId, { namespace, key, value, permission_set });
        updated = res.data;
        setMetaMap((prev) => ({ ...prev, [productId]: [...(prev[productId] || []), updated] }));
        if (!columns.includes(col)) setColumns((c) => [...new Set([...c, col])]);
      }
      addToast('Saved', 'success');
    } catch {
      addToast('Failed to save', 'error');
    }
  }

  async function handleBulkConfirm(opts) {
    setShowBulk(false);
    const productIds = [...selected];
    setProgress({ label: `Processing ${productIds.length} products…`, pct: 0 });
    try {
      let result;
      if (opts.operation === 'set') result = await metafieldsApi.bulkSet({ productIds, namespace: opts.namespace, key: opts.key, value: opts.value });
      else if (opts.operation === 'clear') result = await metafieldsApi.bulkClear({ productIds, namespace: opts.namespace, key: opts.key });
      else if (opts.operation === 'delete') result = await metafieldsApi.bulkDelete({ productIds, namespace: opts.namespace, key: opts.key });
      else if (opts.operation === 'copy') result = await metafieldsApi.bulkCopy({ productIds, sourceNamespace: opts.sourceNamespace, sourceKey: opts.sourceKey, destNamespace: opts.destNamespace, destKey: opts.destKey });
      setProgress(null);
      addToast(`Done: ${result.succeeded}/${result.total} succeeded${result.errors?.length ? `, ${result.errors.length} errors` : ''}`, result.errors?.length ? 'error' : 'success');
      await loadProducts();
    } catch {
      setProgress(null);
      addToast('Bulk operation failed', 'error');
    }
  }

  function getCell(productId, col) {
    const [ns, k] = col.split(':');
    return (metaMap[productId] || []).find((m) => m.namespace === ns && m.key === k);
  }

  function renderCell(product, col) {
    const mf = getCell(product.id, col);
    const fieldDef = getFieldDef(col);
    const isEditing = editingCell?.productId === product.id && editingCell?.col === col;
    const isJson = fieldDef?.type === 'json';

    if (isEditing && isJson) {
      return (
        <td key={col} style={{ minWidth: 200, verticalAlign: 'top', padding: '6px 10px' }}>
          <JsonEditor
            value={editValue}
            onChange={setEditValue}
            onCommit={(val) => commitEdit(product.id, col, val)}
            onCancel={() => setEditingCell(null)}
          />
        </td>
      );
    }

    if (isEditing) {
      const inputType = fieldDef?.type === 'number' ? 'number' : fieldDef?.type === 'date' ? 'date' : 'text';
      return (
        <td key={col}>
          {fieldDef?.type === 'boolean' ? (
            <select className="cell-input" autoFocus value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => commitEdit(product.id, col)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(product.id, col); if (e.key === 'Escape') setEditingCell(null); }}>
              <option value="">—</option>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          ) : (
            <input type={inputType} className="cell-input" autoFocus value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => commitEdit(product.id, col)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(product.id, col); if (e.key === 'Escape') setEditingCell(null); }} />
          )}
        </td>
      );
    }

    // Display value — truncate JSON for readability
    let displayVal = mf?.value || '—';
    if (isJson && mf?.value) {
      try {
        const parsed = JSON.parse(mf.value);
        displayVal = JSON.stringify(parsed).substring(0, 40) + (JSON.stringify(parsed).length > 40 ? '…' : '');
      } catch { displayVal = mf.value.substring(0, 40); }
    }

    return (
      <td key={col}>
        <span className={`cell-display ${!mf?.value ? 'empty' : ''}`}
          onClick={() => startEdit(product.id, col)}
          title={mf?.value || 'Click to edit'}>
          {displayVal}
        </span>
      </td>
    );
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
        <button className="btn" onClick={() => setShowCsv(true)}>↑↓ CSV</button>
        <button className="btn btn-primary" onClick={() => {
          const col = prompt('Add custom column (namespace:key):');
          if (col && col.includes(':')) setColumns((c) => [...new Set([...c, col])]);
        }}>+ Column</button>
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
          <div className="progress-track"><div className="progress-bar" style={{ width: `${progress.pct || 10}%` }} /></div>
        </div>
      )}

      <div className="table-wrap">
        {loading ? (
          <div className="empty"><span className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} /></div>
        ) : productList.length === 0 ? (
          <div className="empty"><h3>No products found</h3><p>Try adjusting your filters</p></div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox" className="cb" checked={selected.size === productList.length && productList.length > 0} onChange={toggleAll} />
                </th>
                <th>Product</th>
                <th>SKU</th>
                {columns.map((col) => {
                  const [ns, k] = col.split(':');
                  const def = getFieldDef(col);
                  return (
                    <th key={col} style={{ minWidth: 140 }}>
                      <span className="col-ns">{ns}</span>
                      {def?.name || k}
                      {def?.type && def.type !== 'text' && (
                        <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 4 }}>({def.type})</span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {productList.map((product) => (
                <tr key={product.id} className={selected.has(product.id) ? 'selected' : ''}>
                  <td><input type="checkbox" className="cb" checked={selected.has(product.id)} onChange={() => toggleSelect(product.id)} /></td>
                  <td>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{product.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>ID: {product.id}</div>
                  </td>
                  <td className="mono">{product.sku || '—'}</td>
                  {columns.map((col) => renderCell(product, col))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showBulk && <BulkActionModal selectedCount={selected.size} onConfirm={handleBulkConfirm} onClose={() => setShowBulk(false)} />}
      {showCsv && <CsvModal selectedProductIds={[...selected]} allProductIds={allProductIds} onClose={() => setShowCsv(false)} onImportDone={loadProducts} />}
    </div>
  );
}
