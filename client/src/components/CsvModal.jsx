import { useState, useRef } from 'react';
import Papa from 'papaparse';
import { csv as csvApi } from '../lib/api';

export default function CsvModal({ selectedProductIds, allProductIds, onClose, onImportDone }) {
  const [mode, setMode] = useState('export'); // 'export' | 'import'
  const [importFile, setImportFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [over, setOver] = useState(false);
  const fileRef = useRef();

  const exportIds = selectedProductIds.length ? selectedProductIds : allProductIds;

  async function handleExport() {
    setLoading(true);
    try {
      const blob = await csvApi.exportProducts({ productIds: exportIds });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'metafields-export.csv';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  }

  async function handleFileSelect(file) {
    if (!file) return;
    setImportFile(file);
    setResult(null);
    const text = await file.text();
    try {
      const data = await csvApi.importPreview(text);
      setPreview({ ...data, text });
    } catch (err) {
      setPreview({ error: err.response?.data?.error || 'Failed to parse CSV' });
    }
  }

  async function handleImport() {
    if (!preview?.text) return;
    setLoading(true);
    try {
      const data = await csvApi.importApply(preview.text);
      setResult(data);
      onImportDone?.();
    } catch (err) {
      setResult({ error: err.response?.data?.error || 'Import failed' });
    } finally {
      setLoading(false);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file?.name.endsWith('.csv')) handleFileSelect(file);
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {['export', 'import'].map((m) => (
            <button key={m} className={`btn ${mode === m ? 'btn-primary' : ''}`}
              onClick={() => { setMode(m); setPreview(null); setResult(null); }}>
              {m === 'export' ? '↓ Export CSV' : '↑ Import CSV'}
            </button>
          ))}
          <button className="btn" style={{ marginLeft: 'auto' }} onClick={onClose}>✕</button>
        </div>

        {mode === 'export' && (
          <div>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
              Exports product ID, SKU, name, and all metafield columns for{' '}
              <strong style={{ color: 'var(--text)' }}>
                {selectedProductIds.length ? `${selectedProductIds.length} selected` : `all ${allProductIds.length}`}
              </strong>{' '}
              products. Columns use <code style={{ fontSize: 11 }}>namespace:key</code> format.
            </p>
            <p style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text3)', marginBottom: 16 }}>
              product_id,sku,name,customer_group_access:approved_groups,...
            </p>
            <button className="btn btn-success" onClick={handleExport} disabled={loading}>
              {loading ? <><span className="spinner" /> Exporting…</> : `↓ Download CSV (${exportIds.length} products)`}
            </button>
          </div>
        )}

        {mode === 'import' && !result && (
          <div>
            <div
              className={`drop-zone ${over ? 'over' : ''}`}
              style={{ marginBottom: 16 }}
              onClick={() => fileRef.current.click()}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={handleDrop}
            >
              {importFile ? (
                <><strong style={{ color: 'var(--text)' }}>{importFile.name}</strong><br />
                  <span style={{ fontSize: 12 }}>Click to change</span></>
              ) : (
                <><strong>Drop a CSV file here</strong> or click to browse<br />
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>
                    Must include product_id or sku column + namespace:key columns
                  </span></>
              )}
            </div>
            <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }}
              onChange={(e) => handleFileSelect(e.target.files?.[0])} />

            {preview?.error && (
              <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{preview.error}</p>
            )}

            {preview && !preview.error && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 13, marginBottom: 8 }}>
                  <span className="badge badge-blue">{preview.rowCount} rows</span>{' '}
                  <span className="badge badge-green">{preview.metaColumns.length} metafield columns</span>{' '}
                  <span className="badge">{preview.identifierField === 'product_id' ? 'matched by ID' : 'matched by SKU'}</span>
                </p>
                <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>Columns to import:</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {preview.metaColumns.map((c) => (
                    <span key={c} className="badge badge-blue" style={{ fontFamily: 'var(--mono)' }}>{c}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="modal-footer" style={{ marginTop: 0 }}>
              <button className="btn" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleImport}
                disabled={!preview || !!preview.error || loading}>
                {loading ? <><span className="spinner" /> Importing…</> : 'Apply import'}
              </button>
            </div>
          </div>
        )}

        {result && (
          <div>
            {result.error ? (
              <p style={{ color: 'var(--danger)' }}>{result.error}</p>
            ) : (
              <>
                <p style={{ fontSize: 13, marginBottom: 12 }}>
                  <span className="badge badge-green">{result.succeeded} succeeded</span>{' '}
                  {result.failed > 0 && <span className="badge badge-danger">{result.failed} failed</span>}
                </p>
                {result.errors?.length > 0 && (
                  <div style={{ maxHeight: 160, overflow: 'auto', fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--danger)' }}>
                    {result.errors.map((e, i) => (
                      <div key={i}>Product {e.item?.productId}: {e.error}</div>
                    ))}
                  </div>
                )}
              </>
            )}
            <div className="modal-footer" style={{ marginTop: 16 }}>
              <button className="btn btn-primary" onClick={onClose}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
