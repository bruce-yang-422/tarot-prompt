const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function storage() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
}
function runtime(fetch, extras = {}) {
  const window = { localStorage: storage(), sessionStorage: storage() };
  const ctx = vm.createContext({ window, fetch, AbortController, setTimeout, clearTimeout, ...extras });
  for (const file of ['spreads', 'prompt', 'background', 'storage', 'ai']) {
    vm.runInContext(readFileSync(path.join(__dirname, '..', 'js', file + '.js'), 'utf8'), ctx);
  }
  return ctx;
}
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const suggestion = { questions: [{ text: '我要如何改善作息？', why: '聚焦行動' }], category: '健康', timeframe: '三個月內', spreads: ['obstacle'] };
const form = { question: '最近太晚睡', category: '健康' };
const generated = (value) => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'ignore' }, { text: JSON.stringify(value) }] } }] });

test('Google 模型清單會翻頁、依生成能力篩選並隔離認證', async () => {
  const calls = [];
  const ctx = runtime(async (url, options) => {
    calls.push({ url, options });
    return response(calls.length === 1 ? {
      models: [
        { name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.1-flash-lite', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.8-flash-tts', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] },
        { name: 'models/gemini-3-pro-preview', supportedGenerationMethods: ['generateContent'] },
      ], nextPageToken: 'page +2',
    } : { models: [{ name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] }] });
  });
  const ai = ctx.window.Tarot.ai;
  assert.deepEqual(Array.from(await ai.listModels('test-google-key', 'google')), ['gemini-3.5-flash-lite', 'gemini-3.8-flash']);
  assert.match(calls[1].url, /pageToken=page%20%2B2/);
  for (const { url, options } of calls) {
    assert.ok(url.startsWith('https://generativelanguage.googleapis.com/'));
    assert.ok(!url.includes('test-google-key'));
    assert.equal(options.headers['x-goog-api-key'], 'test-google-key');
    assert.equal(options.headers.Authorization, undefined);
  }
  assert.deepEqual(Array.from(ai.budgetModels(['gemini-3.5-flash-lite', 'gemini-3.8-flash'], 'google')), ['gemini-3.5-flash-lite']);
});

test('Google 整理問題要求 JSON 並忽略思考內容', async () => {
  let call;
  const ctx = runtime(async (url, options) => { call = { url, options }; return response(generated(suggestion)); });
  const result = await ctx.window.Tarot.ai.suggest({ key: 'test-google-key', provider: 'google', form });
  assert.equal(result.questions[0].text, suggestion.questions[0].text);
  assert.equal(result.category, '健康');
  assert.match(call.url, /models\/gemini-3\.5-flash-lite:generateContent$/);
  const body = JSON.parse(call.options.body);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.ok(body.generationConfig.responseJsonSchema.properties.followUp);
  assert.equal(body.contents[0].role, 'user');
  assert.ok(body.contents[0].parts[0].text.includes(form.question));
  assert.ok(!call.url.includes('test-google-key'));
});

test('Google 追加背景問題沿用既有問卷格式', async () => {
  const ctx = runtime(async () => response(generated({ questions: [{ label: '最困擾的是？', type: 'single', options: ['晚睡', '早醒'] }] })));
  const result = await ctx.window.Tarot.ai.suggestQuestions({ key: 'test-google-key', provider: 'google', form });
  assert.equal(result[0].type, 'single');
  assert.equal(result[0].ai, true);
  assert.equal(result[0].options.length, 2);
});

test('OpenAI 預設呼叫維持既有端點、模型與認證', async () => {
  let call;
  const ctx = runtime(async (url, options) => { call = { url, options }; return response({ choices: [{ message: { content: JSON.stringify(suggestion) } }] }); });
  await ctx.window.Tarot.ai.suggest({ key: 'test-openai-key', form });
  assert.equal(call.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(call.options.headers.Authorization, 'Bearer test-openai-key');
  assert.equal(call.options.headers['x-goog-api-key'], undefined);
  assert.equal(JSON.parse(call.options.body).model, 'gpt-6-luna');
});

test('Google 無效 key、權限、額度、無內容與網路錯誤有明確分類', async () => {
  for (const [status, data, code] of [
    [400, { error: { details: [{ reason: 'API_KEY_INVALID' }] } }, 'invalid'],
    [401, {}, 'invalid'], [403, {}, 'rejected'], [429, {}, 'quota'], [404, {}, 'rejected'],
    [200, { promptFeedback: { blockReason: 'SAFETY' } }, 'blocked'],
    [200, { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{}' }] } }] }, 'incomplete'],
    [200, { candidates: [{ finishReason: 'STOP', content: { parts: [] } }] }, 'blocked'],
    [200, { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'not valid JSON' }] } }] }, 'format'],
  ]) {
    const ctx = runtime(async () => response(data, status));
    await assert.rejects(ctx.window.Tarot.ai.suggest({ key: 'test-google-key', provider: 'google', form }), { code });
  }
  const ctx = runtime(async () => { throw new TypeError('offline'); });
  await assert.rejects(ctx.window.Tarot.ai.listModels('test-google-key', 'google'), { code: 'network' });
});

