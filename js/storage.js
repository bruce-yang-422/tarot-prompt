// 占卜紀錄、設定、草稿與 API key 的儲存。
// 所有讀寫都包 try/catch；瀏覽器不能存資料時改用記憶體，網站照常運作（重新整理後消失）。
(function () {
  const T = (window.Tarot = window.Tarot || {});
  const P = 'wenpai.';
  const MAX_RECORDS = 200;
  const memory = {};

  function probe(storage) {
    try {
      const k = P + 'probe';
      storage.setItem(k, '1');
      storage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }

  let local = null;
  let session = null;
  try { local = window.localStorage; } catch (e) { /* 存取被封鎖 */ }
  try { session = window.sessionStorage; } catch (e) { /* 存取被封鎖 */ }
  const localOk = !!local && probe(local);
  const sessionOk = !!session && probe(session);

  function read(key, fallback, storage = local, ok = localOk) {
    try {
      const raw = ok ? storage.getItem(P + key) : memory[key];
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value, storage = local, ok = localOk) {
    const raw = JSON.stringify(value);
    try {
      if (ok) storage.setItem(P + key, raw);
      else memory[key] = raw;
    } catch (e) {
      memory[key] = raw;
    }
  }

  function remove(key, storage = local, ok = localOk) {
    try {
      if (ok) storage.removeItem(P + key);
    } catch (e) { /* 忽略 */ }
    delete memory[key];
  }

  const DEFAULT_SETTINGS = { tone: 'gentle', length: 'standard', uprightOnly: false, ai: { provider: 'openai', model: '', googleModel: '', claudeModel: '' } };
  const keyName = (provider) => provider === 'claude' ? 'apiKey.claude' : provider === 'google' ? 'apiKey.google' : 'apiKey';

  T.store = {
    available: localOk,

    listRecords() {
      return read('records', []);
    },
    getRecord(id) {
      return this.listRecords().find((r) => r.id === id) || null;
    },
    saveRecord(record) {
      const list = this.listRecords().filter((r) => r.id !== record.id);
      list.unshift(record);
      write('records', list.slice(0, MAX_RECORDS));
    },
    deleteRecord(id) {
      write('records', this.listRecords().filter((r) => r.id !== id));
    },
    clearRecords() {
      write('records', []);
    },

    getSettings() {
      const s = read('settings', {});
      return Object.assign({}, DEFAULT_SETTINGS, s, { ai: Object.assign({}, DEFAULT_SETTINGS.ai, s.ai) });
    },
    saveSettings(patch) {
      write('settings', Object.assign(this.getSettings(), patch));
    },

    getDraft() {
      return read('draft', null);
    },
    saveDraft(draft) {
      write('draft', draft);
    },
    clearDraft() {
      remove('draft');
    },

    // API key 不寫進紀錄或草稿；「只用這一次」存在 sessionStorage，關閉分頁就清除
    getKey(provider = 'openai') {
      return read(keyName(provider), '', session, sessionOk) || read(keyName(provider), '');
    },
    keyRemembered(provider = 'openai') {
      return !!read(keyName(provider), '');
    },
    setKey(key, remember, provider = 'openai') {
      this.clearKey(provider);
      if (remember) write(keyName(provider), key);
      else write(keyName(provider), key, session, sessionOk);
    },
    clearKey(provider = 'openai') {
      remove(keyName(provider));
      remove(keyName(provider), session, sessionOk);
    },
  };
})();
