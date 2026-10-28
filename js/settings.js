// API key 管理與跨供應商模型清單。管理 key 的供應商，不決定實際使用的模型。
(function () {
  const T = window.Tarot;
  const PROVIDERS = ['openai', 'google'];
  const CUSTOM = '__custom__';
  const modelKey = (provider) => provider === 'google' ? 'googleModel' : 'model';
  const valueOf = (provider, model) => JSON.stringify([provider, model]);

  T.setupAiSettings = function ({ settings, icon, onSaved }) {
    const $ = (selector) => document.querySelector(selector);
    const dialog = $('#settingsDialog');
    let drafts = {};
    let editing = 'openai';
    let choice = null;
    let generation = 0;
    const customValues = {};

    function savedModel(provider) {
      return settings.ai[modelKey(provider)] || T.ai.providerInfo(provider).defaultModel;
    }

    function selectedChoice() {
      try {
        const [provider, model] = JSON.parse($('#sModel').value);
        return PROVIDERS.includes(provider) ? { provider, model } : null;
      } catch (err) { return null; }
    }

    function updateActiveLabel() {
      const provider = settings.ai.provider === 'google' ? 'google' : 'openai';
      const label = $('#activeAiModel');
      label.hidden = !T.store.getKey(provider);
      label.textContent = `目前使用：${T.ai.providerInfo(provider).name} · ${savedModel(provider)}`;
    }

    function renderKeyList() {
      const rows = PROVIDERS.map((provider) => {
        const draft = drafts[provider];
        const row = document.createElement('div');
        row.className = 'api-key-row' + (editing === provider && !$('#keyEditor').hidden ? ' is-editing' : '');
        const info = document.createElement('div');
        info.className = 'api-key-info';
        const name = document.createElement('span');
        name.className = 'api-key-name';
        name.textContent = T.ai.providerInfo(provider).name;
        const status = document.createElement('span');
        status.className = 'api-key-status';
        const changed = draft.key !== T.store.getKey(provider) || (draft.key && draft.remember !== T.store.keyRemembered(provider));
        status.textContent = draft.key ? `${draft.remember ? '記住此裝置' : '本次使用'}${changed ? '・待儲存' : '・已設定'}` : '未設定';
        info.append(name, status);
        const actions = document.createElement('div');
        actions.className = 'api-key-actions';
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'btn btn-ghost btn-small';
        edit.dataset.keyEdit = provider;
        edit.textContent = draft.key ? '編輯' : '新增 key';
        edit.setAttribute('aria-label', `${draft.key ? '編輯' : '新增'} ${name.textContent} key`);
        actions.append(edit);
        if (draft.key) {
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.className = 'btn btn-ghost btn-danger btn-small';
          remove.dataset.keyDelete = provider;
          remove.textContent = '刪除';
          remove.setAttribute('aria-label', `刪除 ${name.textContent} key`);
          actions.append(remove);
        }
        row.append(info, actions);
        return row;
      });
      $('#apiKeyList').replaceChildren(...rows);
    }

    function updateModelHint() {
      const selected = selectedChoice();
      const custom = selected && selected.model === CUSTOM;
      $('#customModelField').hidden = !custom;
      if (!selected) {
        $('#modelHint').textContent = '填入 key 後載入模型；選模型即可決定使用哪一家。';
        $('#modelPricing').hidden = true;
        return;
      }
      const provider = T.ai.providerInfo(selected.provider);
      const id = custom ? $('#sModelCustom').value.trim() : selected.model;
      const info = T.ai.budgetModelInfo(id, selected.provider);
      $('#customModelLabel').textContent = `${provider.name} 自訂模型 ID`;
      $('#modelHint').textContent = info
        ? `${provider.name} · 輸入 $${info.input.toFixed(2)}／輸出 $${info.output.toFixed(2)}${info.freeTier ? '・另有免費額度，依帳戶限制' : ''}`
        : T.ai.isDeprecatedModel(id, selected.provider) ? '已公告停用，請換模型。' : `${provider.name} · 請確認模型價格與支援功能。`;
      $('#pricingLink').href = provider.pricingUrl;
      $('#modelPricing').hidden = false;
    }

    function renderModelChoices() {
      const select = $('#sModel');
      select.replaceChildren(new Option('選擇供應商與模型', ''));
      select.options[0].disabled = true;
      const statuses = [];
      for (const provider of PROVIDERS) {
        const draft = drafts[provider];
        if (!draft || !draft.key) continue;
        const info = T.ai.providerInfo(provider);
        const group = document.createElement('optgroup');
        group.label = info.name;
        const models = [...draft.models].sort((a, b) => {
          const budget = Number(!!T.ai.budgetModelInfo(b, provider)) - Number(!!T.ai.budgetModelInfo(a, provider));
          return budget || a.localeCompare(b);
        });
        for (const id of models) {
          const budget = T.ai.budgetModelInfo(id, provider);
          group.append(new Option(`${info.name} · ${id}${budget ? '（省錢）' : /preview|exp/.test(id) ? '（預覽）' : ''}`, valueOf(provider, id)));
        }
        // 先前明確儲存的自訂 ID 仍可使用，但不冒充 API 已回傳的模型。
        if (draft.state === 'ready' && draft.model && !models.includes(draft.model) && !T.ai.isDeprecatedModel(draft.model, provider)) {
          group.append(new Option(`${info.name} · ${draft.model}（自訂）`, valueOf(provider, draft.model)));
        }
        group.append(new Option(`${info.name} · 自訂模型…`, valueOf(provider, CUSTOM)));
        select.append(group);
        statuses.push(`${info.name}：${draft.state === 'loading' ? '載入中…' : draft.state === 'ready' ? models.length + ' 個模型' : draft.state === 'error' ? draft.error : '請更新模型'}`);
      }
      select.disabled = !PROVIDERS.some((provider) => drafts[provider] && drafts[provider].key);
      if (select.disabled) select.options[0].textContent = '請先填入 API key';
      const wanted = choice && valueOf(choice.provider, choice.model);
      select.value = wanted && Array.from(select.options).some((option) => option.value === wanted) ? wanted : '';
      $('#modelListStatus').textContent = statuses.join('；');
      $('#testKey').disabled = PROVIDERS.some((provider) => drafts[provider] && drafts[provider].state === 'loading');
      updateModelHint();
      renderKeyList();
    }

    function captureKey() {
      if (!drafts[editing]) return;
      drafts[editing].key = $('#sKey').value.trim();
      drafts[editing].remember = $('input[name="keyRemember"]:checked').value === 'local';
    }

    function setKeyVisible(visible) {
      const label = visible ? '隱藏 API key' : '顯示 API key';
      $('#sKey').type = visible ? 'text' : 'password';
      $('#toggleKey').innerHTML = icon(visible ? 'eye-off' : 'eye');
      $('#toggleKey').setAttribute('aria-pressed', String(visible));
      $('#toggleKey').setAttribute('aria-label', label);
      $('#toggleKey').title = label;
    }

    function loadKey(provider) {
      editing = provider;
      const info = T.ai.providerInfo(provider);
      const draft = drafts[provider];
      $('#sProvider').value = provider;
      $('#keyLabel').textContent = info.keyLabel;
      $('#sKey').placeholder = info.placeholder;
      $('#sKey').value = draft.key;
      setKeyVisible(false);
      $(`input[name="keyRemember"][value="${draft.remember ? 'local' : 'session'}"]`).checked = true;
      $('#providerHint').textContent = provider === 'google' ? '使用 Google AI Studio 的 key，額度與費用依 Google 帳戶為準。' : 'API 費用另計，不包含在 ChatGPT 訂閱內。';
      $('#keyStatus').textContent = draft.key ? `${info.name} key 已填入` : `尚未填入 ${info.name} key`;
      renderKeyList();
    }

    async function fetchModels(provider) {
      const draft = drafts[provider];
      if (!draft.key || draft.state === 'loading') return;
      const key = draft.key;
      const request = ++draft.request;
      const currentGeneration = generation;
      draft.state = 'loading';
      draft.error = '';
      renderModelChoices();
      try {
        const models = await T.ai.listModels(key, provider);
        if (generation !== currentGeneration || draft.request !== request || draft.key !== key) return;
        draft.models = models;
        draft.state = 'ready';
      } catch (err) {
        if (generation !== currentGeneration || draft.request !== request || draft.key !== key) return;
        draft.models = [];
        draft.state = 'error';
        draft.error = err.message;
      }
      if (generation === currentGeneration && draft.request === request) renderModelChoices();
    }

    $('#openSettings').addEventListener('click', () => {
      generation++;
      for (const key of Object.keys(customValues)) delete customValues[key];
      drafts = Object.fromEntries(PROVIDERS.map((provider) => [provider, {
        key: T.store.getKey(provider), remember: T.store.keyRemembered(provider),
        model: settings.ai[modelKey(provider)] || '', models: [], state: 'idle', error: '', request: 0,
      }]));
      const provider = settings.ai.provider === 'google' ? 'google' : 'openai';
      choice = { provider, model: savedModel(provider) };
      $('#keyEditor').hidden = true;
      loadKey(provider);
      $('#sModelCustom').value = '';
      renderModelChoices();
      dialog.showModal();
      // 每一家各自載入與顯示錯誤；其中一家失敗不清掉其他家的模型。
      Promise.allSettled(PROVIDERS.filter((id) => drafts[id].key).map(fetchModels));
    });
    dialog.addEventListener('close', () => { generation++; });

    $('#apiKeyList').addEventListener('click', (event) => {
      const edit = event.target.closest('[data-key-edit]');
      const remove = event.target.closest('[data-key-delete]');
      if (edit) {
        captureKey();
        $('#keyEditor').hidden = false;
        loadKey(edit.dataset.keyEdit);
        $('#sKey').focus();
      } else if (remove) {
        captureKey();
        deleteKey(remove.dataset.keyDelete);
      }
    });
    $('#closeKeyEditor').addEventListener('click', () => {
      captureKey();
      $('#keyEditor').hidden = true;
      renderKeyList();
    });
    document.querySelectorAll('input[name="keyRemember"]').forEach((radio) => radio.addEventListener('change', () => { captureKey(); renderKeyList(); }));
    $('#toggleKey').addEventListener('click', () => setKeyVisible($('#sKey').type === 'password'));
    $('#sKey').addEventListener('input', () => {
      captureKey();
      const draft = drafts[editing];
      draft.request++;
      draft.models = [];
      draft.state = 'idle';
      draft.error = '';
      renderModelChoices();
      $('#keyStatus').textContent = 'Key 已變更，離開欄位後會載入模型。';
    });
    $('#sKey').addEventListener('change', () => { captureKey(); if (drafts[editing].state === 'idle') fetchModels(editing); });
    $('#testKey').addEventListener('click', () => {
      captureKey();
      if (!PROVIDERS.some((provider) => drafts[provider].key)) {
        $('#keyStatus').textContent = '請先填入至少一家的 key。';
        return;
      }
      Promise.allSettled(PROVIDERS.filter((provider) => drafts[provider].key).map(fetchModels));
    });

    $('#sModel').addEventListener('change', () => {
      choice = selectedChoice();
      if (choice && choice.model === CUSTOM) {
        $('#sModelCustom').value = customValues[choice.provider] || '';
        $('#customModelField').hidden = false;
        $('#sModelCustom').focus();
      }
      updateModelHint();
    });
    $('#sModelCustom').addEventListener('input', () => {
      const selected = selectedChoice();
      if (selected) customValues[selected.provider] = $('#sModelCustom').value;
      updateModelHint();
    });

    function deleteKey(provider) {
      T.store.clearKey(provider);
      Object.assign(drafts[provider], { key: '', models: [], state: 'idle', error: '' });
      drafts[provider].request++;
      if (editing === provider) {
        $('#sKey').value = '';
        $('#keyEditor').hidden = true;
      }
      renderModelChoices();
      updateActiveLabel();
      $('#keyStatus').textContent = `已刪除 ${T.ai.providerInfo(provider).name} key`;
      $(`[data-key-edit="${provider}"]`).focus();
    }

    $('#settingsForm').addEventListener('submit', (event) => {
      if (event.submitter && event.submitter.classList.contains('dialog-close')) return;
      event.preventDefault();
      $('#saveSettings').click();
    });
    $('#saveSettings').addEventListener('click', () => {
      captureKey();
      const selected = selectedChoice();
      const hasKey = PROVIDERS.some((provider) => drafts[provider].key);
      if (hasKey && !selected) {
        $('#keyStatus').textContent = '請從上方清單選擇要使用的模型。';
        $('#sModel').focus();
        return;
      }
      const model = selected && (selected.model === CUSTOM ? $('#sModelCustom').value.trim() : selected.model);
      if (selected && (!model || T.ai.isDeprecatedModel(model, selected.provider))) {
        $('#keyStatus').textContent = '請填入有效、未公告停用的模型 ID。';
        return;
      }
      for (const provider of PROVIDERS) {
        const draft = drafts[provider];
        if (draft.key) T.store.setKey(draft.key, draft.remember, provider);
        else T.store.clearKey(provider);
      }
      if (selected) {
        settings.ai.provider = selected.provider;
        settings.ai[modelKey(selected.provider)] = model === T.ai.providerInfo(selected.provider).defaultModel ? '' : model;
      }
      T.store.saveSettings({ ai: settings.ai });
      updateActiveLabel();
      dialog.close();
      onSaved();
    });
    updateActiveLabel();
  };
})();