test('Google 支援取消及逾時，且不發出其他服務請求', async () => {
  const fetch = async (url, options) => {
    assert.ok(url.startsWith('https://generativelanguage.googleapis.com/'));
    if (options.signal.aborted) throw new Error('aborted');
    return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  };
  const ctx = runtime(fetch);
  const ctrl = new AbortController();
  const pending = ctx.window.Tarot.ai.suggest({ key: 'test-google-key', provider: 'google', form, signal: ctrl.signal });
  ctrl.abort();
  await assert.rejects(pending, { code: 'aborted' });
  const timed = runtime(fetch, { setTimeout: (fn) => { queueMicrotask(fn); return 1; }, clearTimeout: () => {} });
  await assert.rejects(timed.window.Tarot.ai.suggest({ key: 'test-google-key', provider: 'google', form }), { code: 'timeout' });
});

test('舊 OpenAI 設定相容，兩家 key 與保存方式互不影響', () => {
  const ctx = runtime();
  const { window } = ctx;
  window.localStorage.setItem('wenpai.apiKey', JSON.stringify('legacy-openai-key'));
  window.localStorage.setItem('wenpai.settings', JSON.stringify({ ai: { model: 'gpt-5.6-luna' } }));
  const store = window.Tarot.store;
  assert.equal(store.getSettings().ai.provider, 'openai');
  assert.equal(store.getSettings().ai.model, 'gpt-5.6-luna');
  assert.equal(store.getKey(), 'legacy-openai-key');
  store.setKey('test-google-key', false, 'google');
  assert.equal(store.getKey('google'), 'test-google-key');
  assert.equal(store.getKey('openai'), 'legacy-openai-key');
  assert.equal(store.keyRemembered('google'), false);
  assert.equal(store.keyRemembered('openai'), true);
  store.setKey('test-google-key', true, 'google');
  assert.equal(window.sessionStorage.getItem('wenpai.apiKey.google'), null);
  assert.equal(store.keyRemembered('google'), true);
  store.clearKey('google');
  assert.equal(store.getKey('google'), '');
  assert.equal(store.getKey('openai'), 'legacy-openai-key');
});

test('測試與玩笑輸入先接梗補問，不花 API 請求或編造建議', async () => {
  let requests = 0;
  const ctx = runtime(async () => { requests++; throw new Error('Must not request'); });
  const ai = ctx.window.Tarot.ai;
  for (const provider of ['openai', 'google', 'claude']) {
    for (const question of ['', '測試問題', '這只是測試', 'Test question', '123456', '你好', '你愛我嗎', '我啥時會發財', '隔壁同事很漂亮，他願意跟我滾床單嗎', '我家狗狗為啥喜歡飛在天上']) {
      const res = await ai.suggest({ key: 'test-key', provider, form: { question, category: '其他', timeframe: '三個月內', age: '30', bgAnswers: { 其他: { mood: ['迷惘'], duration: '幾週', want: '該怎麼做' } } } });
      assert.ok(res.followUp, question);
      assert.equal(res.questions.length, 0);
      assert.equal(res.spreads.length, 0);
      assert.equal(res.category, '');
      assert.equal(res.timeframe, '');
    }
  }
  assert.equal(requests, 0);
  assert.match(ai.clarify({ question: '測試問題' }).followUp, /先別鬧/);
  assert.match(ai.clarify({ question: '我啥時會發財' }).followUp, /收入/);
  assert.match(ai.clarify({ question: '同事願意跟我滾床單嗎' }).followUp, /實際互動/);
});

test('不以字數阻擋真實困擾，補充情境後可正常繼續', async () => {
  let requests = 0;
  const ctx = runtime(async () => { requests++; return response(generated(suggestion)); });
  const ai = ctx.window.Tarot.ai;
  for (const question of ['失眠', '失戀', '測試新的工作流程時被主管否定']) assert.equal(ai.clarify({ question }), null);
  const dummy = { question: '測試問題', background: '補充（最近發生了什麼事？）：測試' };
  assert.ok(ai.clarify(dummy));
  dummy.background += '\n補充（最近發生了什麼事？）：最近追劇到凌晨，影響上班精神';
  assert.equal(ai.clarify(dummy), null);
  assert.equal((await ai.suggest({ key: 'test-google-key', provider: 'google', form: dummy })).questions.length, 1);
  assert.equal(requests, 1);
  assert.equal(ai.clarify({ question: '測試問題', category: '其他', bgAnswers: { 其他: { detail: '主管臨時增加工作，讓我每天加班' } } }), null);
});

