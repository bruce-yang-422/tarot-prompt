// AI 問題整理：由瀏覽器直接呼叫 OpenAI、Google Gemini 或 Claude；沒有 key 時改用複製貼上。
(function () {
  const T = (window.Tarot = window.Tarot || {});
  const API = 'https://api.openai.com/v1';
  const GOOGLE_API = 'https://generativelanguage.googleapis.com/v1beta';
  const CLAUDE_API = 'https://api.anthropic.com/v1';
  const PROVIDERS = {
    openai: { name: 'OpenAI', modelKey: 'model', defaultModel: 'gpt-6-luna', keyLabel: 'OpenAI API key', placeholder: 'sk-...', pricingUrl: 'https://developers.openai.com/api/docs/pricing', keyUrl: 'https://platform.openai.com/api-keys', hint: 'API 費用另計，不包含在 ChatGPT 訂閱內。' },
    google: { name: 'Google', modelKey: 'googleModel', defaultModel: 'gemini-3.5-flash-lite', keyLabel: 'Google AI Studio API key', placeholder: 'AIza...', pricingUrl: 'https://ai.google.dev/gemini-api/docs/pricing', keyUrl: 'https://aistudio.google.com/apikey', hint: '使用 Google AI Studio 的 key，額度與費用依 Google 帳戶為準。' },
    claude: { name: 'Claude', modelKey: 'claudeModel', defaultModel: 'claude-haiku-5-5', keyLabel: 'Claude API key', placeholder: 'sk-ant-...', pricingUrl: 'https://platform.claude.com/docs/en/about-claude/pricing', keyUrl: 'https://platform.claude.com/settings/keys', hint: '使用 Claude Console 的 key，API 費用與額度依帳戶為準。' },
  };
  const providerInfo = (provider) => PROVIDERS[provider] || PROVIDERS.openai;
  // 會先「思考」的模型（如 gpt-6-luna）實測約 5～10 秒，留餘裕
  const TIMEOUT_MS = 30000;
  // /models 沒有端點相容性資訊：依名稱挑出文字模型候選，不以版本、日期或 nano 排除。
  // 排除明確的專用模型；清單成功不代表已測試 Chat Completions 與 JSON mode。
  const NOT_CHAT = /(?:^|-)(?:codex|pro|search|tts|transcribe|audio|realtime|image|instruct|embedding|moderation|deep-research)(?:-|$)/;
  // 已公告停用／已關閉的文字模型家族，查核官方 models/all 與 deprecations（2026-10-28）。
  const DEPRECATED_MODELS = ['gpt-3.5-turbo', 'gpt-4', 'gpt-4.1', 'gpt-4.5', 'gpt-4o', 'chatgpt-4o', 'gpt-5', 'gpt-5.1', 'gpt-5.2-chat', 'gpt-5.3-chat', 'gpt-5.4-nano', 'o1', 'o3', 'o4-mini'];
  const CLAUDE_DEPRECATED_MODELS = ['claude-1.0', 'claude-1.1', 'claude-1.2', 'claude-1.3', 'claude-instant', 'claude-2', 'claude-2.0', 'claude-2.1', 'claude-3', 'claude-sonnet-4-5', 'claude-sonnet-4-20250514', 'claude-sonnet-4-0', 'claude-opus-4-1', 'claude-opus-4-20250514', 'claude-opus-4-0', 'claude-mythos-preview'];
  const claudeDeprecatedIds = new Set();

  function isDeprecatedModel(id, provider = 'openai') {
    const base = id.replace(/^models\//, '').replace(/^ft:/, '').split(':')[0];
    if (provider === 'claude' && claudeDeprecatedIds.has(base)) return true;
    const models = provider === 'claude' ? CLAUDE_DEPRECATED_MODELS : provider === 'google' ? ['gemini-1.0', 'gemini-1.5', 'gemini-2.0', 'gemini-3.1-flash-lite', 'gemini-3-pro-preview', 'gemini-2.5-pro-preview', 'gemini-2.5-flash-preview', 'gemini-2.5-computer-use-preview'] : DEPRECATED_MODELS;
    return models.some((model) => base === model || base.startsWith(model + '-'));
  }
  // 官方 Standard 短上下文費率（USD / 百萬 tokens），查核日期 2026-10-28。
  // https://developers.openai.com/api/docs/models/{id}；停用日期見 /api/docs/deprecations。
  const BUDGET_MODELS = [
    { id: 'gpt-6-luna', label: '極省・首選', input: 0.10, output: 0.50 },
    { id: 'gpt-5.6-luna', label: '平價・備選', input: 0.20, output: 1.20 },
  ];
  // https://ai.google.dev/gemini-api/docs/pricing（2026-10-28），付費 Standard 費率。
  const GOOGLE_BUDGET_MODELS = [
    { id: 'gemini-3.5-flash-lite', label: '省錢・首選', input: 0.30, output: 2.50, freeTier: true },
  ];
  // 官方 Standard 費率，短上下文（≤100K tokens），查核日期 2026-10-28。
  const CLAUDE_BUDGET_MODELS = [
    { id: 'claude-haiku-5-5', label: '省錢・首選', input: 0.10, output: 0.50 },
  ];
  const budgetFor = (provider) => provider === 'claude' ? CLAUDE_BUDGET_MODELS : provider === 'google' ? GOOGLE_BUDGET_MODELS : BUDGET_MODELS;

  function budgetModelInfo(id, provider = 'openai') {
    return budgetFor(provider).find((m) => id === m.id || (id.startsWith(m.id + '-') && /^(?:\d{4}-\d{2}-\d{2}|\d{8})$/.test(id.slice(m.id.length + 1))));
  }

  function budgetModels(models, provider = 'openai') {
    const budget = budgetFor(provider);
    return budget.map((m) => models.includes(m.id) ? m.id : models.filter((id) => budgetModelInfo(id, provider) === m).sort().pop())
      .filter(Boolean);
  }

  const PRINCIPLES = [
    '1. 以我自己為主角，不替別人問',
    '2. 根據真實正在發生的狀況，不問假設性的事',
    '3. 以三個月內的短期發展為主',
    '4. 是我真心想知道的事',
    '5. 用肯定句發問，例如「我要如何……」，而不是「能不能……」',
  ];

  function spreadList() {
    return T.SPREADS.map((s) => `${s.id}：${s.name}（${s.description}）`).join('\n');
  }

  const compact = (text) => String(text || '').replace(/[\s，。！？、：；,.!?;:'"「」『』（）()_-]/g, '').toLowerCase();
  const PLACEHOLDER = /^(?:(?:這是|這只是|只是|我要|我想|我在)?(?:測試|测试)(?:一下|看看|功能|問題|问题|用)?|test(?:ing)?(?:question|prompt)?|問題|问题|我?不知道(?:怎麼問|要問什麼)?|隨便問問|随便问问|你好|hello|嗨|範例|示例|未填|不提供|xxx|abc)$/;
  const playfulQuestion = (text) => {
    if (/^(?:你|妳)(?:愛|爱|喜歡|喜欢)我(?:嗎|吗|不|嘛)?$/.test(text)) return '先別把我拉進感情牌陣 😄 你想了解的是哪段真實關係？';
    if (/(?:啥時|啥时候|何時|何时|什麼時候|什么时候|幾歲|几岁).*(?:發財|发财|中樂透|中乐透|中彩券|中大獎|中大奖)/.test(text)) return '水晶球還沒串接銀行 😄 你現在想改善收入、存款，還是工作機會？';
    if (/(?:滾床單|滚床单|上床|發生性關係|发生性关系|跟我睡)/.test(text) && /(?:他|她|對方|对方|同事)/.test(text)) return '塔羅不能替對方答應這件事 😄 你們目前有哪些實際互動？';
    if (/(?:狗|貓|猫)/.test(text) && /(?:飛在天上|飞在天上|天上飛|天上飞|會飛|会飞)/.test(text)) return '先讓毛孩降落一下 😄 你指的是跳很高、夢裡的情節，還是某件真實發生的事？';
    return '';
  };

  // 只攔截明顯測試／缺少情境的輸入，不用字數判斷，以免誤擋「失眠」「失戀」等真實困擾。
  function clarify(form) {
    const useful = (value) => {
      const text = compact(value);
      return text && !PLACEHOLDER.test(text) && !/^(?:\d+|[x哈呵]+)$/.test(text) && !playfulQuestion(text);
    };
    const background = String(form.background || '').split(/\r?\n/).map((line) => line.replace(/^補充[（(].*?[）)][:：]\s*/, '').replace(/^原本的描述[:：]\s*/, ''));
    const answers = T.bgAnswersFor ? T.bgAnswersFor(form) : {};
    const details = T.bgQuestionsFor ? T.bgQuestionsFor(form.category, form)
      .filter((q) => q.type === 'text' && (!T.bgVisible || T.bgVisible(q, answers)))
      .map((q) => answers[q.id]) : [];
    if (background.concat(details).some(useful)) return null;
    const question = compact(form.question);
    const playful = playfulQuestion(question);
    if (!playful && useful(form.question)) return null;
    return {
      followUp: playful || (question ? '先別鬧 😄 想試功能也可以，先說一件最近發生、你想釐清的事吧？' : '最近發生了什麼事，或有哪個困擾想釐清？'),
      questions: [], category: '', timeframe: '', spreads: [],
    };
  }

  // format: 'json' 給 API 用；'list' 給使用者複製到聊天介面用
  function buildPrompt(form, format) {
    const L = [
      '請協助我整理提問。先判斷下方資料是否提供真實事件、具體困擾或明確的探索主題，資訊足夠才改寫成以我自己為主角的開放式問題。',
      '資訊不足時，只補問一個最關鍵的問題；不要硬湊三題，也不要建議類別、時間範圍或牌陣。類別、時間範圍、性別、年齡與單純的心情選項，不等於具體情境。',
      '只依據我提供的事實，不把「測試問題」「你好」或無意義文字當成人生困擾，不自行推論我迷惘、焦慮、需要成長或缺乏主導權。',
      '遇到玩笑或試探，可以用一句輕鬆、不羞辱人的話接梗，再問真實情境；明顯測試可說「先別鬧 😄」。不要嘲笑認真的困擾或直接認定對方在惡搞。',
      '「啥時會發財」改問想改善的財務目標；問他人是否願意發生親密關係，先問實際互動，不替別人判定意願；「你愛我嗎」輕鬆帶回真實關係；不合理情節先釐清是玩笑、夢境、創作或實際事件，不當成事實。',
      '這些問題之後會用在塔羅自我探索活動；本次只需改寫問題，並依主題選擇牌陣名稱，不需要抽牌、解牌、預測未來或回答問題本身。',
      '如果情境涉及健康、心理、法律或財務，請聚焦於我的感受、需求與可採取的行動，不做診斷、治療建議或專業判斷。',
      ...(form.category ? ['', `【想問的方向】${form.category}（整理出的問題請聚焦在這個方向）`] : []),
      '',
      '【我的狀況】',
      (form.question || '').trim() || '（未填）',
    ];
    L.push(...T.contextLines(form));
    if ((form.background || '').trim()) L.push(form.background.trim());
    L.push('', '【好問題的原則】', ...PRINCIPLES, '');
    L.push('資訊足夠時，提供最多 3 個有實際差異的問題，每個附一句理由；只有一兩個合適角度就少給，不要用抽象套話湊數。');
    L.push(`只有資訊足夠時才建議：問題類別（${T.CATEGORIES.join('／')}）、時間範圍、適合的牌陣。`);
    if (format === 'json') {
      L.push('牌陣只能從以下清單選，填 id：', spreadList(), '');
      L.push('資訊不足或仍需釐清時，在 followUp 放一句輕鬆回應與一個補充問題；questions、spreads 留空陣列，category、timeframe 留空字串。followUp 與建議問題不可同時輸出。');
      L.push('只回傳 JSON，格式如下：');
      L.push('{"followUp":"","questions":[{"text":"建議問題","why":"為什麼這樣問比較好"}],"category":"類別","timeframe":"時間範圍","spreads":["牌陣 id"]}');
    } else {
      L.push('牌陣請依探索主題從以下清單選一個，不代表預測或專業評估：', spreadList(), '');
      L.push('資訊不足時，只輸出一行「釐清問題：輕鬆回應與一個補充問題」，不輸出其他欄位。');
      L.push('資訊足夠時，請把整份回答放在一個程式碼區塊（```text）裡，方便我直接複製。依下方格式輸出，每個標籤與內容放在同一行，不另加選擇理由或最推薦題目；問題不足三題時省略多餘的題目與理由行：');
      L.push('1. 建議問題：……', '理由：……', '2. 建議問題：……', '理由：……', '3. 建議問題：……', '理由：……', '建議類別：……', '建議時間範圍：……', '建議牌陣：……（填清單中的完整名稱，不填 id）');
    }
    L.push('請用繁體中文回答。');
    return L.join('\n');
  }

  class AiError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code; // invalid | quota | rejected | network | timeout | format | aborted
    }
  }

  const MESSAGES = {
    invalid: 'API key 無效，請到設定檢查。',
    quota: 'API 額度不足或請求太頻繁，請稍後再試。',
    rejected: 'AI 服務拒絕請求，請檢查額度、API key 權限與模型設定。',
    network: '連不上 AI 服務，請檢查網路連線。',
    timeout: 'AI 回應逾時，請稍後再試。',
    format: 'AI 的回覆格式無法解析。',
    aborted: '已取消。',
    blocked: 'AI 未提供內容，請調整問題後再試，或改用複製貼上。',
    incomplete: 'AI 回覆未完成，請稍後再試或改用其他模型。',
  };

  function withTimeout(signal) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort('timeout'), TIMEOUT_MS);
    const abort = () => ctrl.abort('user');
    if (signal) {
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort, { once: true });
    }
    return { signal: ctrl.signal, done: () => { clearTimeout(timer); if (signal) signal.removeEventListener('abort', abort); }, ctrl };
  }

  // GET /v1/models 的錯誤回應有 CORS 標頭，瀏覽器讀得到 401，用來判斷 key 是否有效
  async function listModels(key, provider = 'openai') {
    if (provider === 'google') return listGoogleModels(key);
    if (provider === 'claude') return listClaudeModels(key);
    let res;
    try {
      res = await fetch(API + '/models', { headers: { Authorization: 'Bearer ' + key } });
    } catch (e) {
      throw new AiError('network', MESSAGES.network);
    }
    if (res.status === 401) throw new AiError('invalid', MESSAGES.invalid);
    if (res.status === 429) throw new AiError('quota', MESSAGES.quota);
    if (!res.ok) throw new AiError('network', `OpenAI 回應錯誤（${res.status}）。`);
    const data = await res.json();
    return [...new Set((data.data || []).map((m) => m.id).filter((id) => typeof id === 'string' && /^(?:ft:)?(?:gpt-\d|chatgpt-\d|o\d)/.test(id) && !NOT_CHAT.test(id) && !isDeprecatedModel(id)))].sort();
  }

  async function requestJSON(base, name, headers, path, body, signal) {
    const t = withTimeout(signal);
    try {
      const res = await fetch(base + path, {
        method: body ? 'POST' : 'GET', signal: t.signal,
        headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (res.status === 401) throw new AiError('invalid', MESSAGES.invalid);
      if (res.status === 429) throw new AiError('quota', MESSAGES.quota);
      if (res.status === 403) throw new AiError('rejected', `${name} 拒絕存取，請檢查 key 權限與 API 限制。`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const invalidKey = data.error && (data.error.type === 'authentication_error' || (data.error.details || []).some((d) => d.reason === 'API_KEY_INVALID'));
        throw new AiError(invalidKey ? 'invalid' : 'rejected', invalidKey ? MESSAGES.invalid : `${name} 請求失敗（${res.status}），請檢查模型、key 與服務設定。`);
      }
      return await res.json();
    } catch (err) {
      if (err instanceof AiError) throw err;
      if (t.signal.aborted) throw new AiError(t.signal.reason === 'user' ? 'aborted' : 'timeout', MESSAGES[t.signal.reason === 'user' ? 'aborted' : 'timeout']);
      throw new AiError('network', MESSAGES.network);
    } finally { t.done(); }
  }

  const googleRequest = (path, key, body, signal) => requestJSON(GOOGLE_API, 'Google', { 'x-goog-api-key': key }, path, body, signal);
  // 與官方 TypeScript SDK 的瀏覽器模式使用相同標頭；key 僅送往 Anthropic。
  const claudeRequest = (path, key, body, signal) => requestJSON(CLAUDE_API, 'Claude', {
    'x-api-key': key,
    'anthropic-version': '2026-10-21',
    'anthropic-dangerous-direct-browser-access': 'true',
  }, path, body, signal);

  async function listClaudeModels(key) {
    const models = [];
    const seen = new Set();
    let cursor = '';
    do {
      const data = await claudeRequest('/models?limit=100' + (cursor ? '&after_id=' + encodeURIComponent(cursor) : ''), key);
      for (const model of data.data || []) {
        const id = model.id;
        if (typeof id !== 'string' || !id.startsWith('claude-')) continue;
        if (model.lifecycle === 'deprecated' || model.lifecycle === 'retired') claudeDeprecatedIds.add(id);
        if ((!model.lifecycle || model.lifecycle === 'active') && !isDeprecatedModel(id, 'claude')
          && !(model.capabilities && model.capabilities.structured_outputs && model.capabilities.structured_outputs.supported === false)) models.push(id);
      }
      if (!data.has_more) break;
      cursor = data.last_id;
      if (!cursor || seen.has(cursor)) throw new AiError('format', MESSAGES.format);
      seen.add(cursor);
    } while (cursor);
    return [...new Set(models)].sort();
  }

  const objectSchema = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
  const stringSchema = { type: 'string' };
  const SUGGEST_SCHEMA = objectSchema({
    followUp: stringSchema,
    questions: { type: 'array', items: objectSchema({ text: stringSchema, why: stringSchema }) },
    category: stringSchema, timeframe: stringSchema, spreads: { type: 'array', items: stringSchema },
  });
  const QUIZ_SCHEMA = objectSchema({ questions: { type: 'array', items: objectSchema({
    label: stringSchema, type: { type: 'string', enum: ['single', 'multi', 'text'] },
    options: { type: 'array', items: stringSchema }, placeholder: stringSchema,
  }) } });

  async function claudeJSON({ key, model, prompt, signal, schema }) {
    const data = await claudeRequest('/messages', key, {
      model: model || PROVIDERS.claude.defaultModel, max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
      output_config: { format: { type: 'json_schema', schema } },
    }, signal);
    if (data.stop_reason === 'max_tokens') throw new AiError('incomplete', MESSAGES.incomplete);
    if (data.stop_reason !== 'end_turn' || data.stop_details && data.stop_details.type === 'refusal') throw new AiError('blocked', MESSAGES.blocked);
    const text = (data.content || []).filter((part) => part.type === 'text' && typeof part.text === 'string').map((part) => part.text).join('');
    if (!text.trim()) throw new AiError('blocked', MESSAGES.blocked);
    return text;
  }

  async function listGoogleModels(key) {
    const models = [];
    const seen = new Set();
    let token = '';
    do {
      const data = await googleRequest('/models?pageSize=1000' + (token ? '&pageToken=' + encodeURIComponent(token) : ''), key);
      for (const model of data.models || []) {
        const id = String(model.name || '').replace(/^models\//, '');
        if ((model.supportedGenerationMethods || []).includes('generateContent') && /^gemini-/.test(id)
          && !/(?:^|-)(?:tts|audio|image|live|robotics|embedding)(?:-|$)/.test(id)
          && !isDeprecatedModel(id, 'google')) models.push(id);
      }
      token = data.nextPageToken || '';
      if (token && seen.has(token)) throw new AiError('format', MESSAGES.format);
      seen.add(token);
    } while (token);
    return [...new Set(models)].sort();
  }

  async function googleJSON({ key, model, prompt, signal, schema }) {
    const id = (model || PROVIDERS.google.defaultModel).replace(/^models\//, '');
    const data = await googleRequest('/models/' + encodeURIComponent(id) + ':generateContent', key, {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema },
    }, signal);
    const candidate = (data.candidates || [])[0];
    if (candidate && candidate.finishReason === 'MAX_TOKENS') throw new AiError('incomplete', MESSAGES.incomplete);
    if (data.promptFeedback && data.promptFeedback.blockReason || !candidate || (candidate.finishReason && candidate.finishReason !== 'STOP')) {
      throw new AiError('blocked', MESSAGES.blocked);
    }
    const text = ((candidate.content && candidate.content.parts) || []).filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('');
    if (!text.trim()) throw new AiError('blocked', MESSAGES.blocked);
    return text;
  }

  // 呼叫 OpenAI，要求回傳 JSON，回傳 JSON 文字內容
  async function chatJSON({ key, model, prompt, signal, schema, provider = 'openai' }) {
    if (provider === 'google') return googleJSON({ key, model, prompt, signal, schema });
    if (provider === 'claude') return claudeJSON({ key, model, prompt, signal, schema });
    const t = withTimeout(signal);
    let res;
    try {
      res = await fetch(API + '/chat/completions', {
        method: 'POST',
        signal: t.signal,
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || T.ai.DEFAULT_MODEL,
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: prompt }],
        }),
      });
    } catch (e) {
      t.done();
      if (t.ctrl.signal.aborted) {
        const reason = t.ctrl.signal.reason;
        throw new AiError(reason === 'user' ? 'aborted' : 'timeout', MESSAGES[reason === 'user' ? 'aborted' : 'timeout']);
      }
      // 這個端點的錯誤回應沒有 CORS 標頭，瀏覽器只會回報連線失敗；改用 /models 判斷原因
      await listModels(key);
      throw new AiError('rejected', MESSAGES.rejected);
    }
    t.done();
    if (res.status === 401) throw new AiError('invalid', MESSAGES.invalid);
    if (res.status === 429) throw new AiError('quota', MESSAGES.quota);
    if (!res.ok) throw new AiError('network', `OpenAI 回應錯誤（${res.status}）。`);
    const data = await res.json();
    return data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  }

  function parseJSON(content) {
    try {
      let text = String(content || '').replace(/^\uFEFF/, '').trim();
      const fenced = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
      if (fenced) text = fenced[1].trim();
      let obj;
      try { obj = JSON.parse(text); }
      catch (err) {
        // 可容忍 JSON 外的簡短說明，不修補截斷、逗號或引號，也不猜測缺少的資料。
        const fragment = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        if (!fragment) throw err;
        obj = JSON.parse(fragment[0]);
      }
      if (typeof obj === 'string') obj = JSON.parse(obj);
      if (!obj || typeof obj !== 'object') throw new Error('Expected JSON object or array');
      return obj;
    } catch (e) {
      const err = new AiError('format', MESSAGES.format);
      err.raw = content;
      throw err;
    }
  }

  async function suggest({ key, model, form, signal, provider = 'openai' }) {
    if (signal && signal.aborted) throw new AiError('aborted', MESSAGES.aborted);
    const followUp = clarify(form);
    if (followUp) return followUp;
    return normalize(await chatJSON({ key, model, prompt: buildPrompt(form, 'json'), signal, provider, schema: SUGGEST_SCHEMA }));
  }

  // 依問題與已回答的背景問卷，請 AI 補問 2～3 題（選擇題或簡答），格式與背景小問卷相同
  async function suggestQuestions({ key, model, form, signal, provider = 'openai' }) {
    const followUp = clarify(form);
    if (followUp) throw new AiError('context', followUp.followUp);
    const asked = T.bgQuestionsFor(form.category, form)
      .filter((q) => !q.ai)
      .map((q) => q.label);
    const context = T.contextLines(form);
    const prompt = [
      '你是一位塔羅占卜前的諮詢助理。使用者準備抽塔羅牌，請找出解牌時還缺少、但最重要的 2～3 個背景資訊，設計成簡單的問題讓使用者點選回答。',
      '你只負責提問，不要占卜，也不要回答問題本身。',
      '',
      `【問題】${(form.question || '').trim() || '（未填）'}`,
      `【類別】${form.category || '未選'}`,
      `【已回答的背景】${context.length ? '\n' + context.join('\n') : '（尚未回答）'}`,
      form.background ? `【其他補充】${form.background.trim()}` : '',
      `【已經問過的題目，不要重複】${asked.join('、')}`,
      '',
      '規則：',
      '1. 優先用選擇題（single 單選或 multi 複選），每題 3～6 個簡短選項；真的無法列選項時才用 text 簡答',
      '2. 題目要具體貼合這個問題，用繁體中文，口吻溫和',
      '3. 不要問敏感的個人資料（姓名、電話、地址、身分證）',
      '4. 沒有值得追加的問題時回傳 {"questions":[]}，不要為了湊數重複已問過的題目',
      '只回傳 JSON，格式如下：',
      '{"questions":[{"label":"題目","type":"single","options":["選項1","選項2"],"placeholder":""}]}',
    ]
      .filter((l) => l !== '')
      .join('\n');
    const obj = parseJSON(await chatJSON({ key, model, prompt, signal, provider, schema: QUIZ_SCHEMA }));
    const source = Array.isArray(obj) ? obj : obj.questions;
    if (!Array.isArray(source)) {
      if (typeof obj.followUp === 'string' && obj.followUp.trim()) throw new AiError('context', obj.followUp.trim());
      const err = new AiError('format', MESSAGES.format);
      err.raw = JSON.stringify(obj, null, 2);
      throw err;
    }
    if (!source.length) throw new AiError('no_questions', '這次沒有追加問題；可補充狀況後再試。');
    const textOf = (value) => typeof value === 'string' ? value.trim() : '';
    const list = source.filter((q) => q && (typeof q === 'object' || typeof q === 'string'))
      .map((q, i) => {
        if (typeof q === 'string') q = { label: q, type: 'text' };
        const type = ['single', 'multi', 'text'].includes(q.type) ? q.type : 'text';
        const options = [...new Set((Array.isArray(q.options) ? q.options : [])
          .map((o) => textOf(o) || (o && typeof o === 'object' ? textOf(o.label) || textOf(o.text) || textOf(o.value) : ''))
          .filter(Boolean))].slice(0, 6);
        return {
          id: 'ai' + (i + 1),
          ai: true,
          label: textOf(q.label) || textOf(q.question) || textOf(q.text),
          type: type !== 'text' && options.length < 2 ? 'text' : type,
          options,
          placeholder: textOf(q.placeholder),
        };
      })
      .filter((q) => q.label)
      .slice(0, 3);
    if (!list.length) {
      const err = new AiError('format', MESSAGES.format);
      err.raw = JSON.stringify(obj, null, 2);
      throw err;
    }
    return list;
  }

  function normalize(content) {
    const obj = parseJSON(content);
    if (typeof obj.followUp === 'string' && obj.followUp.trim()) return { followUp: obj.followUp.trim(), questions: [], category: '', timeframe: '', spreads: [] };
    return {
      followUp: typeof obj.followUp === 'string' ? obj.followUp.trim() : '',
      questions: (Array.isArray(obj.questions) ? obj.questions : [])
        .map((q) => (typeof q === 'string' ? { text: q, why: '' } : { text: String(q.text || '').trim(), why: String(q.why || '').trim() }))
        .filter((q) => q.text)
        .slice(0, 3),
      category: T.CATEGORIES.includes(obj.category) ? obj.category : '',
      timeframe: typeof obj.timeframe === 'string' ? obj.timeframe.trim() : '',
      spreads: (Array.isArray(obj.spreads) ? obj.spreads : []).filter((id) => T.SPREAD_BY_ID[id]),
    };
  }

  const clean = (s) => s.replace(/\*\*|__|`/g, '').replace(/^[「『"“]|[」』"”]$/g, '').trim();

  // 解析使用者從聊天介面貼回來的回覆。各家 AI 的排版、用詞不一，複製時還可能掉編號，所以盡量寬鬆：
  // - 編號：1. 1、 1) (1) （1） ① 一、 Q1 第1題，或編號自成一行，或完全沒有編號
  // - 標籤：建議問題／問題1、理由／原因／說明、類別、時間範圍、牌陣
  // - 也接受整段貼上 JSON（例如用了 JSON 格式的 Prompt）
  const NUM = /^(?:[(（]\s*[0-9０-９一二三]\s*[)）]|[QqＱ]\s*[0-9０-９]\s*[.、．:：)）]?|[0-9０-９]\s*[.、．)）]|[一二三]\s*[、.．]|[①②③]|第\s*[0-9０-９一二三]\s*[題个個]\s*[:：、.．]?)\s*/;
  const LABEL = {
    followUp: /^(?:釐清問題|需要補充|補充問題)\s*[:：]\s*/,
    question: /^(?:建議)?(?:的)?問題\s*[0-9０-９一二三]?\s*[:：]\s*/,
    why: /^(?:理由|原因|說明|為什麼(?:這樣問)?(?:比較好)?)\s*[:：]\s*/,
    category: /^(?:建議)?(?:的)?(?:問題)?類別\s*[:：]\s*/,
    timeframe: /^(?:建議)?(?:的)?時間(?:範圍)?\s*[:：]\s*/,
    spreads: /^(?:建議|適合)?(?:的)?牌陣\s*[:：]\s*/,
  };
  const INLINE_WHY = /\s*[（(]?\s*(?:理由|原因|說明)\s*[:：]\s*/;
  const CATEGORY_ALIAS = { 愛情: '感情', 戀愛: '感情', 工作: '事業', 職場: '事業', 職涯: '事業', 財務: '財運', 金錢: '財運', 身體: '健康', 課業: '學業', 考試: '學業', 成長: '自我成長' };
  const isQuestion = (s) => /[?？]$/.test(s);
  const squash = (s) => s.replace(/\s+/g, '');

  function parseList(text) {
    const out = { followUp: '', questions: [], category: '', timeframe: '', spreads: [] };
    const raw = String(text || '')
      .replace(/[​-‍﻿]/g, '')
      .replace(/[ 　]/g, ' ');

    // 整段是 JSON（可能包在 ``` 裡或前後有說明文字）
    const json = raw.match(/\{[\s\S]*\}/);
    if (json) {
      try {
        const res = normalize(json[0]);
        if (res.questions.length || res.followUp) return res;
      } catch (e) {
        // 不是合法 JSON，當成一般文字繼續解析
      }
    }

    const loose = []; // 沒有編號與標籤、但以問號結尾的行，最後備用
    let pending = false; // 上一行只有編號，這一行就是問題
    let lastQ = null; // 剛加入、還沒有理由的問題，用來接續下一行
    let reasonQ = null; // 可接收「理由」的問題；跨空行保留，讀完理由或進入建議摘要就清除
    const addQuestion = (s) => {
      const [q, ...rest] = s.split(INLINE_WHY);
      const textQ = clean(q.replace(LABEL.question, ''));
      if (!textQ) {
        pending = true; // 「建議問題：」與實際題目可能隔著換行或空行
        lastQ = reasonQ = null;
        return;
      }
      if (out.questions.some((x) => x.text === textQ)) return (lastQ = reasonQ = null);
      lastQ = { text: textQ, why: clean(rest.join(' ').replace(/[）)]$/, '')) };
      out.questions.push(lastQ);
      reasonQ = lastQ.why ? null : lastQ;
      if (lastQ.why) lastQ = null;
    };

    raw.split(/\r?\n/).forEach((line) => {
      if (/^\s*(```|~~~)/.test(line)) return; // 程式碼區塊的圍欄，例如 ```text
      const l = clean(line.replace(/^[\s>*•·#-]+/, ''));
      if (!l) {
        lastQ = null;
        return;
      }
      if (/^[0-9０-９]$/.test(l) || !l.replace(NUM, '')) {
        pending = true;
        lastQ = null;
        return;
      }
      const body = clean(l.replace(NUM, ''));
      const numbered = body !== l || pending;
      pending = false;
      let m;
      if ((m = body.match(LABEL.followUp))) {
        out.followUp = body.slice(m[0].length).trim();
        lastQ = reasonQ = null;
      } else if ((m = body.match(LABEL.category))) {
        const v = body.slice(m[0].length);
        out.category =
          T.CATEGORIES.find((c) => v.includes(c)) ||
          CATEGORY_ALIAS[Object.keys(CATEGORY_ALIAS).find((k) => v.includes(k))] ||
          out.category;
        lastQ = reasonQ = null;
      } else if ((m = body.match(LABEL.timeframe))) {
        out.timeframe = body.slice(m[0].length).replace(/[。.]$/, '').trim() || out.timeframe;
        lastQ = reasonQ = null;
      } else if ((m = body.match(LABEL.spreads))) {
        const v = squash(body.slice(m[0].length));
        const found = T.SPREADS.filter((s) => v.includes(squash(s.name)) || v.includes(s.id)).map((s) => s.id);
        if (found.length) out.spreads = found;
        lastQ = reasonQ = null;
      } else if ((m = body.match(LABEL.why))) {
        const q = reasonQ;
        if (q) q.why = q.why ? `${q.why} ${body.slice(m[0].length)}` : body.slice(m[0].length);
        lastQ = reasonQ = null;
      } else if (LABEL.question.test(body) || numbered) {
        addQuestion(body);
      } else if (lastQ) {
        // 沒有標籤的下一行：問題已經以問號結尾，就當作理由；否則是問題被斷行，接回去
        if (isQuestion(lastQ.text)) {
          lastQ.why = body;
          lastQ = reasonQ = null;
        } else {
          lastQ.text = clean(lastQ.text + body);
        }
      } else if (isQuestion(body)) {
        loose.push(body);
      }
    });

    if (!out.questions.length) loose.forEach(addQuestion);
    if (out.followUp) return { followUp: out.followUp, questions: [], category: '', timeframe: '', spreads: [] };
    out.questions = out.questions.filter((q) => q.text).slice(0, 3);
    return out;
  }

  T.ai = {
    DEFAULT_MODEL: 'gpt-6-luna',
    providerInfo,
    providers: Object.keys(PROVIDERS),
    clarify,
    budgetModelInfo,
    budgetModels,
    isDeprecatedModel,
    MESSAGES,
    buildPrompt,
    listModels,
    suggest,
    suggestQuestions,
    parseList,
  };
})();
