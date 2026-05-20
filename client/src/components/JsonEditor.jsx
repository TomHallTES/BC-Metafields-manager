import { useState, useEffect } from 'react';

export default function JsonEditor({ value, onChange, onCommit, onCancel }) {
  const [text, setText] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    // Pretty-print if valid JSON, otherwise show raw
    try {
      const parsed = JSON.parse(value || '');
      setText(JSON.stringify(parsed, null, 2));
    } catch {
      setText(value || '');
    }
  }, []);

  function handleChange(val) {
    setText(val);
    if (!val.trim()) {
      setError(null);
      onChange(val);
      return;
    }
    try {
      JSON.parse(val);
      setError(null);
      onChange(val);
    } catch (e) {
      setError('Invalid JSON');
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') { onCancel(); return; }
    // Tab inserts spaces rather than moving focus
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      const newText = text.substring(0, start) + '  ' + text.substring(end);
      setText(newText);
      setTimeout(() => { e.target.selectionStart = e.target.selectionEnd = start + 2; }, 0);
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        autoFocus
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        style={{
          width: '100%',
          minHeight: 120,
          fontFamily: 'var(--mono)',
          fontSize: 12,
          background: 'var(--bg)',
          border: `1px solid ${error ? 'var(--danger)' : 'var(--accent)'}`,
          borderRadius: 4,
          color: 'var(--text)',
          padding: '6px 8px',
          resize: 'vertical',
          outline: 'none',
          lineHeight: 1.5,
        }}
        spellCheck={false}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
        {error && <span style={{ fontSize: 11, color: 'var(--danger)', fontFamily: 'var(--mono)' }}>{error}</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="btn btn-sm" onClick={onCancel}>Cancel</button>
          <button className="btn btn-sm btn-primary" onClick={() => !error && onCommit(text)} disabled={!!error}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
