import { useState, useEffect } from 'react';
import { products as productsApi, variants as variantsApi, schema as schemaApi } from '../lib/api';
import JsonEditor from '../components/JsonEditor';
import AddColumnModal from '../components/AddColumnModal';

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
  const [showAddColumn, setShowAddColumn] = useState(false);

  useEffect(() => {
    schemaApi.get().then((s) => {
      const fields = s.variant || [];
      setSchemaFields(fields);
      setColumns(fields.map(f => `${f.namespace}:${f.key}`));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!productSearch) { setProductOptions([]); return; }
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

      // Add any discovered columns not already in schema
      const discovered = new Set();
      rows.forEach((v) => v.metafields.forEach((m) => discovered.add(`${m.namespace}:${m.key}`)));
      setColumns((prev) => {
        const extra = [...discovered].filter(c => !prev.includes(c));
        return [...prev, ...extra];
      });
    } catch {
      addToast('Failed to load variants', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddColumn(fieldDef) {
    try {
      const updated = await schemaApi.addField('variant', fieldDef);
      const fields = updated.variant || [];
      setSchemaFields(fields);
      setColumns(fields.map(f => `${f.namespace}:${f.key}`));
      setShowAddColumn(false);
      addToast(`Column "${fieldDef.name || fieldDef.key}" added`, 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to add column', 'error');
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
    const col = columns.length === 1 ? columns[0] : prompt('Metafield column (namespace:key):');
    if (!col || !col.includes(':')) return;
    const value = prompt(`Set "${col}" to:`);
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
        <td key={col} style={{ minWidth: 200, verticalAlign: 'top', padding: '6px 12px' }}>
          <JsonEditor value={editValue} onChange={setEditValue}
            onCommit={(val) => commitEdit(variant.id, col, val)}
            onCancel={() => setEditingCell(null)} />
        </td>
      );
    }
    if (isEditing) {
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
            <input type={fieldDef?.type === 'number' ? 'number' : fieldDef?.type === 'date' ? 'date' : 'text'}
              className="cell-input" autoFocus value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => commitEdit(variant.id, col)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(variant.id, col); if (e.key === 'Escape') setEditingCell(null); }} />
          )}
        </td>
      );
    }

    let displayVal = mf?.value || '—';
    if (isJson && mf?.value) {
      try { const s = JSON.stringify(JSON.parse(mf.value)); displayVal = s.length > 40 ? s.substring(0, 40) + '…' : s; }
      catch { displayVal = mf.value.substring(0, 40); }
    }

    return (
      <td key={col}>
        <span className={`cell-display ${!mf?.value ? 'empty' : ''}`}
          onClick={() => startEdit(variant.id, col)} title={mf?.value || 'Click to edit'}>
          {displayVal}
        </span>
      </td>
    );
  }

  return (
    <div className="main">
      <div className="toolbar">
        <div style={{ position: 'relative' }}>
          <input type="search" placeholder="Search for a product…" style={{ width: 280 }}
            value={selectedProduct ? selectedProduct.name : productSearch}
            onChange={(e) => { setProductSearch(e.target.value); setSelectedProduct(null); }} />
          {productOptions.length > 0 && (
            <div className="product-dropdown">
              {productOptions.map((p) => (
                <div key={p.id} className="product-dropdown-item" onMouseDown={() => loadVariants(p)}>
                  <strong style={{ fontSize: 13 }}>{p.name}</strong>
                  <span style={{ color: 'var(--text3)', fontSize: 11, marginLeft: 8 }}>{p.sku}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {selectedProduct && (
          <button className="btn" onClick={() => { setSelectedProduct(null); setVariantRows([]); setProductSearch(''); }}>✕ Clear</button>
        )}
        {selected.size > 0 && (
          <>
            <div className="divider" />
            <span style={{ fontSize: 13, color: 'var(--accent)', fontFamily: 'var(--mono)', fontWeight: 600 }}>{selected.size} selected</span>
            <button className="btn btn-sm" onClick={handleBulkSet}>Bulk set…</button>
          </>
        )}
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setShowAddColumn(true)}>+ Column</button>
      </div>

      <div className="table-wrap">
        {!selectedProduct ? (
          <div className="empty">
            <h3>Select a product</h3>
            <p>Search for a product above to view and edit its variant metafields</p>
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
                    checked={selected.size === variantRows.length && variantRows.length > 0}
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

      {showAddColumn && <AddColumnModal resource="variants" onSave={handleAddColumn} onClose={() => setShowAddColumn(false)} />}
    </div>
  );
}
