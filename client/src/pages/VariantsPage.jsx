import { useState, useEffect } from 'react';
import { products as productsApi, variants as variantsApi, schema as schemaApi } from '../lib/api';
import JsonEditor from '../components/JsonEditor';

export default function VariantsPage({ addToast }) {
  const [productSearch, setProductSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productOptions, setProductOptions] = useState([]);
  const [variantRows, setVariantRows] = useState([]);
  const [schemaFields, setSchemaFields] = useState([]);
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    schemaApi.get().then((s) => {
      setSchemaFields(s.variant || []);
      setColumns(s.variant?.map(f => `${f.namespace}:${f.key}`) || []);
    }).catch(() => {});
  }, []);

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

      // Discover extra columns beyond schema
      const colSet = new Set(schemaFields.map(f => `${f.namespace}:${f.key}`));
      rows.forEach((v) => v.metafields.forEach((m) => colSet.add(`${m.namespace}:${m.key}`)));
      setColumns([...colSet]);
    } catch {
      addToast('Failed to load variants', 'error');
    } finally {
      setLoading(false);
    }
  }

  function getFieldDef(col) {
    const [ns, k] = col.split(':');
    return schemaFields.find(f => f.namespace === ns && f.key === k);
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

  async function commitEdit(variantId, col, overrideValue) {
    const value = overrideValue !== undefined ? overrideValue : editValue;
    setEditingCell(null);
    const variant = variantRows.find((v) => v.id === variantId);
    const [namespace, key] = col.split(':');
    const existing = getCell(variantId, col);
    const fieldDef = getFieldDef(col);
    const permission_set = fieldDef?.storefront ? 'read_and_sf_access' : 'write';
    try {
      if (existing) {
        const res = await variantsApi.update(selectedProduct.id, variantId, existing.id, { value });
        setVariantRows((rows) => rows.map((v) =>
          v.id === variantId ? { ...v, metafields: v.metafields.map((m) => m.id === existing.id ? res.data : m) } : v
        ));
      } else {
        const res = await variantsApi.create(selectedProduct.id, variantId, { namespace, key, value, permission_set });
        setVariantRows((rows) => rows.map((v) =>
          v.id === variantId ? { ...v, metafields: [...v.metafields, res.data] } : v
        ));
        if (!columns.includes(col)) setColumns((c) => [...new Set([...c, col])]);
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
    const col = prompt('Metafield column (namespace:key):');
    if (!col || !col.includes(':')) return;
    const value = prompt('Value to set:');
    if (value === null) return;
    const [namespace, key] = col.split(':');
    const items = [...selected].map((variantId) => ({ productId: selectedProduct.id, variantId }));
    try {
      const res = await variantsApi.bulkSet({ items, namespace, key, value });
      addToast(`Done: ${res.succeeded}/${res.total} succeeded`, 'success');
      await loadVariants(selectedProduct);
    } catch {
      addToast('Bulk set failed', 'error');
    }
  }

  function renderCell(variant, col) {
    const mf = getCell(variant.id, col);
    const fieldDef = getFieldDef(col);
    const isEditing = editingCell?.variantId === variant.id && editingCell?.col === col;
    const isJson = fieldDef?.type === 'json';

    if (isEditing && isJson) {
      return (
        <td key={col} style={{ minWidth: 200, verticalAlign: 'top', padding: '6px 10px' }}>
          <JsonEditor
            value={editValue}
            onChange={setEditValue}
            onCommit={(val) => commitEdit(variant.id, col, val)}
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
              onBlur={() => commitEdit(variant.id, col)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(variant.id, col); if (e.key === 'Escape') setEditingCell(null); }}>
              <option value="">—</option>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          ) : (
            <input type={inputType} className="cell-input" autoFocus value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => commitEdit(variant.id, col)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(variant.id, col); if (e.key === 'Escape') setEditingCell(null); }} />
          )}
        </td>
      );
    }

    let displayVal = mf?.value || '—';
    if (isJson && mf?.value) {
      try {
        const parsed = JSON.parse(mf.value);
        const str = JSON.stringify(parsed);
        displayVal = str.substring(0, 40) + (str.length > 40 ? '…' : '');
      } catch { displayVal = mf.value.substring(0, 40); }
    }

    return (
      <td key={col}>
        <span className={`cell-display ${!mf?.value ? 'empty' : ''}`}
          onClick={() => startEdit(variant.id, col)}
          title={mf?.value || 'Click to edit'}>
          {displayVal}
        </span>
      </td>
    );
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
          <button className="btn" onClick={() => { setSelectedProduct(null); setVariantRows([]); }}>✕ Clear</button>
        )}
        {selected.size > 0 && (
          <>
            <div className="divider" />
            <span style={{ fontSize: 13, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{selected.size} selected</span>
            <button className="btn btn-sm" onClick={handleBulkSet}>Bulk set…</button>
          </>
        )}
        {selectedProduct && (
          <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => {
            const col = prompt('Add custom column (namespace:key):');
            if (col?.includes(':')) setColumns((c) => [...new Set([...c, col])]);
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
              {variantRows.map((variant) => (
                <tr key={variant.id} className={selected.has(variant.id) ? 'selected' : ''}>
                  <td><input type="checkbox" className="cb" checked={selected.has(variant.id)} onChange={() => toggleSelect(variant.id)} /></td>
                  <td>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{variant.option_values?.map((o) => o.label).join(' / ') || `Variant ${variant.id}`}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>ID: {variant.id}</div>
                  </td>
                  <td className="mono">{variant.sku || '—'}</td>
                  {columns.map((col) => renderCell(variant, col))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
