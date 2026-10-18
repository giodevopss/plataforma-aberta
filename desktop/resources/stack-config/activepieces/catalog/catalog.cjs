// Bootstrap the unmodified official Community piece sync with a verified local
// catalog. Preserve every original version and prioritize the local trigger.
// This module is mounted only in the API container, never the workflow worker.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function createCatalogFetch({ directory, fetcher }) {
  const provenance = JSON.parse(fs.readFileSync(path.join(directory, 'catalog-provenance.json')));
  if (provenance.release !== '0.92.2' || provenance.edition !== 'ce' || provenance.files.length !== 2) throw Error('Invalid original catalog provenance');
  const files = new Map();
  for (const name of ['registry-0.92.2.json', 'manual-trigger-0.0.8.json']) {
    const record = provenance.files.find(record => record.source === name);
    const file = path.join(directory, name), stat = fs.lstatSync(file);
    if (!record || !stat.isFile() || stat.isSymbolicLink() || stat.size !== record.bytes || stat.size > 2_000_000) throw Error('Invalid original catalog payload');
    const bytes = fs.readFileSync(file);
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== record.sha256) throw Error('Original catalog checksum differs');
    files.set(name, bytes);
  }
  const registry = JSON.parse(files.get('registry-0.92.2.json'));
  const manual = JSON.parse(files.get('manual-trigger-0.0.8.json'));
  if (!Array.isArray(registry) || registry.some(piece => typeof piece.name !== 'string' || typeof piece.version !== 'string') || manual.name !== '@activepieces/piece-manual-trigger' || manual.version !== '0.0.8' || !registry.some(piece => piece.name === manual.name && piece.version === manual.version)) throw Error('Invalid original manual trigger catalog entry');
  const prioritized = Buffer.from(JSON.stringify(registry.sort((a, b) => Number(b.name === manual.name) - Number(a.name === manual.name))));
  return function catalogFetch(input, options) {
    let address;
    try { address = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url); } catch { return fetcher(input, options); }
    const method = String(options?.method || input?.method || 'GET').toUpperCase();
    if (method === 'GET' && address.origin === 'https://cloud.activepieces.com' && !address.username && !address.password) {
      let bytes;
      if (address.pathname === '/api/v1/pieces/registry' && address.searchParams.get('release') === '0.92.2' && address.searchParams.get('edition') === 'ce') bytes = prioritized;
      if (address.pathname === '/api/v1/pieces/@activepieces/piece-manual-trigger' && address.searchParams.get('version') === '0.0.8') bytes = files.get('manual-trigger-0.0.8.json');
      if (bytes) return Promise.resolve(new Response(bytes, { headers: { 'Content-Type': 'application/json', 'X-Plataforma-Catalog-Snapshot': '0.92.2' } }));
    }
    return fetcher(input, options);
  };
}

module.exports = { createCatalogFetch };
if (process.env.PA_OFFICIAL_CATALOG_PRELOAD === '1') {
  globalThis.fetch = createCatalogFetch({ directory: __dirname, fetcher: globalThis.fetch.bind(globalThis) });
}
