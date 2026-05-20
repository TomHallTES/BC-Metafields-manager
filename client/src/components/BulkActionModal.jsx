import { useState } from 'react';

const OPERATIONS = [
  { id: 'set', label: 'Set value', description: 'Write a value to a metafield on all selected products' },
  { id: 'clear', label: 'Clear value', description: 'Set the metafield value to empty string' },
  { id: 'delete', label: 'Delete metafield', description: 'Permanently remove the metafield from selected products' },
  { id: 'copy', label: 'Copy field', description: 'Copy values from one metafield key to another' },
];

export default function BulkActionModal({ selectedCount, onConfirm, onClose }) {
  const [op, setOp] = useState('set');
  const [namespace, setNamespace] = useState('');
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [srcNamespace, setSrcNamespace] = useState('');
  const [srcKey, setSrcKey] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (op === 'copy') {
      onConfirm({ operation: op, sourceNamespace: srcNamespace, sourceKey: srcKey, destNamespace: namespace, destKey: key });
    } else {
      onConfirm({ operation: op, namespace, key, value: op === 'set' ? value : undefined });
    }
  }

  const isCopy = op === 'copy';

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>Bulk action — {selectedCount} product{selectedCount !== 1 ? 's' : ''}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Operation</label>
            <select value={op} onChange={(e) => setOp(e.target.value)}>
              {OPERATIONS.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
            <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 5 }}>
              {OPERATIONS.find((o) => o.id === op)?.description}
            </p>
          </div>

          {isCopy && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="form-group">
                  <label>Source namespace</label>
                  <input type="text" value={srcNamespace} onChange={(e) => setSrcNamespace(e.target.value)}
                    placeholder="customer_group_access" required />
                </div>
                <div className="form-group">
                  <label>Source key</label>
                  <input type="text" value={srcKey} onChange={(e) => setSrcKey(e.target.value)}
                    placeholder="approved_groups" required />
                </div>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12, fontFamily: 'var(--mono)' }}>
                → copy to ↓
              </p>
            </>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group">
              <label>{isCopy ? 'Destination namespace' : 'Namespace'}</label>
              <input type="text" value={namespace} onChange={(e) => setNamespace(e.target.value)}
                placeholder="customer_group_access" required />
            </div>
            <div className="form-group">
              <label>{isCopy ? 'Destination key' : 'Key'}</label>
              <input type="text" value={key} onChange={(e) => setKey(e.target.value)}
                placeholder="approved_groups" required />
            </div>
          </div>

          {op === 'set' && (
            <div className="form-group">
              <label>Value</label>
              <input type="text" value={value} onChange={(e) => setValue(e.target.value)}
                placeholder="e.g. 42 or true or some-text" />
            </div>
          )}

          {op === 'delete' && (
            <p style={{ fontSize: 12, color: 'var(--danger)', background: 'rgba(224,85,85,0.08)', padding: '8px 10px', borderRadius: 5, marginBottom: 4 }}>
              This will permanently delete the metafield from all {selectedCount} selected products. This cannot be undone.
            </p>
          )}

          <div className="modal-footer">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className={`btn ${op === 'delete' ? 'btn-danger' : 'btn-primary'}`}>
              {OPERATIONS.find((o) => o.id === op)?.label} on {selectedCount} product{selectedCount !== 1 ? 's' : ''}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
