import { useState, useEffect } from 'react';
import { schema as schemaApi } from '../lib/api';

const TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'json', label: 'JSON' },
  { value: 'boolean', label: 'True / False' },
  { value: 'date', label: 'Date' },
];

function FieldForm({ onSave, onCancel, initial = {} }) {
  const [name, setName] = useState(initial.name || '');
  const [namespace, setNamespace] = useState(initial.namespace || '');
  const [key, setKey] = useState(initial.key || '');
  const [type, setType] = useState(initial.type || 'text');
  const [description, setDescription] = useState(initial.description || '');
  const [storefront, setStorefront] = useState(initial.storefront ?? false);

  function handleSubmit(e) {
    e.preventDefault();
    onSave({ name, namespace, key, type, description, storefront });
  }

  // Auto-generate key from name if key is empty
  function handleNameChange(val) {
    setName(val);
    if (!initial.key) {
      setKey(val.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''));
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Display name</label>
          <input type="text" value={name} onChange={e => handleNameChange(e.target.value)}
            placeholder="Pack Size" required />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Type</label>
          <select value={type} onChange={e => setType(e.target.value)}>
            {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Namespace</label>
          <input type="text" value={namespace} onChange={e => setNamespace(e.target.value)}
            placeholder="sparklayer" required />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Key</label>
          <input type="text" value={key} onChange={e => setKey(e.target.value)}
            placeholder="pack_size" required />
        </div>
      </div>
      <div className="form-group" style={{ margin: 0 }}>
        <label>Description <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(optional)</span></label>
        <input type="text" value={description} onChange={e => setDescription(e.target.value)}
          placeholder="e.g. Number of units per pack" />
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
        <input type="checkbox" checked={storefront} onChange={e => setStorefront(e.target.checked)} />
        <span style={{ color: 'var(--text2)' }}>Available on storefront (via GraphQL)</span>
      </label>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary">Save field</button>
      </div>
    </form>
  );
}

function FieldCard({ field, onEdit, onDelete }) {
  const typeColors = {
    text: 'badge-blue',
    number: 'badge-green',
    json: 'badge-warn',
    boolean: 'badge-blue',
    date: 'badge-blue',
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 14px',
      background: 'var(--bg2)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      marginBottom: 6,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ fontWeight: 500, fontSize: 13 }}>{field.name || field.key}</span>
          <span className={`badge ${typeColors[field.type] || 'badge-blue'}`}>{field.type}</span>
          {field.storefront && (
            <span className="badge badge-green" style={{ fontSize: 10 }}>storefront</span>
          )}
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>
          {field.namespace}:{field.key}
        </span>
        {field.description && (
          <span style={{ fontSize: 12, color: 'var(--text2)', marginLeft: 10 }}>{field.description}</span>
        )}
      </div>
      <button className="btn btn-sm" onClick={() => onEdit(field)}>Edit</button>
      <button className="btn btn-sm btn-danger" onClick={() => onDelete(field)}>Delete</button>
    </div>
  );
}

export default function SchemaPage({ addToast }) {
  const [schema, setSchema] = useState({ product: [], variant: [] });
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(null); // 'product' | 'variant' | null
  const [editing, setEditing] = useState(null); // { resource, field }

  useEffect(() => {
    schemaApi.get()
      .then(setSchema)
      .catch(() => addToast('Failed to load schema', 'error'))
      .finally(() => setLoading(false));
  }, []);

  async function handleAdd(resource, field) {
    try {
      const updated = await schemaApi.addField(resource, field);
      setSchema(updated);
      setAdding(null);
      addToast(`${field.name || field.key} added`, 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to add field', 'error');
    }
  }

  async function handleUpdate(resource, oldField, newField) {
    try {
      const updated = await schemaApi.updateField(resource, oldField.namespace, oldField.key, newField);
      setSchema(updated);
      setEditing(null);
      addToast('Field updated', 'success');
    } catch {
      addToast('Failed to update field', 'error');
    }
  }

  async function handleDelete(resource, field) {
    if (!confirm(`Delete "${field.name || field.key}"? This only removes it from the schema — existing metafield values on products are not deleted.`)) return;
    try {
      const updated = await schemaApi.deleteField(resource, field.namespace, field.key);
      setSchema(updated);
      addToast('Field removed from schema', 'success');
    } catch {
      addToast('Failed to delete field', 'error');
    }
  }

  if (loading) return <div className="empty"><span className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} /></div>;

  return (
    <div className="main" style={{ overflow: 'auto' }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 20px' }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 18, fontWeight: 500, margin: '0 0 6px' }}>Shared metafield schema</h1>
          <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0 }}>
            Define your metafield columns once here. They'll always appear in the Products and Variants tables,
            even if a product doesn't have a value set yet.
          </p>
        </div>

        {/* Product fields */}
        <section style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>
              Product fields
              <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 400, marginLeft: 8 }}>
                ({schema.product.length})
              </span>
            </h2>
            {adding !== 'product' && (
              <button className="btn btn-sm btn-primary" onClick={() => { setAdding('product'); setEditing(null); }}>
                + Add field
              </button>
            )}
          </div>

          {adding === 'product' && (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-lg)', padding: 16, marginBottom: 12 }}>
              <FieldForm
                onSave={(f) => handleAdd('product', f)}
                onCancel={() => setAdding(null)}
              />
            </div>
          )}

          {editing?.resource === 'product' && (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--accent)', borderRadius: 'var(--radius-lg)', padding: 16, marginBottom: 12 }}>
              <p style={{ fontSize: 12, color: 'var(--text2)', margin: '0 0 12px' }}>Editing: {editing.field.name}</p>
              <FieldForm
                initial={editing.field}
                onSave={(f) => handleUpdate('product', editing.field, f)}
                onCancel={() => setEditing(null)}
              />
            </div>
          )}

          {schema.product.length === 0 && adding !== 'product' ? (
            <div style={{ padding: '20px 0', color: 'var(--text3)', fontSize: 13 }}>
              No product fields defined yet. Add one above.
            </div>
          ) : (
            schema.product.map((f) => (
              <FieldCard key={`${f.namespace}:${f.key}`} field={f}
                onEdit={(field) => { setEditing({ resource: 'product', field }); setAdding(null); }}
                onDelete={(field) => handleDelete('product', field)} />
            ))
          )}
        </section>

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--border)', marginBottom: 32 }} />

        {/* Variant fields */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>
              Variant fields
              <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 400, marginLeft: 8 }}>
                ({schema.variant.length})
              </span>
            </h2>
            {adding !== 'variant' && (
              <button className="btn btn-sm btn-primary" onClick={() => { setAdding('variant'); setEditing(null); }}>
                + Add field
              </button>
            )}
          </div>

          {adding === 'variant' && (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-lg)', padding: 16, marginBottom: 12 }}>
              <FieldForm
                onSave={(f) => handleAdd('variant', f)}
                onCancel={() => setAdding(null)}
              />
            </div>
          )}

          {editing?.resource === 'variant' && (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--accent)', borderRadius: 'var(--radius-lg)', padding: 16, marginBottom: 12 }}>
              <p style={{ fontSize: 12, color: 'var(--text2)', margin: '0 0 12px' }}>Editing: {editing.field.name}</p>
              <FieldForm
                initial={editing.field}
                onSave={(f) => handleUpdate('variant', editing.field, f)}
                onCancel={() => setEditing(null)}
              />
            </div>
          )}

          {schema.variant.length === 0 && adding !== 'variant' ? (
            <div style={{ padding: '20px 0', color: 'var(--text3)', fontSize: 13 }}>
              No variant fields defined yet. Add one above.
            </div>
          ) : (
            schema.variant.map((f) => (
              <FieldCard key={`${f.namespace}:${f.key}`} field={f}
                onEdit={(field) => { setEditing({ resource: 'variant', field }); setAdding(null); }}
                onDelete={(field) => handleDelete('variant', field)} />
            ))
          )}
        </section>

        <div style={{ marginTop: 32, padding: '14px 16px', background: 'var(--bg2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text2)' }}>
          Deleting a field from the schema only removes the column from this app's tables.
          It does <strong style={{ color: 'var(--text)' }}>not</strong> delete the actual metafield values stored on your products in BigCommerce.
          Use the bulk delete action in the Products or Variants tab to remove values.
        </div>
      </div>
    </div>
  );
}