test('追加問卷遇到無情境輸入也先要求補充', async () => {
  const ctx = runtime(async () => { throw new Error('Must not request'); });
  await assert.rejects(ctx.window.Tarot.ai.suggestQuestions({ key: 'test-key', form: { question: '測試問題' } }), { code: 'context' });
});

test('Claude 模型清單翻頁，依生命週期與 JSON 能力篩選，key 不混用', async () => {
  const calls = [];
  const ctx = runtime(async (url, options) => {
    calls.push({ url, options });
    return response(calls.length === 1 ? {
      data: [
        { id: 'claude-haiku-5-5', lifecycle: 'active', capabilities: { structured_outputs: { supported: true } } },
        { id: 'claude-sonnet-4-5-20250929', lifecycle: 'deprecated' },
        { id: 'claude-3-haiku-20240307', lifecycle: 'retired' },
        { id: 'claude-test-retired', lifecycle: 'retired' },
        { id: 'claude-without-json', lifecycle: 'active', capabilities: { structured_outputs: { supported: false } } },
      ], has_more: true, last_id: 'cursor +2',
    } : { data: [{ id: 'claude-sonnet-5-5', lifecycle: 'active' }, { id: 'claude-opus-4-8', lifecycle: 'active' }], has_more: false });
  });
  const ai = ctx.window.Tarot.ai;
  assert.deepEqual(Array.from(await ai.listModels('test-claude-key', 'claude')), ['claude-haiku-5-5', 'claude-opus-4-8', 'claude-sonnet-5-5']);
  assert.match(calls[1].url, /after_id=cursor%20%2B2/);
  for (const { url, options } of calls) {
    assert.ok(url.startsWith('https://api.anthropic.com/v1/models'));
    assert.ok(!url.includes('test-claude-key'));
    assert.equal(options.headers['x-api-key'], 'test-claude-key');
    assert.equal(options.headers['anthropic-version'], '2026-10-21');
    assert.equal(options.headers['anthropic-dangerous-direct-browser-access'], 'true');
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.headers['x-goog-api-key'], undefined);
  }
  assert.equal(ai.isDeprecatedModel('claude-test-retired', 'claude'), true);
  assert.equal(ai.isDeprecatedModel('claude-opus-4-8', 'claude'), false);
  assert.deepEqual(Array.from(ai.budgetModels(['claude-sonnet-5-5', 'claude-haiku-5-5'], 'claude')), ['claude-haiku-5-5']);
});

test('Claude 整理問題與追加問卷傳入各自的嚴格 JSON schema', async () => {
  const calls = [];
  const ctx = runtime(async (url, options) => {
    calls.push({ url, options });
    const text = JSON.stringify(calls.length === 1 ? suggestion : { questions: [{ label: '最困擾的是？', type: 'single', options: ['晚睡', '早醒'], placeholder: '' }] });
    return response({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: 'ignore this block' }, { type: 'text', text: text.slice(0, 20) }, { type: 'text', text: text.slice(20) }] });
  });
  const ai = ctx.window.Tarot.ai;
  const result = await ai.suggest({ key: 'test-claude-key', provider: 'claude', form });
  assert.equal(result.questions[0].text, suggestion.questions[0].text);
  const quiz = await ai.suggestQuestions({ key: 'test-claude-key', provider: 'claude', model: 'claude-sonnet-5-5', form });
  assert.equal(quiz[0].type, 'single');
  assert.equal(quiz[0].ai, true);
  const bodies = calls.map(({ options }) => JSON.parse(options.body));
  assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(bodies[0].model, 'claude-haiku-5-5');
  assert.equal(bodies[1].model, 'claude-sonnet-5-5');
  for (const body of bodies) {
    assert.equal(body.max_tokens, 4096);
    assert.equal(body.messages[0].role, 'user');
    assert.equal(body.output_config.format.type, 'json_schema');
    assert.equal(body.output_config.format.schema.additionalProperties, false);
  }
  assert.ok(bodies[0].output_config.format.schema.properties.followUp);
  assert.deepEqual(bodies[1].output_config.format.schema.properties.questions.items.properties.type.enum, ['single', 'multi', 'text']);
});

