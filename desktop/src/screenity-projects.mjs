// SPDX-License-Identifier: GPL-3.0-only
// Original suite extension to Screenity. No remote storage or network access.
export const persistentKeys = ['blob','webm','originalBlob','rawBlob','backupBlob','start','end','duration','width','height','prevWidth','prevHeight','top','left','volume','cropPreset','replaceAudio','title','hasBeenEdited','mp4ready','recordingMeta','lastRecordingBackend','undoDisabled','redoDisabled'];
const busyKeys = ['isFfmpegRunning','reencoding','trimming','cutting','muting','cropping','downloading','downloadingWEBM','downloadingGIF','finalizingRecording'];
export function portableState(state, history = true) {
  const result = {};
  for (const key of persistentKeys) {
    const value = state[key];
    if (value !== undefined) result[key] = structuredClone(value);
  }
  if (history) for (const key of ['history','redoHistory']) result[key] = (state[key] || []).slice(-20).map(item => portableState(item, false));
  return result;
}
export function restoredState(previous, saved) {
  if (!saved?.blob || !Number.isFinite(saved.width) || !Number.isFinite(saved.height)) throw Error('Projeto local incompleto. A gravação original foi preservada.');
  return {...previous, ...portableState(saved), ready: true, mode: 'player', frame: null, fromCropper: false, fromAudio: false, hasTempChanges: false, pendingCropEntry: false, processingProgress: 0, editErrorType: null, ...Object.fromEntries(busyKeys.map(key => [key, false]))};
}
export async function recordingKey({search = '', metadata, digest}) {
  const requested = new URLSearchParams(search).get('paProject');
  if (requested) {
    if (!/^[a-f0-9]{64}$/.test(requested)) throw Error('Identificador de projeto inválido.');
    return requested;
  }
  const recording = new URLSearchParams(search).get('recordingId') || metadata.lastRecordingBackendRef?.recordingId || metadata.lastRecordingBackendRef?.fileName || metadata.recordingMeta?.startedAt;
  if (!recording) throw Error('A gravação precisa de uma identidade própria antes de salvar um projeto.');
  return digest(JSON.stringify({version: 1, recording, backend: metadata.lastRecordingBackendRef?.backend || 'idb'}));
}
export function projectDatabase(indexedDB) {
  let pending;
  const open = () => pending ||= new Promise((resolve, reject) => {
    const request = indexedDB.open('plataforma-screenity-projects', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('projects', {keyPath: 'id'});
    request.onerror = () => { pending = null; reject(request.error); };
    request.onblocked = () => { pending = null; reject(Error('Feche outros editores para atualizar o banco de projetos.')); };
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); pending = null; }; resolve(request.result); };
  });
  async function transaction(mode, execute) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('projects', mode, mode === 'readwrite' ? {durability: 'strict'} : undefined);
      let result, failure;
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () => reject(failure || tx.error || Error('Não foi possível confirmar o projeto no disco.'));
      execute(tx.objectStore('projects'), value => { result = value; }, error => { failure = error; tx.abort(); });
    });
  }
  return {
    get: id => transaction('readonly', (store, done) => { store.get(id).onsuccess = event => done(event.target.result); }),
    list: () => transaction('readonly', (store, done) => { store.getAll().onsuccess = event => done(event.target.result.map(({id,title,updatedAt,revision}) => ({id,title,updatedAt,revision})).sort((a,b) => b.updatedAt-a.updatedAt)); }),
    put: (record, expectedRevision) => transaction('readwrite', (store, done, fail) => {
      store.get(record.id).onsuccess = event => {
        if ((event.target.result?.revision || 0) !== expectedRevision) return fail(Error('Este projeto foi alterado em outra janela. Reabra-o antes de editar.'));
        store.put(record); done(record);
      };
    }),
    remove: id => transaction('readwrite', store => { store.delete(id); })
  };
}
export function draftController({store, identify, notify = () => {}, schedule = callback => setTimeout(callback, 300), cancel = clearTimeout, clock = Date.now}) {
  let key, loaded = false, revision = 0, lastFingerprint, latest, version = 0, committed = 0, timer, running, error;
  const status = () => ({pending: version > committed, revision, error: error?.message || null, id: key});
  function publish() { notify(status()); }
  async function flush() {
    if (timer) { cancel(timer); timer = null; }
    if (!loaded) return;
    if (running) { await running; return flush(); }
    running = (async () => {
      while (latest && committed < version) {
        const generation = version, state = portableState(latest);
        const record = {version: 1, id: key, revision: revision + 1, title: typeof state.title === 'string' ? state.title.slice(0, 200) : 'Gravação sem título', updatedAt: clock(), state};
        await store.put(record, revision);
        revision = record.revision; committed = generation; error = null; publish();
      }
    })();
    try { await running; } catch (failure) { error = failure; publish(); throw failure; } finally { running = null; }
  }
  return {
    status, flush,
    async restore(setState) {
      try {
      key = await identify(); const record = await store.get(key);
      if (record && (record.version !== 1 || record.id !== key || !Number.isSafeInteger(record.revision) || record.revision < 1)) throw Error('Formato de projeto local inválido.');
      revision = record?.revision || 0; loaded = true;
      if (record) setState(previous => restoredState(previous, record.state));
      publish(); return Boolean(record);
      } catch (failure) { error = failure; publish(); throw failure; }
    },
    observe(state) {
      if (!loaded || !state?.blob || !state.ready || busyKeys.some(key => state[key])) return;
      const fingerprint = [...persistentKeys, 'history', 'redoHistory'].map(key => state[key]);
      if (lastFingerprint && fingerprint.every((item, index) => Object.is(item, lastFingerprint[index]))) return;
      lastFingerprint = fingerprint; latest = state; version++; error = null; publish();
      if (timer) cancel(timer);
      timer = schedule(() => { timer = null; flush().catch(() => {}); });
    }
  };
}
export function installProjects(window) {
  const {document, chrome, crypto, indexedDB} = window, store = projectDatabase(indexedDB);
  let label, saveButton;
  const controller = draftController({store, identify: async () => recordingKey({search: window.location.search, metadata: await chrome.storage.local.get(['lastRecordingBackendRef','recordingMeta']), digest: async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(byte => byte.toString(16).padStart(2, '0')).join('')}), notify: status => {
    if (label) { label.textContent = status.error || (status.pending ? 'Alterações ainda não salvas' : status.revision > 0 ? 'Projeto salvo neste computador' : 'Projeto ainda não salvo'); label.style.color = status.error ? '#b42318' : '#344054'; }
    if (saveButton) saveButton.disabled = !status.id;
  }});
  window.addEventListener('beforeunload', event => { if (controller.status().pending) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('pagehide', () => controller.flush().catch(() => {}));
  document.addEventListener('DOMContentLoaded', () => {
    const panel = document.createElement('aside'); panel.setAttribute('aria-label','Projetos locais da suíte'); panel.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:2147483646;padding:10px;background:#fff;border:1px solid #d0d5dd;border-radius:8px;box-shadow:0 2px 8px #0002;font:12px system-ui;max-width:360px';
    label = document.createElement('div'); label.setAttribute('role','status'); label.textContent = 'Projeto não carregado'; panel.append(label);
    const button = (text, callback) => { const element = document.createElement('button'); element.textContent = text; element.style.cssText = 'margin:6px 6px 0 0;padding:5px 8px;cursor:pointer'; element.onclick = callback; panel.append(element); return element; };
    saveButton = button('Salvar projeto', () => controller.flush().catch(failure => { label.textContent = failure.message; })); saveButton.disabled = !controller.status().id;
    button('Projetos', async () => {
      try {
        const dialog = document.createElement('dialog'), heading = document.createElement('h2'); heading.textContent = 'Projetos neste computador'; dialog.append(heading);
        for (const project of await store.list()) {
          const row = document.createElement('p'), link = document.createElement('a'); link.textContent = project.title + ' · ' + new Date(project.updatedAt).toLocaleString(); link.href = chrome.runtime.getURL('editor.html') + '?paProject=' + encodeURIComponent(project.id); link.target = '_blank'; link.rel = 'noopener'; row.append(link); dialog.append(row);
        }
        const close = document.createElement('button'); close.textContent = 'Fechar'; close.onclick = () => { dialog.close(); dialog.remove(); }; dialog.append(close); document.body.append(dialog); dialog.showModal();
      } catch (failure) { label.textContent = failure.message; }
    });
    document.body.append(panel);
  });
  window.paScreenityDrafts = controller;
}
