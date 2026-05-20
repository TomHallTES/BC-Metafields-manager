import { useState, useEffect } from 'react';
import { products as productsApi, variants as variantsApi } from '../lib/api';

export default function VariantsPage({ addToast }) {
  const [productSearch, setProductSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productOptions, setProductOptions] = useState([]);
  const [variantRows, setVariantRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');

  // Search products
  useEffect(() => {
    if (!productSearch) return;
    const t = setTimeout(async () => {
      const data = await productsApi.list({ keyword: productSearch, limit: 20 });
      setProductOptions(data.data || []);
    }, 350);
    return () => clearTimeout(t);
  }, [productSearch]);

  async function loadVariants(product) {
    setSelectedProduct(product);
    setProductOptions([]);
    setLoading(true);
    setSelected(new Set());
    try {
      const data = await variantsApi.forProduct(product.id);
      const rows = data.data || [];
      setVariantRows(rows);

      const colSet = new Set();
      rows.forEach((v) => v.metafields.forEach((m) => colSet.add(`${m.namespace}:${m.key}`)));
      setColumns([...colSet].sort());
    } catch {
      addToast('Failed to load variants', 'error');
    } finally {
      setLoading(false);
    }
  }

  function getCell(variantId, col) {
    const variant = variantRows.find((v) => v.id === variantId);
    const [ns, k] = col.split(':');
    return (variant?.metafields || []).find((m) => m.namespace === ns && m.key === k);
  }

  function startEdit(variantId, col) {
    const mf = getCell(variantId, col);
    setEditingCell({ variantId, col });
    setEditValue(mf?.value ?? '');
  }

  async function commitEdit(variantId, col) {
    setEditingCell(null);
    const variant = variantRows.find((v) => v.id === variantId);
    const [namespace, key] = col.split(':');
    const existing = getCell(variantId, col);
    try {
      if (existing) {
        const res = await variantsApi.update(selectedProduct.id, variantId, existing.id, { value: editValue });
        setVariantRows((rows) => rows.map((v) =>
          v.id === variantId
            ? { ...v, metafields: v.metafields.map((m) => m.id === existing.id ? res.data : m) }
            : v
        ));
      } else {
        const res = await variantsApi.create(selectedProduct.id, variantId, { namespace, key, value: editValue, permission_set: 'write' });
        setVariantRows((rows) => rows.map((v) =>
          v.id === variantId ? { ...v, metafields: [...v.metafields, res.data] } : v
        ));
        if (!columns.includes(col)) setColumns((c) => [...new Set([...c, col])].sort());
      }
      addToast('Saved', 'success');
    } catch {
      addToast('Failed to save', 'error');
    }
  }

  function toggleSelect(id) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function handleBulkSet() {
    const col = prompt('Metafield (namespace:key):');
    if (!col || !col.includes(':')) return;
    const value = prompt('Value to set:');
    if (value === null) return;
    const [namespace, key] = col.split(':');
    const items = [...selected].map((variantId) => {
      const v = variantRows.find((r) => r.id === variantId);
      return { productId: selectedProduct.id, variantId, productIdNum: v?.product_id };
    });
    try {
      const res = await variantsApi.bulkSet({ items: items.map((i) => ({ productId: i.productId, variantId: i.variantId })), namespace, key, value });
      addToast(`Done: ${res.succeeded}/${res.total} succeeded`, 'success');
      await loadVariants(selectedProduct);
    } catch {
      addToast('Bulk set failed', 'error');
    }
  }

  return (
    <div className="main">
      <div className="toolbar">
        <div style={{ position: 'relative' }}>
          <input type="search" placeholder="Search for a product…" style={{ width: 260 }}
            value={selectedProduct ? selectedProduct.name : productSearch}
            onChange={(e) => { setProductSearch(e.target.value); setSelectedProduct(null); }} />
          {productOptions.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 50, background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 'var(--radius)', marginTop: 4, minWidth: 300, maxHeight: 240, overflow: 'auto' }}>
              {productOptions.map((p) => (
                <div key={p.id} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--border)' }}
                  onMouseDown={() => loadVariants(p)}>
                  <strong>{p.name}</strong> <span style={{ color: 'var(--text3)', fontSize: 11 }}>{p.sku}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {selectedProduct && (
          <button className="btn" onClick={() => { setSelectedProduct(null); setVariantRows([]); setColumns([]); }}>✕ Clear</button>
        )}
        {selected.size > 0 && (
          <>
            <div className="divider" />
            <span style={{ fontSize: 13, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{selected.size} selected</span>
            <button className="btn btn-sm" onClick={handleBulkSet}>Bulk set…</button>
          </>
        )}
        {selectedProduct && columns.length > 0 && (
          <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => {
            const col = prompt('New column (namespace:key):');
            if (col?.includes(':')) setColumns((c) => [...new Set([...c, col])].sort());
          }}>+ Column</button>
        )}
      </div>

      <div className="table-wrap">
        {!selectedProduct ? (
          <div className="empty">
            <h3>Select a product above</h3>
            <p>Search for a product to view and edit its variant metafields</p>
          </div>
        ) : loading ? (
          <div className="empty"><span className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} /></div>
        ) : variantRows.length === 0 ? (
          <div className="empty"><h3>No variants found</h3></div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox" className="cb"
                    checked={selected.size === variantRows.length}
                    onChange={() => setSelected(selected.size === variantRows.length ? new Set() : new Set(variantRows.map((v) => v.id)))} />
                </th>
                <th>Variant</th>
                <th>SKU</th>
                {columns.map((col) => {
                  const [ns, k] = col.split(':');
                  return <th key={col} style={{ minWidth: 130 }}><span className="col-ns">{ns}</span>{k}</th>;
                })}
              </tr>
            </thead>
            <tbody>
              {variantRows.map((variant) => (
                <tr key={variant.id} className={selected.has(variant.id) ? 'selected' : ''}>
                  <td><input type="checkbox" className="cb" checked={selected.has(variant.id)} onChange={() => toggleSelect(variant.id)} /></td>
                  <td>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{variant.option_values?.map((o) => o.label).join(' / ') || `Variant ${variant.id}`}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>ID: {variant.id}</div>
                  </td>
                  <td className="mono">{variant.sku || '—'}</td>
                  {columns.map((col) => {
                    const mf = getCell(variant.id, col);
                    const isEditing = editingCell?.variantId === variant.id && editingCell?.col === col;
                    return (
                      <td key={col}>
                        {isEditing ? (
                          <input className="cell-input" autoFocus value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => commitEdit(variant.id, col)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitEdit(variant.id, col);
                              if (e.key === 'Escape') setEditingCell(null);
                            }} />
                        ) : (
                          <span className={`cell-display ${!mf?.value ? 'empty' : ''}`}
                            onClick={() => startEdit(variant.id, col)}>
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
    </div>
  );
}