test('Claude 錯誤、拒答與截斷不會當作有效建議匯入', async () => {
  for (const [status, data, code] of [
    [400, { error: { type: 'authentication_error' } }, 'invalid'],
    [401, {}, 'invalid'], [403, {}, 'rejected'], [429, {}, 'quota'], [404, {}, 'rejected'], [529, {}, 'rejected'],
    [200, { stop_reason: 'refusal', content: [] }, 'blocked'],
    [200, { stop_reason: 'end_turn', stop_details: { type: 'refusal' }, content: [{ type: 'text', text: '{}' }] }, 'blocked'],
    [200, { stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"questions":[' }] }, 'incomplete'],
    [200, { stop_reason: 'end_turn', content: [] }, 'blocked'],
    [200, { stop_reason: 'end_turn', content: [{ type: 'text', text: 'invalid JSON' }] }, 'format'],
  ]) {
    const ctx = runtime(async () => response(data, status));
    await assert.rejects(ctx.window.Tarot.ai.suggest({ key: 'test-claude-key', provider: 'claude', form }), { code });
  }
  const invalidPage = runtime(async () => response({ data: [], has_more: true, last_id: 'same' }));
  await assert.rejects(invalidPage.window.Tarot.ai.listModels('test-claude-key', 'claude'), { code: 'format' });
});

test('Claude 可取消及逾時，取消後不改呼叫其他供應商', async () => {
  const fetch = async (url, options) => {
    assert.ok(url.startsWith('https://api.anthropic.com/'));
    if (options.signal.aborted) throw new Error('aborted');
    return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  };
  const ctx = runtime(fetch);
  const ctrl = new AbortController();
  const pending = ctx.window.Tarot.ai.suggest({ key: 'test-claude-key', provider: 'claude', form, signal: ctrl.signal });
  ctrl.abort();
  await assert.rejects(pending, { code: 'aborted' });
  const timed = runtime(fetch, { setTimeout: (fn) => { queueMicrotask(fn); return 1; }, clearTimeout: () => {} });
  await assert.rejects(timed.window.Tarot.ai.suggest({ key: 'test-claude-key', provider: 'claude', form }), { code: 'timeout' });
});

test('Claude 第三份 key 與模型設定不覆蓋既有兩家', () => {
  const ctx = runtime();
  const store = ctx.window.Tarot.store;
  store.setKey('test-openai-key', true, 'openai');
  store.setKey('test-google-key', false, 'google');
  store.setKey('test-claude-key', true, 'claude');
  store.saveSettings({ ai: { provider: 'claude', model: 'gpt-5.6-luna', googleModel: 'gemini-3.8-flash', claudeModel: 'claude-sonnet-5-5' } });
  assert.equal(store.getSettings().ai.claudeModel, 'claude-sonnet-5-5');
  store.clearKey('claude');
  assert.equal(store.getKey('claude'), '');
  assert.equal(store.getKey('openai'), 'test-openai-key');
  assert.equal(store.getKey('google'), 'test-google-key');
  assert.equal(store.keyRemembered('google'), false);
});

test('Google 追加問卷指定 schema，並相容包裝 JSON、題目陣列與選項物件', async () => {
  const question = { label: '與主管談過了嗎？', type: 'single', options: ['談過', '還沒有'], placeholder: '' };
  const variants = [
    JSON.stringify({ questions: [question] }),
    '```json\n' + JSON.stringify({ questions: [question] }) + '\n```',
    '以下是問題：\n' + JSON.stringify({ questions: [question] }),
    JSON.stringify([question]),
    JSON.stringify({ questions: [null, { question: question.label, type: 'single', options: [{ label: '談過' }, { text: '還沒有' }, { value: '談過' }] }] }),
    JSON.stringify(JSON.stringify({ questions: [question] })),
  ];
  for (const text of variants) {
    const ctx = runtime(async (url, options) => {
      const schema = JSON.parse(options.body).generationConfig.responseJsonSchema;
      assert.deepEqual(schema.required, ['questions']);
      assert.ok(schema.properties.questions.items.properties.label);
      assert.equal(schema.properties.questions.items.additionalProperties, false);
      return response({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }] });
    });
    const result = await ctx.window.Tarot.ai.suggestQuestions({ key: 'test-google-key', provider: 'google', form });
    assert.equal(result[0].label, question.label);
    assert.equal(result[0].type, 'single');
    assert.deepEqual(Array.from(result[0].options), ['談過', '還沒有']);
  }
});

test('追加問卷區分無問題、需補充與無法解析，截斷不會被修補', async () => {
  for (const [text, code] of [
    ['{"questions":[]}', 'no_questions'],
    ['{"followUp":"你最想釐清的是哪件事？"}', 'context'],
    ['null', 'format'], ['{"unexpected":[]}', 'format'],
    ['{"questions":[null,{}]}', 'format'], ['{"questions":[{"label":"缺少結尾"}', 'format'],
  ]) {
    const ctx = runtime(async () => response({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }] }));
    await assert.rejects(ctx.window.Tarot.ai.suggestQuestions({ key: 'test-google-key', provider: 'google', form }), { code });
  }
});
