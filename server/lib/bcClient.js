const axios = require('axios');

const bc = axios.create({
  baseURL: `https://api.bigcommerce.com/stores/${process.env.BC_STORE_HASH}`,
  headers: {
    'X-Auth-Token': process.env.BC_ACCESS_TOKEN,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

bc.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 429) {
      const retryAfter = parseInt(err.response.headers['x-retry-after'] || '2', 10);
      await sleep(retryAfter * 1000);
      return bc.request(err.config);
    }
    return Promise.reject(err);
  }
);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Process an array of async tasks in batches with a delay between batches.
 * Keeps us well under BC's ~150 req/min limit.
 */
async function batchProcess(items, asyncFn, { batchSize = 10, delayMs = 500, onProgress } = {}) {
  const results = [];
  const errors = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map(asyncFn));

    settled.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        errors.push({ item: batch[idx], error: result.reason?.message || 'Unknown error' });
      }
    });

    if (onProgress) onProgress(Math.min(i + batchSize, items.length), items.length);
    if (i + batchSize < items.length) await sleep(delayMs);
  }

  return { results, errors };
}

module.exports = { bc, batchProcess, sleep };
