import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export const products = {
  list: (params) => api.get('/products', { params }).then((r) => r.data),
  categories: () => api.get('/products/categories').then((r) => r.data),
  brands: () => api.get('/products/brands').then((r) => r.data),
};

export const metafields = {
  forProduct: (id) => api.get(`/metafields/product/${id}`).then((r) => r.data),
  batchForProducts: (ids) =>
    api.get('/metafields/products/batch', { params: { ids: ids.join(',') } }).then((r) => r.data),
  create: (productId, body) => api.post(`/metafields/product/${productId}`, body).then((r) => r.data),
  update: (productId, metafieldId, body) =>
    api.put(`/metafields/product/${productId}/${metafieldId}`, body).then((r) => r.data),
  delete: (productId, metafieldId) =>
    api.delete(`/metafields/product/${productId}/${metafieldId}`).then((r) => r.data),
  bulkSet: (body) => api.post('/metafields/bulk/set', body).then((r) => r.data),
  bulkClear: (body) => api.post('/metafields/bulk/clear', body).then((r) => r.data),
  bulkDelete: (body) => api.post('/metafields/bulk/delete', body).then((r) => r.data),
  bulkCopy: (body) => api.post('/metafields/bulk/copy', body).then((r) => r.data),
};

export const variants = {
  forProduct: (productId) => api.get(`/variants/${productId}`).then((r) => r.data),
  create: (productId, variantId, body) =>
    api.post(`/variants/${productId}/${variantId}`, body).then((r) => r.data),
  update: (productId, variantId, metafieldId, body) =>
    api.put(`/variants/${productId}/${variantId}/${metafieldId}`, body).then((r) => r.data),
  delete: (productId, variantId, metafieldId) =>
    api.delete(`/variants/${productId}/${variantId}/${metafieldId}`).then((r) => r.data),
  bulkSet: (body) => api.post('/variants/bulk/set', body).then((r) => r.data),
};

export const csv = {
  exportProducts: (body) =>
    api.post('/csv/export', body, { responseType: 'blob' }).then((r) => r.data),
  importPreview: (csvText) =>
    api.post('/csv/import/preview', csvText, { headers: { 'Content-Type': 'text/csv' } }).then((r) => r.data),
  importApply: (csvText) =>
    api.post('/csv/import/apply', csvText, { headers: { 'Content-Type': 'text/csv' } }).then((r) => r.data),
};

export default api;
