// AI 問題整理：使用者自備 OpenAI API key 時由瀏覽器直接呼叫；沒有 key 時產生 Prompt 讓使用者複製貼上。
(function () {
  const T = (window.Tarot = window.Tarot || {});
  const API = 'https://api.openai.com/v1';
  // 會先「思考」的模型（如 gpt-6-luna）實測約 5～10 秒，留餘裕
  const TIMEOUT_MS = 30000;
  // 帳戶模型清單裡混有已停用的舊模型與非對話用途的模型，「測試連線」時不列出
  const NOT_CHAT = /codex|pro|search|tts|transcribe|audio|realtime|image|instruct|16k|vision|preview|chat-latest|\d{4}-\d{2}-\d{2}|^gpt-3\.5|^gpt-4(-|$)|^gpt-4\.1-nano/;

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

  // format: 'json' 給 API 用；'list' 給使用者複製到聊天介面用
  function buildPrompt(form, format) {
    const L = [
      '請協助我做文字整理：把下方的生活情境，改寫成 3 個以我自己為主角、可以用來自我反思的開放式問題。',
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
    L.push('請提供 3 個不同角度的問題，每個附一句說明為什麼這樣問比較好。');
    L.push(`並建議：問題類別（${T.CATEGORIES.join('／')}）、時間範圍、適合的牌陣。`);
    if (format === 'json') {
      L.push('牌陣只能從以下清單選，填 id：', spreadList(), '');
      L.push('如果我的描述太模糊、無法整理，請在 followUp 放一個釐清用的問題，questions 留空陣列。');
      L.push('只回傳 JSON，格式如下：');
      L.push('{"followUp":"","questions":[{"text":"建議問題","why":"為什麼這樣問比較好"}],"category":"類別","timeframe":"時間範圍","spreads":["牌陣 id"]}');
    } else {
      L.push('牌陣請依探索主題從以下清單選一個，不代表預測或專業評估：', spreadList(), '');
      L.push('如果我的描述太模糊、無法整理，請先問我一個問題釐清。');
      L.push('資訊足夠時，請把整份回答放在一個程式碼區塊（```text）裡，方便我直接複製。只輸出以下 9 行，每個標籤與內容放在同一行，不另加選擇理由或最推薦題目：');
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
    quota: 'OpenAI 帳戶額度不足或請求太頻繁，請稍後再試。',
    rejected: 'OpenAI 拒絕了這次請求，可能是額度不足、請求太頻繁，或設定的模型名稱不正確。',
    network: '連不上 OpenAI，請檢查網路連線。',
    timeout: 'OpenAI 回應逾時，請稍後再試。',
    format: 'AI 的回覆格式無法解析。',
    aborted: '已取消。',
  };

  function withTimeout(signal) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort('timeout'), TIMEOUT_MS);
    if (signal) signal.addEventListener('abort', () => ctrl.abort('user'));
    return { signal: ctrl.signal, done: () => clearTimeout(timer), ctrl };
  }

  // GET /v1/models 的錯誤回應有 CORS 標頭，瀏覽器讀得到 401，用來判斷 key 是否有效
  async function listModels(key) {
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
    return (data.data || []).map((m) => m.id).filter((id) => /^gpt-\d/.test(id) && !NOT_CHAT.test(id)).sort();
  }

  // 呼叫 OpenAI，要求回傳 JSON，回傳 JSON 文字內容
  async function chatJSON({ key, model, prompt, signal }) {
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
      return JSON.parse(content);
    } catch (e) {
      const err = new AiError('format', MESSAGES.format);
      err.raw = content;
      throw err;
    }
  }

  async function suggest({ key, model, form, signal }) {
    return normalize(await chatJSON({ key, model, prompt: buildPrompt(form, 'json'), signal }));
  }

  // 依問題與已回答的背景問卷，請 AI 補問 2～3 題（選擇題或簡答），格式與背景小問卷相同
  async function suggestQuestions({ key, model, form, signal }) {
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
      '只回傳 JSON，格式如下：',
      '{"questions":[{"label":"題目","type":"single","options":["選項1","選項2"],"placeholder":""}]}',
    ]
      .filter((l) => l !== '')
      .join('\n');
    const obj = parseJSON(await chatJSON({ key, model, prompt, signal }));
    const list = (Array.isArray(obj.questions) ? obj.questions : [])
      .map((q, i) => {
        const type = ['single', 'multi', 'text'].includes(q.type) ? q.type : 'text';
        const options = (Array.isArray(q.options) ? q.options : []).map((o) => String(o).trim()).filter(Boolean).slice(0, 6);
        return {
          id: 'ai' + (i + 1),
          ai: true,
          label: String(q.label || '').trim(),
          type: type !== 'text' && options.length < 2 ? 'text' : type,
          options,
          placeholder: String(q.placeholder || '').trim(),
        };
      })
      .filter((q) => q.label)
      .slice(0, 3);
    if (!list.length) throw new AiError('format', MESSAGES.format);
    return list;
  }

  function normalize(content) {
    const obj = parseJSON(content);
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
        if (res.questions.length) return res;
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
      if ((m = body.match(LABEL.category))) {
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
    out.questions = out.questions.filter((q) => q.text).slice(0, 3);
    return out;
  }

  T.ai = {
    DEFAULT_MODEL: 'gpt-6-luna',
    MESSAGES,
    buildPrompt,
    listModels,
    suggest,
    suggestQuestions,
    parseList,
  };
})();
