import { useState } from 'react';
import ProductsPage from './pages/ProductsPage';
import VariantsPage from './pages/VariantsPage';
import SchemaPage from './pages/SchemaPage';
import Toasts from './components/Toasts';
import { useToast } from './hooks/useToast';

export default function App() {
  const [tab, setTab] = useState('products');
  const { toasts, addToast } = useToast();

  return (
    <div className="layout">
      <header className="header">
        <div className="header-logo">
          <span style={{ color: 'var(--accent)' }}>⬡</span>
          bc-metafields<span>/manager</span>
        </div>
        <nav className="header-tabs">
          {['products', 'variants', 'schema'].map((t) => (
            <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t === 'schema' ? '⚙ Schema' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>
        <div className="header-right">
          <a href="https://github.com" target="_blank" rel="noreferrer"
            style={{ fontSize: 12, color: 'var(--text3)', textDecoration: 'none', fontFamily: 'var(--mono)' }}>
            GitHub
          </a>
          <a href="https://developer.bigcommerce.com/docs/rest-management/catalog/product-metafields"
            target="_blank" rel="noreferrer"
            style={{ fontSize: 12, color: 'var(--text3)', textDecoration: 'none', fontFamily: 'var(--mono)' }}>
            BC API docs
          </a>
        </div>
      </header>

      {tab === 'products' && <ProductsPage addToast={addToast} />}
      {tab === 'variants' && <VariantsPage addToast={addToast} />}
      {tab === 'schema' && <SchemaPage addToast={addToast} />}

      <Toasts toasts={toasts} />
    </div>
  );
}
