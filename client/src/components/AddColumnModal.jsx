import { useState } from 'react';

const TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'json', label: 'JSON' },
  { value: 'boolean', label: 'True / False' },
  { value: 'date', label: 'Date' },
];

export default function AddColumnModal({ resource, onSave, onClose }) {
  const [name, setName] = useState('');
  const [namespace, setNamespace] = useState('');
  const [key, setKey] = useState('');
  const [type, setType] = useState('text');
  const [storefront, setStorefront] = useState(false);

  function handleNameChange(val) {
    setName(val);
    if (!key) setKey(val.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!namespace || !key) return;
    onSave({ name: name || key, namespace, key, type, storefront });
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>Add column — {resource}</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Display name</label>
              <input type="text" value={name} onChange={e => handleNameChange(e.target.value)}
                placeholder="Pack Size" autoFocus />
            </div>
            <div className="form-group">
              <label>Type</label>
              <select value={type} onChange={e => setType(e.target.value)}>
                {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Namespace</label>
              <input type="text" value={namespace} onChange={e => setNamespace(e.target.value)}
                placeholder="sparklayer" required />
            </div>
            <div className="form-group">
              <label>Key</label>
              <input type="text" value={key} onChange={e => setKey(e.target.value)}
                placeholder="pack_size" required />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: 'var(--text2)', marginBottom: 4 }}>
            <input type="checkbox" checked={storefront} onChange={e => setStorefront(e.target.checked)} />
            Available on storefront (sets read_and_sf_access permission)
          </label>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
            This column will be saved to the schema and persist across sessions.
          </div>
          <div className="modal-footer">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Add column</button>
          </div>
        </form>
      </div>
    </div>
  );
}
