// 畫面切換、抽牌、選牌器、結果頁、設定與 AI 問題整理的介面。
(function () {
  const T = window.Tarot;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);
  // 引用 index.html 裡的自製 SVG 圖示
  const icon = (name, cls = '') => `<svg class="icon${cls ? ' ' + cls : ''}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;
  const COPY_LABEL = icon('copy') + '複製 Prompt';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const EL = { 火: 'fire', 水: 'water', 風: 'air', 土: 'earth' };
  const MAX_CLARIFIERS = 3;

  // ---------- 隨機 ----------

  // crypto.getRandomValues 搭配拒絕取樣，避免取餘數造成的偏差
  function randInt(n) {
    const limit = Math.floor(0x100000000 / n) * n;
    const buf = new Uint32Array(1);
    do crypto.getRandomValues(buf);
    while (buf[0] >= limit);
    return buf[0] % n;
  }

  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ---------- 狀態 ----------

  const emptyForm = () => ({
    question: '',
    category: '',
    timeframe: '三個月內',
    background: '',
    gender: '',
    age: '',
    options: { A: '', B: '', C: '' },
    bgAnswers: {}, // 背景小問卷的回答，依類別分開存：{ 感情: { status: '有男女朋友', ... } }
    bgExtra: null, // AI 追加的題目：{ category, questions }
  });

  let settings = T.store.getSettings();
  const S = {
    mode: 'auto',
    form: emptyForm(),
    spreadId: null,
    withOptional: false,
    uprightOnly: settings.uprightOnly,
    cards: [],
    cardsFor: '',
    jumpers: [],
    aiSpreads: [],
    // 以下不存草稿
    active: 0,
    target: 'slot',
    orient: false,
    group: null,
    pickerState: { tab: 'major', q: '' },
    freshId: null,
  };

  const draft = T.store.getDraft();
  if (draft) {
    Object.assign(S, draft);
    S.form = Object.assign(emptyForm(), draft.form, { options: Object.assign(emptyForm().options, draft.form && draft.form.options) });
  }

  function saveDraft() {
    const { mode, form, spreadId, withOptional, uprightOnly, cards, cardsFor, jumpers, aiSpreads } = S;
    T.store.saveDraft({ mode, form, spreadId, withOptional, uprightOnly, cards, cardsFor, jumpers, aiSpreads });
  }

  function resetSession() {
    Object.assign(S, { form: emptyForm(), spreadId: null, withOptional: false, cards: [], cardsFor: '', jumpers: [], aiSpreads: [], group: null });
    T.store.clearDraft();
  }

  const currentSpread = () => T.SPREAD_BY_ID[S.spreadId];
  const currentPositions = () => T.getPositions(currentSpread(), S.withOptional);

  // ---------- 共用元件 ----------

  function faceHTML(card, reversed) {
    const major = card.arcana === 'major';
    const top = major ? card.roman : T.SUITS[card.suit].name;
    const mid = major ? card.name : card.name.slice(2);
    const label = `${card.name}・${reversed ? '逆位' : '正位'}`;
    // 牌圖載入失敗時（見下方的 error 監聽）退回文字卡片
    return (
      `<span class="cf cf--${major ? 'major' : EL[card.element]}${reversed ? ' is-rev' : ''}" role="img" aria-label="${esc(label)}">` +
      `<img class="cf-img" src="${T.cardImage(card)}" alt="" decoding="async">` +
      `<span class="cf-in"><span class="cf-top">${esc(top)}</span><span class="cf-mid">${esc(mid)}</span><span class="cf-el">${card.element}</span></span>` +
      (reversed ? '<span class="cf-rev" aria-hidden="true">逆</span>' : '') +
      '</span>'
    );
  }

  // CSP 不允許 HTML 上的 onerror，改在 document 以捕獲階段監聽圖片載入失敗
  document.addEventListener(
    'error',
    (e) => {
      const img = e.target;
      if (img.tagName !== 'IMG') return;
      if (img.classList.contains('cf-img')) img.closest('.cf').classList.add('no-img');
      else if (img.classList.contains('reading-img')) img.remove();
    },
    true
  );

  // 依牌陣座標排出格子；renderCell(position, index) 回傳格子內容
  function buildBoard(container, spread, withOptional, renderCell) {
    const positions = T.getPositions(spread, withOptional);
    const cells = spread.layout.cells.slice(0, positions.length);
    const cols = Math.max(...cells.map((c) => c[0]));
    const rows = Math.max(...cells.map((c) => c[1]));
    container.innerHTML = positions
      .map((p, i) => `<div class="bslot${cells[i][2] ? ' bslot--cross' : ''}" data-i="${i}">${renderCell(p, i)}</div>`)
      .join('');
    container.style.gridTemplateColumns = `repeat(${cols}, var(--card-w))`;
    container.style.gridTemplateRows = `repeat(${rows}, var(--card-h))`;
    $$('.bslot', container).forEach((el, i) => {
      el.style.gridColumn = cells[i][0];
      el.style.gridRow = cells[i][1];
    });
    container.dataset.cols = cols;
    container.dataset.rows = rows;
    container.dataset.cross = cells.some((c) => c[2]) ? '1' : '';
  }

  const CARD_RATIO = 1.72; // 牌圖 600 × 約 1031
  const CARD_MAX_W = 260;

  // 結果頁的牌陣圖在不改變排列形狀的前提下盡量放大：
  // 寬度受可用寬度限制；高度方面，一到兩排的牌陣整體不超過畫面 80%、三排不超過一個畫面（一眼看完），
  // 四排的凱爾特十字可到畫面 1.25 倍，避免牌被壓得太小
  function fitBoard(board) {
    const wrap = board.parentElement;
    const cols = Number(board.dataset.cols) || 1;
    const rows = Number(board.dataset.rows) || 1;
    // 凱爾特十字橫放的那張會突出到左右兩欄，多留一點間距
    const gapRatio = board.dataset.cross ? 0.4 : 0.12;
    const byWidth = (wrap.clientWidth - 16) / (cols + (cols - 1) * gapRatio);
    const maxHeight = Math.max(480, window.innerHeight * (rows <= 2 ? 0.8 : rows === 3 ? 1 : 1.25));
    const byHeight = maxHeight / (rows * CARD_RATIO + (rows - 1) * gapRatio);
    const w = Math.max(56, Math.floor(Math.min(CARD_MAX_W, byWidth, byHeight)));
    board.style.setProperty('--card-w', w + 'px');
    board.style.setProperty('--card-h', Math.round(w * CARD_RATIO) + 'px');
    board.style.setProperty('--gap', Math.round(w * gapRatio) + 'px');
    board.classList.toggle('board--large', w >= 110);
    // 額外的牌跟牌陣同尺寸，但不超過 180px，避免比牌陣主體還搶眼
    const extras = $('#extraCards');
    if (extras) {
      const ew = Math.min(w, 180);
      extras.style.setProperty('--card-w', ew + 'px');
      extras.style.setProperty('--card-h', Math.round(ew * CARD_RATIO) + 'px');
      extras.classList.toggle('board--large', ew >= 110);
    }
  }

  let fitTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(() => {
      const board = $('#resultBoard');
      if (board && !view('result').hidden) fitBoard(board);
    }, 150);
  });

  function stepsHTML(n) {
    const third = S.mode === 'manual' ? '選牌' : '抽牌';
    const items = [
      ['問題', '#/ask'],
      ['牌陣', '#/spread'],
      [third, S.mode === 'manual' ? '#/pick' : null],
      ['結果', null],
    ];
    return (
      '<ol class="steps">' +
      items
        .map(([name, href], i) => {
          const k = i + 1;
          const cls = k < n ? 'done' : k === n ? 'current' : '';
          const link = k < n && n < 4 && href;
          const inner = link ? `<a href="${href}">${k} ${name}</a>` : `<span>${k} ${name}</span>`;
          return `<li class="${cls}"${k === n ? ' aria-current="step"' : ''}>${inner}</li>`;
        })
        .join('') +
      '</ol>'
    );
  }

  function setSteps(view, n) {
    $('.steps-slot', view).innerHTML = stepsHTML(n);
  }

  let toastTimer = null;
  function toast(message, opts = {}) {
    const el = $('#toast');
    el.innerHTML = `<span>${esc(message)}</span>` + (opts.action ? `<button type="button" class="toast-action">${esc(opts.action)}</button>` : '');
    el.hidden = false;
    if (opts.action) {
      $('.toast-action', el).onclick = () => {
        el.hidden = true;
        opts.onAction();
      };
    }
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), opts.timeout || (opts.action ? 5000 : 3000));
  }

  // 通用選擇對話框，回傳按下的按鈕值；按 Esc 關閉回傳 null
  function choose({ title, message, buttons }) {
    const dlg = $('#choiceDialog');
    $('#choiceTitle').textContent = title;
    $('#choiceMessage').innerHTML = message;
    $('#choiceButtons').innerHTML = buttons
      .map((b, i) => `<button type="button" class="btn ${b.primary ? 'btn-primary' : 'btn-ghost'}${b.danger ? ' btn-danger' : ''}" data-i="${i}">${esc(b.label)}</button>`)
      .join('');
    return new Promise((resolve) => {
      let value = null;
      $$('#choiceButtons button').forEach((btn) => {
        btn.onclick = () => {
          value = buttons[Number(btn.dataset.i)].value;
          dlg.close();
        };
      });
      dlg.addEventListener('close', () => resolve(value), { once: true });
      dlg.showModal();
    });
  }

  async function copyText(text, fallbackEl) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) { /* 改用舊方法 */ }
    try {
      if (fallbackEl) {
        fallbackEl.focus();
        fallbackEl.select();
        return document.execCommand('copy');
      }
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.className = 'offscreen';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) {
      return false;
    }
  }

  const formatDate = (ts) =>
    new Date(ts).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });

  // ---------- 路由 ----------

  let leaveHook = null;

  function show(name) {
    $$('.view').forEach((v) => (v.hidden = v.dataset.view !== name));
    document.body.dataset.view = name;
  }

  const view = (name) => $(`.view[data-view="${name}"]`);
  const go = (hash) => (location.hash === hash ? route() : (location.hash = hash));
  const readyToDraw = () => S.form.question.trim() && currentSpread();

  function route() {
    if (leaveHook) {
      leaveHook();
      leaveHook = null;
    }
    const m = (location.hash.replace(/^#/, '') || '/').match(/^\/([^/]*)\/?(.*)$/) || [];
    const path = m[1] || '';
    switch (path) {
      case 'ask':
        renderAsk();
        break;
      case 'spread':
        if (!S.form.question.trim()) return go('#/ask');
        renderSpread();
        break;
      case 'draw':
        if (!readyToDraw()) return go('#/ask');
        renderDraw();
        break;
      case 'pick':
        if (!readyToDraw()) return go('#/ask');
        S.mode = 'manual';
        renderPick();
        break;
      case 'result':
        renderResult(decodeURIComponent(m[2] || ''));
        break;
      case 'history':
        renderHistory();
        break;
      default:
        renderHome();
    }
    window.scrollTo(0, 0);
  }

  // ---------- 首頁 ----------

  function renderHome() {
    show('home');
    const last = T.store.listRecords()[0];
    const link = $('#recentLink');
    link.hidden = !last;
    if (last) {
      link.href = '#/result/' + encodeURIComponent(last.id);
      link.innerHTML = `<span class="muted small">最近一次</span><span class="recent-q">${esc(last.form.question)}</span>${icon('chevron')}`;
    }
  }

  $$('[data-start]').forEach((btn) => {
    btn.addEventListener('click', () => {
      S.mode = btn.dataset.start;
      saveDraft();
      go('#/ask');
    });
  });

  // ---------- ① 問題 ----------

  let hintTimer = null;
  let customTimeframe = false;

  const LONG_TIP =
    '塔羅最適合看三個月內的發展，時間拉得越長，準確度越低。仍然可以這樣問，建議搭配「能量運勢」牌陣（一個月一張，看半年的變化），或把問題聚焦在近期能做的事。';

  // 時間範圍：預設選項按鈕＋自訂；超過三個月仍可選，但顯示提示
  function renderTimeframe() {
    const value = S.form.timeframe || '';
    const isCustom = customTimeframe || (value && !T.TIMEFRAMES.includes(value));
    const chip = (label, active, attrs, extra = '') =>
      `<button type="button" class="chip${active ? ' is-active' : ''}" aria-pressed="${active}" ${attrs}>${label}${extra}</button>`;
    $('#timeframeChips').innerHTML =
      T.TIMEFRAMES.map((t) =>
        chip(t, !isCustom && value === t, `data-tf="${t}"`, t === '三個月內' ? '<span class="chip-badge">推薦</span>' : T.LONG_TIMEFRAMES.includes(t) ? icon('clock', 'chip-icon') : '')
      ).join('') + chip('自訂', isCustom, 'data-tf-custom');
    const input = $('#fTimeframeCustom');
    input.hidden = !isCustom;
    if (isCustom && document.activeElement !== input) input.value = value;
    const tip = $('#timeframeTip');
    tip.hidden = !T.isLongTimeframe(value);
    tip.innerHTML = icon('bulb') + `<span>${LONG_TIP}</span>`;
  }

  $('#timeframeChips').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tf], [data-tf-custom]');
    if (!btn) return;
    if (btn.dataset.tf) {
      customTimeframe = false;
      S.form.timeframe = btn.dataset.tf;
    } else {
      customTimeframe = true;
      S.form.timeframe = $('#fTimeframeCustom').value.trim();
    }
    saveDraft();
    renderTimeframe();
    if (customTimeframe) $('#fTimeframeCustom').focus();
  });

  $('#fTimeframeCustom').addEventListener('input', (e) => {
    S.form.timeframe = e.target.value.trim();
    saveDraft();
    renderTimeframe();
  });

  function syncAskInputs() {
    $$('[data-field]', view('ask')).forEach((el) => (el.value = S.form[el.dataset.field] || ''));
    if (S.form.background || S.form.gender || S.form.age) $('#moreInfo').open = true;
    renderTimeframe();
    renderCategory();
    renderQuiz();
  }

  // ---------- 類別與背景小問卷 ----------

  function renderCategory() {
    $('#categoryChips').innerHTML = T.CATEGORIES.map((c) => {
      const active = S.form.category === c;
      return `<button type="button" class="chip${active ? ' is-active' : ''}" aria-pressed="${active}" data-cat="${c}">${c}</button>`;
    }).join('');
    $('#fQuestion').placeholder = T.QUESTION_EXAMPLES[S.form.category] || '先選上面的類別，或直接寫下你想問的事';
  }

  $('#categoryChips').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cat]');
    if (!btn) return;
    // 再點一次同一個類別可以取消
    S.form.category = S.form.category === btn.dataset.cat ? '' : btn.dataset.cat;
    saveDraft();
    renderCategory();
    renderQuiz();
  });

  const quizCustom = {}; // 哪些題目點了「自訂」（只在這次瀏覽有效）

  function renderQuiz() {
    const body = $('#bgQuizBody');
    const cat = S.form.category;
    if (!cat) {
      body.innerHTML = '<p class="muted small">先選上面的類別，這裡會出現對應的問題，點選就好。</p>';
      return;
    }
    const answers = T.bgAnswersFor(S.form);
    const questions = T.bgQuestionsFor(cat, S.form).filter((q) => T.bgVisible(q, answers));
    const note = T.BG_NOTES[cat] ? `<p class="tip">${icon('bulb')}<span>${esc(T.BG_NOTES[cat])}</span></p>` : '';
    const intro = '<p class="muted small">點選就好，標 <span class="req">*</span> 的必填，其他可以跳過。回答會自動整理進 Prompt。</p>';
    const items = questions
      .map((q) => {
        const head =
          `<p class="quiz-label" id="ql-${q.id}">${esc(q.label)}` +
          (q.required ? '<span class="req" aria-label="必填">*</span>' : '') +
          (q.type === 'multi' ? '<span class="muted small">（可複選）</span>' : '') +
          (q.ai ? `<span class="ai-badge">${icon('sparkle')}AI</span>` : '') +
          '</p>';
        if (q.type === 'text') {
          return (
            `<div class="quiz-q" data-q="${q.id}">${head}` +
            `<input class="input" data-qtext="${q.id}" aria-labelledby="ql-${q.id}" maxlength="100" placeholder="${esc(q.placeholder || '')}" value="${esc(answers[q.id] || '')}"></div>`
          );
        }
        const v = answers[q.id];
        // 自訂：點了「自訂」或目前的答案不在選項裡
        const isCustom = !!q.custom && (quizCustom[q.id] || (!!v && !q.options.includes(v)));
        const on = (o) => !isCustom && (q.type === 'multi' ? (v || []).includes(o) : v === o);
        const customChip = q.custom
          ? `<button type="button" class="chip chip-sm${isCustom ? ' is-active' : ''}" aria-pressed="${isCustom}" data-qcustom="${q.id}">自訂</button>`
          : '';
        const customInput = isCustom
          ? `<input class="input quiz-custom" data-qtext="${q.id}" aria-label="${esc(q.label)}（自訂）" maxlength="50" placeholder="${esc(q.custom)}" value="${esc(v || '')}">`
          : '';
        return (
          `<div class="quiz-q" data-q="${q.id}" role="group" aria-labelledby="ql-${q.id}">${head}<div class="chips">` +
          q.options.map((o) => `<button type="button" class="chip chip-sm${on(o) ? ' is-active' : ''}" aria-pressed="${on(o)}" data-qopt="${q.id}" data-val="${esc(o)}">${esc(o)}</button>`).join('') +
          customChip +
          '</div>' +
          customInput +
          '</div>'
        );
      })
      .join('');
    const hasExtra = S.form.bgExtra && S.form.bgExtra.category === cat;
    const aiRow = T.store.getKey(activeProvider())
      ? `<div class="quiz-ai"><button type="button" class="btn btn-ghost btn-small" id="aiQuiz">${icon('sparkle')}${hasExtra ? '換一組 AI 追加問題' : 'AI 依你的問題追加幾題'}</button>` +
        '<span class="muted small">依你的問題和上面的回答，補問 2～3 題</span></div>'
      : '';
    body.innerHTML = note + intro + items + aiRow;
  }

  function setAnswer(id, value) {
    const cat = S.form.category;
    const all = Object.assign({}, S.form.bgAnswers);
    all[cat] = Object.assign({}, all[cat], { [id]: value });
    S.form.bgAnswers = all;
    saveDraft();
  }

  $('#bgQuizBody').addEventListener('click', (e) => {
    const opt = e.target.closest('[data-qopt]');
    const custom = e.target.closest('[data-qcustom]');
    if (custom) {
      const id = custom.dataset.qcustom;
      quizCustom[id] = true;
      const current = T.bgAnswersFor(S.form)[id];
      const q = T.bgQuestionsFor(S.form.category, S.form).find((x) => x.id === id);
      if (current && q.options.includes(current)) setAnswer(id, '');
      renderQuiz();
      $(`[data-qtext="${id}"]`).focus();
      return;
    }
    if (opt) {
      quizCustom[opt.dataset.qopt] = false;
      const q = T.bgQuestionsFor(S.form.category, S.form).find((x) => x.id === opt.dataset.qopt);
      const current = T.bgAnswersFor(S.form)[q.id];
      const val = opt.dataset.val;
      if (q.type === 'multi') {
        const list = (current || []).slice();
        const i = list.indexOf(val);
        if (i === -1) list.push(val);
        else list.splice(i, 1);
        setAnswer(q.id, list);
      } else {
        // 單選：再點一次取消
        setAnswer(q.id, current === val ? '' : val);
      }
      renderQuiz();
    } else if (e.target.closest('#aiQuiz')) {
      runAiQuiz();
    }
  });

  $('#bgQuizBody').addEventListener('input', (e) => {
    if (!e.target.dataset.qtext) return;
    setAnswer(e.target.dataset.qtext, e.target.value);
    updateSensitive();
  });

  async function runAiQuiz() {
    if (!S.form.question.trim()) {
      toast('先寫下你的問題，AI 才知道要補問什麼');
      $('#fQuestion').focus();
      return;
    }
    const btn = $('#aiQuiz');
    btn.disabled = true;
    btn.innerHTML = icon('sparkle') + 'AI 思考中…';
    try {
      const provider = activeProvider();
      const questions = await T.ai.suggestQuestions({ key: T.store.getKey(provider), model: savedAiModel(provider), provider, form: S.form });
      // 換一組時清掉舊的 AI 題目答案
      const cat = S.form.category;
      const kept = Object.fromEntries(Object.entries(T.bgAnswersFor(S.form)).filter(([k]) => !k.startsWith('ai')));
      S.form.bgAnswers = Object.assign({}, S.form.bgAnswers, { [cat]: kept });
      S.form.bgExtra = { category: cat, questions };
      saveDraft();
      renderQuiz();
      toast(`AI 追加了 ${questions.length} 題`);
    } catch (err) {
      renderQuiz();
      toast(err.message, { timeout: 5000 });
    }
  }

  function updateHints() {
    $('#questionHints').innerHTML = T.lintQuestion(S.form.question)
      .map((h) => `<li>${icon('bulb')}<span>${esc(h)}</span></li>`)
      .join('');
  }

  function updateSensitive() {
    $('#sensitiveBanner').hidden = !T.isSensitive([S.form.question, S.form.background].concat(T.contextLines(S.form)).join(' '));
  }

  $$('[data-field]', view('ask')).forEach((el) => {
    el.addEventListener('input', () => {
      S.form[el.dataset.field] = el.value;
      saveDraft();
      if (el.dataset.field === 'question') {
        $('#questionError').hidden = true;
        clearTimeout(hintTimer);
        hintTimer = setTimeout(updateHints, 500);
      }
      updateSensitive();
    });
  });

  function renderAsk() {
    show('ask');
    setSteps(view('ask'), 1);
    syncAskInputs();
    updateHints();
    updateSensitive();
  }

  $('#toSpread').addEventListener('click', () => {
    if (!S.form.question.trim()) {
      $('#questionError').hidden = false;
      $('#fQuestion').focus();
      return;
    }
    const missing = T.bgMissingRequired(S.form);
    if (missing.length) {
      const el = $(`.quiz-q[data-q="${missing[0].id}"]`);
      $$('.quiz-q.is-missing').forEach((x) => x.classList.remove('is-missing'));
      missing.forEach((q) => $(`.quiz-q[data-q="${q.id}"]`).classList.add('is-missing'));
      el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      toast(`請先選擇「${missing[0].label}」，AI 才能正確解讀`);
      return;
    }
    go('#/spread');
  });

  // ---------- ② 牌陣 ----------

  function renderSpread() {
    show('spread');
    setSteps(view('spread'), 2);
    const recs = T.recommendSpreads(S.form, S.aiSpreads);
    if (!currentSpread()) S.spreadId = recs[0];
    const sp = currentSpread();
    if (!S.group) S.group = sp.group;
    const count = (s) => T.getPositions(s, s.id === S.spreadId && S.withOptional).length;
    const opt = (s, rec) =>
      `<button type="button" class="spread-opt${s.id === S.spreadId ? ' is-selected' : ''}" data-spread="${s.id}" aria-pressed="${s.id === S.spreadId}">` +
      `<span class="spread-name">${rec ? icon('star', 'icon-star') : ''}${esc(s.name)}<span class="spread-count">${count(s)} 張</span></span>` +
      `<span class="spread-desc">${esc(s.description)}</span></button>`;

    const root = $('#spreadView');
    root.innerHTML = `
      <h1 class="page-title">選一個牌陣</h1>
      <p class="muted small">依你的問題，推薦：</p>
      <div class="spread-list">${recs.map((id) => opt(T.SPREAD_BY_ID[id], true)).join('')}</div>
      <div class="tabs" role="tablist" aria-label="牌陣分組">
        ${T.SPREAD_GROUPS.map((g) => `<button type="button" role="tab" class="tab${g.id === S.group ? ' is-active' : ''}" aria-selected="${g.id === S.group}" data-group="${g.id}">${g.name}</button>`).join('')}
      </div>
      <div class="spread-list">${T.SPREADS.filter((s) => s.group === S.group).map((s) => opt(s, false)).join('')}</div>
      <div class="spread-detail" id="spreadDetail"></div>`;
    renderSpreadDetail();
    $('#toDraw').textContent = S.mode === 'manual' ? '開始輸入牌' : '開始抽牌';
  }

  function renderSpreadDetail() {
    const sp = currentSpread();
    const positions = currentPositions();
    const parts = [`<h2>${esc(sp.name)}<span class="spread-count">${positions.length} 張</span></h2>`, '<div class="board board--preview" id="previewBoard"></div>'];
    parts.push('<ol class="pos-list">' + positions.map((p) => `<li><strong>${esc(p.name)}</strong>：${esc(p.meaning)}</li>`).join('') + '</ol>');
    parts.push(`<p class="muted small">適合問：${sp.examples.map((e) => `「${esc(e)}」`).join('、')}</p>`);
    if (sp.hint) parts.push(`<p class="note">${esc(sp.hint)}</p>`);
    if (sp.uprightOnly) parts.push('<p class="note">這類牌陣全部以正位解讀，用來和自己對話，而不是預測未來。</p>');
    if (sp.options) {
      parts.push(
        '<div class="option-fields">' +
          sp.options
            .map((k) => `<label class="field-label" for="opt${k}">選項 ${k} 是什麼？</label><input id="opt${k}" class="input" data-option="${k}" value="${esc(S.form.options[k])}" placeholder="例如：${k === 'A' ? '留在現在的公司' : k === 'B' ? '換工作' : '去進修'}">`)
            .join('') +
          '</div>'
      );
    }
    if (sp.optional) parts.push(`<label class="check"><input type="checkbox" id="optOptional"${S.withOptional ? ' checked' : ''}> ${esc(sp.optionalLabel)}</label>`);
    if (S.mode === 'auto' && !sp.uprightOnly) parts.push(`<label class="check"><input type="checkbox" id="optUpright"${S.uprightOnly ? ' checked' : ''}> 只用正位</label>`);
    const root = $('#spreadDetail');
    root.innerHTML = parts.join('');
    buildBoard($('#previewBoard'), sp, S.withOptional, (p, i) => `<span class="pv"><span class="pv-no">${i + 1}</span><span class="pv-name">${esc(p.name)}</span></span>`);
  }

  $('#spreadView').addEventListener('click', (e) => {
    const sp = e.target.closest('[data-spread]');
    const grp = e.target.closest('[data-group]');
    if (sp) {
      S.spreadId = sp.dataset.spread;
      S.group = currentSpread().group;
      if (!currentSpread().optional) S.withOptional = false;
      saveDraft();
      renderSpread();
      $('#spreadDetail').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
    } else if (grp) {
      S.group = grp.dataset.group;
      renderSpread();
    }
  });

  $('#spreadView').addEventListener('input', (e) => {
    if (e.target.dataset.option) {
      S.form.options[e.target.dataset.option] = e.target.value;
      saveDraft();
    }
  });

  $('#spreadView').addEventListener('change', (e) => {
    if (e.target.id === 'optOptional') {
      S.withOptional = e.target.checked;
      saveDraft();
      renderSpread();
    } else if (e.target.id === 'optUpright') {
      S.uprightOnly = e.target.checked;
      T.store.saveSettings({ uprightOnly: S.uprightOnly });
      saveDraft();
    }
  });

  const normalize = (q) => (q || '').replace(/[\s？?。.!！]/g, '');

  function recentSameQuestion() {
    const q = normalize(S.form.question);
    return T.store.listRecords().find((r) => r.mode === 'auto' && normalize(r.form.question) === q && Date.now() - r.createdAt < 864e5);
  }

  const REDRAW_MESSAGE = '<p>塔羅建議同一個問題給自己一點沉澱的時間。上一次的牌可能已經回答了你，只是還需要時間理解。確定要再抽一次嗎？</p>';

  $('#toDraw').addEventListener('click', async () => {
    const sp = currentSpread();
    if (sp.options) {
      const missing = sp.options.find((k) => !S.form.options[k].trim());
      if (missing) {
        toast(`請先寫下選項 ${missing} 是什麼，AI 才知道各選項的內容`);
        $(`#opt${missing}`).focus();
        return;
      }
    }
    if (S.mode === 'manual') {
      initPick();
      go('#/pick');
      return;
    }
    const last = recentSameQuestion();
    if (last) {
      const answer = await choose({
        title: '再抽一次之前',
        message: REDRAW_MESSAGE,
        buttons: [
          { label: '看上次的結果', value: 'last' },
          { label: '取消', value: null },
          { label: '再抽一次', value: 'draw', primary: true },
        ],
      });
      if (answer === 'last') return go('#/result/' + encodeURIComponent(last.id));
      if (answer !== 'draw') return;
    }
    go('#/draw');
  });

  // ---------- ③ 靜心與自動抽牌 ----------

  function renderDraw() {
    show('draw');
    const seconds = 5;
    let n = seconds;
    let timer = null;
    let finished = false;
    $('#drawTitle').textContent = '請在心中默念你的問題';
    $('#drawQuestion').textContent = `「${S.form.question.trim()}」`;
    $('#drawCount').textContent = n;
    $('#skipDraw').hidden = false;
    view('draw').classList.remove('is-shuffling');

    const finish = () => {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      $('#skipDraw').hidden = true;
      $('#drawTitle').textContent = '洗牌中…';
      $('#drawCount').textContent = '';
      view('draw').classList.add('is-shuffling');
      timer = setTimeout(doAutoDraw, reduceMotion ? 0 : 900);
    };
    timer = setInterval(() => {
      n -= 1;
      if (n <= 0) finish();
      else $('#drawCount').textContent = n;
    }, 1000);
    $('#skipDraw').onclick = finish;
    leaveHook = () => {
      finished = true;
      clearInterval(timer);
      clearTimeout(timer);
    };
  }

  function newRecord(mode, cards, jumpers) {
    const sp = currentSpread();
    const form = JSON.parse(JSON.stringify(S.form));
    form.options = sp.options ? Object.fromEntries(sp.options.map((k) => [k, form.options[k].trim()])) : {};
    return {
      id: Date.now().toString(36) + randInt(1296).toString(36),
      createdAt: Date.now(),
      mode,
      spreadId: sp.id,
      withOptional: !!(S.withOptional && sp.optional),
      uprightOnly: mode === 'auto' ? !!(S.uprightOnly || sp.uprightOnly) : !!sp.uprightOnly,
      form,
      cards,
      jumpers,
      clarifiers: [],
    };
  }

  function doAutoDraw() {
    leaveHook = null;
    const positions = currentPositions();
    const upright = S.uprightOnly || currentSpread().uprightOnly;
    const deck = shuffle(T.CARDS.map((c) => c.id));
    const cards = deck.slice(0, positions.length).map((id) => ({ id, reversed: upright ? false : randInt(2) === 1 }));
    finishRecord(newRecord('auto', cards, []), true);
  }

  function finishRecord(record, fresh) {
    T.store.saveRecord(record);
    S.freshId = fresh ? record.id : null;
    resetSession();
    // 用 replace，避免按返回又回到抽牌或選牌畫面
    location.replace('#/result/' + encodeURIComponent(record.id));
  }

  // ---------- ③ 手動選牌 ----------

  const PICKER_TABS = [
    { id: 'major', name: '大牌' },
    { id: 'wands', name: '權杖' },
    { id: 'cups', name: '聖杯' },
    { id: 'swords', name: '寶劍' },
    { id: 'pentacles', name: '錢幣' },
  ];

  function mountPicker(root, { state, isUsed, onPick }) {
    root.innerHTML = `
      <div class="picker">
        <div class="search-wrap">${icon('search')}<input class="input picker-search" type="search" placeholder="搜尋牌名（中文、英文、別名）" aria-label="搜尋牌名" value="${esc(state.q)}"></div>
        <div class="tabs picker-tabs" role="tablist" aria-label="牌組">
          ${PICKER_TABS.map((t) => `<button type="button" role="tab" class="tab" data-tab="${t.id}">${t.name}</button>`).join('')}
        </div>
        <div class="picker-grid"></div>
      </div>`;
    const grid = $('.picker-grid', root);
    const search = $('.picker-search', root);

    function draw() {
      const q = state.q.trim().toLowerCase();
      $$('[data-tab]', root).forEach((b) => {
        const active = !q && b.dataset.tab === state.tab;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', active);
      });
      const list = q ? T.CARDS.filter((c) => c.search.includes(q)) : T.CARDS.filter((c) => (c.suit || 'major') === state.tab);
      grid.innerHTML = list.length
        ? list
            .map((c) => {
              const used = isUsed(c.id);
              const label = q ? c.name : c.arcana === 'major' ? `<small>${c.roman}</small>${c.name}` : c.name.slice(2);
              return `<button type="button" class="pcard pcard--${c.arcana === 'major' ? 'major' : EL[c.element]}" data-card="${c.id}"${used ? ' disabled' : ''} aria-label="${esc(c.name)}${used ? '（已使用）' : ''}">${label}</button>`;
            })
            .join('')
        : '<p class="muted small">找不到符合的牌</p>';
    }

    search.addEventListener('input', () => {
      state.q = search.value;
      draw();
    });
    root.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-tab]');
      const card = e.target.closest('[data-card]');
      if (tab) {
        state.tab = tab.dataset.tab;
        state.q = '';
        search.value = '';
        draw();
      } else if (card && !card.disabled) {
        onPick(T.CARD_BY_ID[card.dataset.card]);
      }
    });
    draw();
  }

  function initPick() {
    const key = S.spreadId + (S.withOptional ? '+' : '');
    const n = currentPositions().length;
    if (S.cardsFor !== key || S.cards.length !== n) {
      S.cards = Array(n).fill(null);
      S.cardsFor = key;
    }
    const empty = S.cards.indexOf(null);
    S.active = empty === -1 ? 0 : empty;
    S.target = 'slot';
    S.orient = false;
    saveDraft();
  }

  function renderPick() {
    show('pick');
    if (S.cardsFor !== S.spreadId + (S.withOptional ? '+' : '') || S.cards.length !== currentPositions().length) initPick();
    setSteps(view('pick'), 3);
    renderPickBody();
  }

  const isUsedInPick = (id) => S.cards.some((c) => c && c.id === id) || S.jumpers.some((c) => c.id === id);

  function renderPickBody() {
    const sp = currentSpread();
    const positions = currentPositions();
    const upright = !!sp.uprightOnly;
    const filled = S.cards.filter(Boolean).length;
    const root = $('#pickView');

    const slots = positions
      .map((p, i) => {
        const c = S.cards[i];
        const active = S.target === 'slot' && i === S.active;
        return (
          `<button type="button" class="slot-btn${active ? ' is-active' : ''}" data-slot="${i}" aria-pressed="${active}" aria-label="第 ${i + 1} 張 ${esc(p.name)}${c ? '：' + esc(T.CARD_BY_ID[c.id].name) : '：尚未選牌'}">` +
          `<span class="slot-no">${i + 1}</span>` +
          (c ? faceHTML(T.CARD_BY_ID[c.id], c.reversed) : `<span class="slot-empty">${icon('plus')}</span>`) +
          `<span class="slot-name">${esc(p.name)}</span></button>`
        );
      })
      .join('');

    let panelTitle;
    let current = '';
    if (S.target === 'jumper') {
      panelTitle = '選擇一張跳出牌 <button type="button" class="link-btn" id="cancelJumper">取消</button>';
    } else {
      const p = positions[S.active];
      panelTitle = `第 ${S.active + 1} 張・${esc(p.name)}：<span class="muted">${esc(p.meaning)}</span>`;
      const c = S.cards[S.active];
      if (c) {
        current =
          `<div class="current-card">已放入：<strong>${esc(T.CARD_BY_ID[c.id].name)}・${c.reversed ? '逆位' : '正位'}</strong>` +
          (upright ? '' : '<button type="button" class="btn btn-ghost btn-small" id="flipCurrent">切換正逆位</button>') +
          '<button type="button" class="btn btn-ghost btn-small" id="clearCurrent">清除</button>' +
          '<span class="muted small">點下方的牌可以換掉</span></div>';
      }
    }

    const orient = upright
      ? '<p class="muted small">這類牌陣全部以正位解讀。</p>'
      : `<div class="orient" role="radiogroup" aria-label="正逆位">
          <button type="button" role="radio" class="seg${!S.orient ? ' is-active' : ''}" aria-checked="${!S.orient}" data-orient="0">正位</button>
          <button type="button" role="radio" class="seg${S.orient ? ' is-active' : ''}" aria-checked="${S.orient}" data-orient="1">逆位</button>
        </div>`;

    const jumpers = S.jumpers
      .map(
        (j, i) =>
          `<li><span>${esc(T.CARD_BY_ID[j.id].name)}・${j.reversed ? '逆位' : '正位'}</span>` +
          `<button type="button" class="link-btn" data-jflip="${i}">切換正逆位</button>` +
          `<button type="button" class="link-btn" data-jdel="${i}">移除</button></li>`
      )
      .join('');

    root.innerHTML = `
      <div class="pick-head"><h1 class="page-title">${esc(sp.name)}</h1><span class="muted">${filled}/${positions.length}</span></div>
      <div class="slot-row">${slots}</div>
      <div class="pick-panel">
        <p class="pick-title">${panelTitle}</p>
        ${current}
        ${orient}
        <div id="pickerMount"></div>
        <div class="jumpers">
          <p class="small"><strong>跳出牌</strong> <span class="muted">洗牌時自己掉出來的牌，會作為額外提示</span></p>
          ${jumpers ? `<ul class="jumper-list">${jumpers}</ul>` : ''}
          ${S.target === 'jumper' ? '' : `<button type="button" class="btn btn-ghost btn-small" id="addJumper">${icon('plus')}新增跳出牌</button>`}
        </div>
      </div>`;

    mountPicker($('#pickerMount'), { state: S.pickerState, isUsed: isUsedInPick, onPick: pickCard });
    $('#finishPick').disabled = filled !== positions.length;
  }

  function pickCard(card) {
    const upright = !!currentSpread().uprightOnly;
    const entry = { id: card.id, reversed: upright ? false : S.orient };
    if (S.target === 'jumper') {
      S.jumpers.push(entry);
      S.target = 'slot';
      toast(`已加入跳出牌：${card.name}`, {
        action: '復原',
        onAction: () => {
          S.jumpers = S.jumpers.filter((j) => j !== entry);
          saveDraft();
          renderPickBody();
        },
      });
    } else {
      const i = S.active;
      const prev = S.cards[i];
      S.cards[i] = entry;
      const after = S.cards.findIndex((c, k) => !c && k > i);
      const any = S.cards.indexOf(null);
      S.active = after !== -1 ? after : any !== -1 ? any : i;
      toast(`已放入第 ${i + 1} 張：${card.name}`, {
        action: '復原',
        onAction: () => {
          S.cards[i] = prev;
          S.active = i;
          saveDraft();
          renderPickBody();
        },
      });
    }
    S.orient = false;
    saveDraft();
    renderPickBody();
  }

  $('#pickView').addEventListener('click', (e) => {
    const t = e.target;
    const slot = t.closest('[data-slot]');
    if (slot) {
      S.target = 'slot';
      S.active = Number(slot.dataset.slot);
    } else if (t.closest('[data-orient]')) {
      S.orient = t.closest('[data-orient]').dataset.orient === '1';
    } else if (t.id === 'flipCurrent') {
      S.cards[S.active].reversed = !S.cards[S.active].reversed;
    } else if (t.id === 'clearCurrent') {
      S.cards[S.active] = null;
    } else if (t.id === 'addJumper') {
      S.target = 'jumper';
    } else if (t.id === 'cancelJumper') {
      S.target = 'slot';
    } else if (t.dataset.jflip) {
      const j = S.jumpers[Number(t.dataset.jflip)];
      j.reversed = !j.reversed;
    } else if (t.dataset.jdel) {
      S.jumpers.splice(Number(t.dataset.jdel), 1);
    } else {
      return;
    }
    saveDraft();
    renderPickBody();
  });

  $('#finishPick').addEventListener('click', () => {
    if (S.cards.some((c) => !c)) return;
    finishRecord(newRecord('manual', S.cards.slice(), S.jumpers.slice()), false);
  });

  // ---------- ④ 結果 ----------

  let resultState = null;

  function renderResult(id) {
    const rec = T.store.getRecord(id);
    if (!rec || !T.SPREAD_BY_ID[rec.spreadId]) {
      show('notfound');
      return;
    }
    show('result');
    setSteps(view('result'), 4);
    const fresh = S.freshId === id && !reduceMotion;
    S.freshId = null;
    resultState = { rec, dirty: false };
    drawResult(fresh);
  }

  function readingHTML(no, title, entry, meaning) {
    const { card, reversed } = entry;
    return (
      `<details class="reading"><summary><span class="reading-no">${no}</span><span>${esc(title)}｜${esc(card.name)}・${reversed ? '逆位' : '正位'}</span></summary>` +
      '<div class="reading-body">' +
      `<img class="reading-img${reversed ? ' is-rev' : ''}" src="${T.cardImage(card)}" alt="${esc(card.name)}${reversed ? '（逆位）' : ''}" loading="lazy" decoding="async">` +
      (meaning ? `<p class="muted small">牌位意義：${esc(meaning)}</p>` : '') +
      `<p class="small">${esc(card.en)}・${card.element}${card.arcana === 'major' ? '・大牌' : ''}</p>` +
      `<p><span class="kw-label">${reversed ? '逆位' : '正位'}關鍵字</span>${esc(reversed ? card.reversed : card.upright)}</p>` +
      '</div></details>'
    );
  }

  function statsHTML(entries) {
    if (entries.length < 2) return '';
    const s = T.analyze(entries);
    const lines = T.statsLines(s).map((l) => `<li>${esc(l)}</li>`);
    const max = Math.max(...T.ELEMENTS.map((e) => s.elements[e]));
    const strong = T.ELEMENTS.filter((e) => s.elements[e] === max && max > 0);
    if (strong.length && strong.length < 4) lines.push(`<li>偏多的元素：${strong.map((e) => `${e}（${T.ELEMENT_MEANINGS[e].domain}）`).join('、')}</li>`);
    s.repeats.forEach((r) => {
      const m = T.NUMBER_MEANINGS[r.number];
      lines.push(`<li>數字 ${esc(T.numberLabel(r.number))}・${esc(m.theme)}：能量好時是「${esc(m.high)}」，低落時是「${esc(m.low)}」</li>`);
    });
    if (s.courts >= 2) lines.push('<li>宮廷牌較多：通常代表這件事牽涉的人比較多</li>');
    return `<details class="stats" open><summary>牌面統計</summary><ul>${lines.join('')}</ul></details>`;
  }

  // newExtra：剛補上的那張額外牌的索引，播放翻牌動畫
  function drawResult(fresh, newExtra = -1) {
    const { rec } = resultState;
    const sp = T.SPREAD_BY_ID[rec.spreadId];
    const positions = T.getPositions(sp, rec.withOptional);
    const main = T.entriesOf(rec.cards);
    const jumpers = T.entriesOf(rec.jumpers);
    const clarifiers = T.entriesOf(rec.clarifiers);
    const f = rec.form;

    const options = sp.options ? `<p class="small">${sp.options.map((k) => `選項 ${k}：${esc(f.options[k])}`).join('　')}</p>` : '';
    const readings = positions.map((p, i) => readingHTML(i + 1, p.name, main[i], p.meaning)).join('');
    const extra = (title, list) => (list.length ? `<h3 class="sub-title">${title}</h3>` + list.map((e, i) => readingHTML('＋', `${title} ${i + 1}`, e, '')).join('') : '');
    const canClarify = rec.clarifiers.length < MAX_CLARIFIERS;

    // 跳出牌與指引牌不屬於牌陣位置，排在牌陣圖下方
    const extraCards = jumpers
      .map((e, i) => ({ e, label: `跳出牌 ${i + 1}` }))
      .concat(clarifiers.map((e, i) => ({ e, label: `指引牌 ${i + 1}` })));
    const extrasHTML = extraCards.length
      ? '<div class="extras"><p class="extras-title">額外的牌</p><div class="extras-row" id="extraCards">' +
        extraCards
          .map(
            (x, i) =>
              `<figure class="extra"><div class="bslot"><div class="flip${i === newExtra ? '' : ' is-flipped'}"><div class="face face-back" aria-hidden="true"></div>` +
              `<div class="face face-front">${faceHTML(x.e.card, x.e.reversed)}</div></div></div><figcaption>${x.label}</figcaption></figure>`
          )
          .join('') +
        '</div></div>'
      : '';

    $('#resultView').innerHTML = `
      <div class="result-grid">
        <div class="result-main">
          <h1 class="result-q">${esc(f.question)}</h1>
          <p class="muted small">${esc(sp.name)}・${rec.mode === 'manual' ? '實體牌' : '系統抽牌'}・${formatDate(rec.createdAt)}</p>
          ${options}
          <div class="board-wrap"><div class="board" id="resultBoard"></div></div>
          ${extrasHTML}
          ${fresh ? '<p class="center"><button type="button" class="btn btn-ghost btn-small" id="revealAll">全部翻開</button></p>' : ''}
          <div class="readings">${readings}${extra('跳出牌', jumpers)}${extra('指引牌', clarifiers)}</div>
          ${statsHTML(main)}
          <div class="row-actions">
            <button type="button" class="btn btn-ghost" id="addClarifier"${canClarify ? '' : ' disabled'}>${canClarify ? '補一張指引牌' : `最多補 ${MAX_CLARIFIERS} 張`}</button>
            ${rec.mode === 'auto' ? '<button type="button" class="btn btn-ghost" id="redraw">重新抽牌</button>' : ''}
            <button type="button" class="btn btn-ghost" id="restart">重新開始</button>
            <button type="button" class="btn btn-ghost btn-danger" id="deleteRecord">刪除這筆紀錄</button>
          </div>
        </div>
        <aside class="result-side">
          <h2 class="sub-title">解牌 Prompt</h2>
          <div class="field-grid">
            <div><label class="field-label" for="tone">語氣</label>
              <select id="tone" class="input">${Object.entries(T.TONES).map(([k, v]) => `<option value="${k}"${k === settings.tone ? ' selected' : ''}>${v.label}</option>`).join('')}</select></div>
            <div><label class="field-label" for="length">長度</label>
              <select id="length" class="input">${Object.entries(T.LENGTHS).map(([k, v]) => `<option value="${k}"${k === settings.length ? ' selected' : ''}>${v.label}（約 ${v.chars} 字）</option>`).join('')}</select></div>
          </div>
          <textarea id="promptText" class="input prompt-text" rows="16" aria-label="解牌 Prompt，可以直接修改" spellcheck="false"></textarea>
          <p class="muted small">Prompt 長度：<span id="promptCount"></span> 字（不是 AI 回答的長度）・可以直接修改</p>
          <div class="actionbar actionbar--fixed">
            <button type="button" class="btn btn-primary btn-block" id="copyPrompt">${COPY_LABEL}</button>
          </div>
          <p class="muted small center" id="copyHint" hidden>貼到 ChatGPT、Claude 或 Gemini 的對話框</p>
        </aside>
      </div>`;

    buildBoard($('#resultBoard'), sp, rec.withOptional, (p, i) => {
      const e = main[i];
      return (
        `<div class="flip${fresh ? '' : ' is-flipped'}"><div class="face face-back" aria-hidden="true"></div><div class="face face-front">${faceHTML(e.card, e.reversed)}</div></div>` +
        `<span class="bslot-no" title="${esc(p.name)}">${i + 1}</span>`
      );
    });
    fitBoard($('#resultBoard'));
    if (newExtra >= 0) {
      const card = $$('#extraCards .extra')[newExtra];
      card.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      setTimeout(() => $('.flip', card).classList.add('is-flipped'), reduceMotion ? 0 : 500);
    }
    if (fresh) {
      const flips = $$('#resultBoard .flip');
      flips.forEach((el, i) => setTimeout(() => el.classList.add('is-flipped'), 400 + i * 350));
      const reveal = $('#revealAll');
      reveal.onclick = () => {
        flips.forEach((el) => el.classList.add('is-flipped'));
        reveal.hidden = true;
      };
      setTimeout(() => reveal && (reveal.hidden = true), 400 + flips.length * 350);
    }
    fillPrompt();
  }

  function fillPrompt() {
    const ta = $('#promptText');
    ta.value = T.buildPrompt(resultState.rec, settings);
    resultState.dirty = false;
    $('#promptCount').textContent = ta.value.length;
  }

  async function confirmOverwrite() {
    if (!resultState.dirty) return true;
    const answer = await choose({
      title: '重新產生 Prompt',
      message: '<p>重新產生會蓋掉你對 Prompt 的修改，確定嗎？</p>',
      buttons: [
        { label: '取消', value: false },
        { label: '重新產生', value: true, primary: true },
      ],
    });
    return !!answer;
  }

  $('#resultView').addEventListener('input', (e) => {
    if (e.target.id === 'promptText') {
      resultState.dirty = true;
      $('#promptCount').textContent = e.target.value.length;
    }
  });

  $('#resultView').addEventListener('change', async (e) => {
    const id = e.target.id;
    if (id !== 'tone' && id !== 'length') return;
    if (!(await confirmOverwrite())) {
      e.target.value = settings[id];
      return;
    }
    settings[id] = e.target.value;
    T.store.saveSettings({ [id]: e.target.value });
    fillPrompt();
    // 語氣與長度寫在 Prompt 中段的 output 區，捲過去讓使用者看到改了什麼
    revealPromptLine(id === 'tone' ? '  tone:' : '  length:');
    const label = id === 'tone' ? T.TONES[settings.tone].label : `${T.LENGTHS[settings.length].label}（約 ${T.LENGTHS[settings.length].chars} 字）`;
    toast(`Prompt 已更新：${id === 'tone' ? '語氣' : '長度'}改為「${label}」`);
  });

  function revealPromptLine(prefix) {
    const ta = $('#promptText');
    const index = ta.value.split('\n').findIndex((l) => l.startsWith(prefix));
    if (index === -1) return;
    const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 22;
    ta.scrollTop = Math.max(0, (index - 2) * lineHeight);
    ta.classList.remove('is-updated');
    void ta.offsetWidth;
    ta.classList.add('is-updated');
  }

  $('#resultView').addEventListener('click', async (e) => {
    const id = e.target.id;
    const rec = resultState && resultState.rec;
    if (!rec) return;
    if (id === 'copyPrompt') {
      const ta = $('#promptText');
      const btn = e.target;
      if (await copyText(ta.value, null)) {
        btn.innerHTML = icon('check') + '已複製';
        $('#copyHint').hidden = false;
        setTimeout(() => (btn.innerHTML = COPY_LABEL), 2000);
      } else {
        ta.focus();
        ta.select();
        toast('請長按（手機）或按 Ctrl+C（電腦）複製', { timeout: 5000 });
      }
    } else if (id === 'addClarifier') {
      if (!(await confirmOverwrite())) return;
      if (rec.mode === 'auto') {
        const used = new Set(rec.cards.concat(rec.jumpers, rec.clarifiers).map((c) => c.id));
        const rest = T.CARDS.filter((c) => !used.has(c.id));
        const card = rest[randInt(rest.length)];
        addClarifier({ id: card.id, reversed: rec.uprightOnly ? false : randInt(2) === 1 });
      } else {
        openClarifierPicker(rec);
      }
    } else if (id === 'redraw') {
      const answer = await choose({
        title: '再抽一次之前',
        message: REDRAW_MESSAGE,
        buttons: [
          { label: '取消', value: null },
          { label: '再抽一次', value: 'draw', primary: true },
        ],
      });
      if (answer !== 'draw') return;
      Object.assign(S, { mode: 'auto', form: JSON.parse(JSON.stringify(rec.form)), spreadId: rec.spreadId, withOptional: rec.withOptional, uprightOnly: settings.uprightOnly });
      S.form.options = Object.assign(emptyForm().options, S.form.options);
      saveDraft();
      go('#/draw');
    } else if (id === 'restart') {
      resetSession();
      go('#/');
    } else if (id === 'deleteRecord') {
      const ok = await choose({
        title: '刪除這筆紀錄',
        message: '<p>刪除後無法復原，確定嗎？</p>',
        buttons: [
          { label: '取消', value: false },
          { label: '刪除', value: true, primary: true, danger: true },
        ],
      });
      if (!ok) return;
      T.store.deleteRecord(rec.id);
      toast('已刪除');
      go('#/history');
    }
  });

  function addClarifier(entry) {
    const { rec } = resultState;
    rec.clarifiers.push(entry);
    T.store.saveRecord(rec);
    drawResult(false, rec.jumpers.length + rec.clarifiers.length - 1);
    toast(`已補上指引牌：${T.CARD_BY_ID[entry.id].name}・${entry.reversed ? '逆位' : '正位'}`);
  }

  function openClarifierPicker(rec) {
    const dlg = $('#pickDialog');
    const upright = !!rec.uprightOnly;
    let reversed = false;
    const orientRoot = $('#pickDialogOrient');
    const drawOrient = () => {
      orientRoot.innerHTML = upright
        ? ''
        : `<button type="button" class="seg${!reversed ? ' is-active' : ''}" data-o="0">正位</button><button type="button" class="seg${reversed ? ' is-active' : ''}" data-o="1">逆位</button>`;
    };
    orientRoot.onclick = (e) => {
      const b = e.target.closest('[data-o]');
      if (!b) return;
      reversed = b.dataset.o === '1';
      drawOrient();
    };
    drawOrient();
    const used = new Set(rec.cards.concat(rec.jumpers, rec.clarifiers).map((c) => c.id));
    mountPicker($('#pickDialogPicker'), {
      state: { tab: 'major', q: '' },
      isUsed: (id) => used.has(id),
      onPick: (card) => {
        dlg.close();
        addClarifier({ id: card.id, reversed: upright ? false : reversed });
      },
    });
    dlg.showModal();
  }

  // ---------- 占卜紀錄 ----------

  function renderHistory() {
    show('history');
    const list = T.store.listRecords();
    const root = $('#historyView');
    if (!list.length) {
      root.innerHTML = '<div class="empty"><p>還沒有占卜紀錄</p><a class="btn btn-primary" href="#/">開始第一次占卜</a></div>';
      return;
    }
    root.innerHTML =
      '<ul class="history-list">' +
      list
        .map((r) => {
          const sp = T.SPREAD_BY_ID[r.spreadId];
          return (
            `<li><a class="history-item" href="#/result/${encodeURIComponent(r.id)}">` +
            `<span class="h-q">${esc(r.form.question)}</span>` +
            `<span class="h-meta">${formatDate(r.createdAt)}・${sp ? esc(sp.name) : ''}・${r.mode === 'manual' ? '實體牌' : '系統抽牌'}</span></a>` +
            `<button type="button" class="icon-btn" data-del="${esc(r.id)}" aria-label="刪除這筆紀錄">${icon('close')}</button></li>`
          );
        })
        .join('') +
      '</ul><p class="center"><button type="button" class="btn btn-ghost btn-danger" id="clearAll">全部清除</button></p>';
  }

  $('#historyView').addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del]');
    if (del) {
      T.store.deleteRecord(del.dataset.del);
      renderHistory();
      toast('已刪除');
    } else if (e.target.id === 'clearAll') {
      const ok = await choose({
        title: '全部清除',
        message: '<p>所有占卜紀錄都會刪除，無法復原，確定嗎？</p>',
        buttons: [
          { label: '取消', value: false },
          { label: '全部清除', value: true, primary: true, danger: true },
        ],
      });
      if (!ok) return;
      T.store.clearRecords();
      renderHistory();
    }
  });

  // ---------- 設定 ----------

  function activeProvider() { return settings.ai.provider === 'google' ? 'google' : 'openai'; }
  function savedAiModel(provider) { return provider === 'google' ? settings.ai.googleModel : settings.ai.model; }

  T.setupAiSettings({ settings, icon, onSaved: () => {
    if (!view('ask').hidden) renderQuiz();
    toast('設定已儲存');
  } });

  // ---------- AI 問題整理 ----------

  const aiDlg = $('#aiDialog');
  let aiCtrl = null;

  $('#openAi').addEventListener('click', () => {
    aiDlg.showModal();
    const key = T.store.getKey(activeProvider());
    const followUp = T.ai.clarify(S.form);
    if (followUp) renderAiResult(followUp, key);
    else if (key) runAiApi(key);
    else renderAiManual();
  });

  $('#jumpToAi').addEventListener('click', () => {
    $('#aiTidy').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  });

  aiDlg.addEventListener('close', () => {
    if (aiCtrl) aiCtrl.abort();
    aiCtrl = null;
  });

  async function runAiApi(key) {
    const body = $('#aiBody');
    body.innerHTML = '<p class="ai-loading" aria-live="polite">整理中…</p><button type="button" class="btn btn-ghost" id="aiCancel">取消</button>';
    aiCtrl = new AbortController();
    const ctrl = aiCtrl;
    $('#aiCancel').onclick = () => ctrl.abort();
    try {
      const provider = activeProvider();
      const res = await T.ai.suggest({ key, model: savedAiModel(provider), provider, form: S.form, signal: ctrl.signal });
      if (ctrl !== aiCtrl) return;
      renderAiResult(res, key);
    } catch (err) {
      if (ctrl !== aiCtrl) return;
      if (err.code === 'aborted') {
        aiDlg.close();
        return;
      }
      body.innerHTML =
        `<p class="error">${esc(err.message)}</p>` +
        (err.raw ? `<p class="small">AI 的原始回覆：</p><pre class="raw">${esc(err.raw)}</pre>` : '') +
        '<button type="button" class="btn btn-primary btn-block" id="aiFallback">改用免費的複製貼上方式</button>';
      $('#aiFallback').onclick = renderAiManual;
    }
  }

  function renderAiResult(res, key) {
    const body = $('#aiBody');
    if (!res.questions.length) {
      if (res.followUp) {
        body.innerHTML = `
          <p>先補充一點背景：</p>
          <p class="followup">${esc(res.followUp)}</p>
          <label class="field-label" for="aiFollow">你的回答</label>
          <textarea id="aiFollow" class="input" rows="3"></textarea>
          <button type="button" class="btn btn-primary btn-block" id="aiFollowSend">送出</button>`;
        $('#aiFollowSend').onclick = () => {
          const answer = $('#aiFollow').value.trim();
          if (!answer) return $('#aiFollow').focus();
          S.form.background = (S.form.background ? S.form.background + '\n' : '') + `補充（${res.followUp}）：${answer}`;
          saveDraft();
          syncAskInputs();
          const followUp = T.ai.clarify(S.form);
          if (followUp) renderAiResult(followUp, key);
          else if (key) runAiApi(key);
          else renderAiManual();
        };
        return;
      }
      body.innerHTML = '<p>沒有抓到建議問題。請確認貼上的是 AI 的完整回覆，或直接從 AI 的回覆複製你想要的那一句，貼到問題框。</p><button type="button" class="btn btn-ghost btn-block" data-close>關閉</button>';
      return;
    }
    const meta = [
      res.category && `類別：${res.category}`,
      res.timeframe && `時間範圍：${res.timeframe}`,
      res.spreads.length && `牌陣：${res.spreads.map((id) => T.SPREAD_BY_ID[id].name).join('、')}`,
    ].filter(Boolean);
    body.innerHTML =
      '<p>點一個你想用的問題：</p><div class="ai-list">' +
      res.questions
        .map((q, i) => `<button type="button" class="ai-suggestion" data-ai="${i}"><span class="ai-q">${esc(q.text)}</span>${q.why ? `<span class="ai-why">${esc(q.why)}</span>` : ''}</button>`)
        .join('') +
      '</div>' +
      (meta.length ? `<p class="muted small">AI 建議・${esc(meta.join('・'))}</p>` : '');
    $$('[data-ai]', body).forEach((btn) => (btn.onclick = () => applySuggestion(res, Number(btn.dataset.ai))));
  }

  function applySuggestion(res, i) {
    const original = S.form.question.trim();
    const chosen = res.questions[i].text;
    if (original && original !== chosen && !S.form.background.includes(original)) {
      S.form.background = `原本的描述：${original}` + (S.form.background ? '\n' + S.form.background : '');
    }
    S.form.question = chosen;
    // 使用者已經選了類別就尊重他的選擇，沒選才用 AI 建議的
    if (res.category && !S.form.category) S.form.category = res.category;
    // AI 常回「三個月」，對應到選項「三個月內」
    if (res.timeframe) S.form.timeframe = T.TIMEFRAMES.includes(res.timeframe + '內') ? res.timeframe + '內' : res.timeframe;
    if (res.spreads.length) {
      S.aiSpreads = res.spreads;
      S.spreadId = null;
      S.group = null;
    }
    saveDraft();
    syncAskInputs();
    updateHints();
    updateSensitive();
    aiDlg.close();
    toast('已填入問題，原本的描述移到「其他補充」');
    // 按鈕在問卷下方，套用後捲回問題框讓使用者看到更新
    const q = $('#fQuestion');
    q.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    q.classList.remove('is-updated');
    void q.offsetWidth;
    q.classList.add('is-updated');
  }

  function renderAiManual() {
    const body = $('#aiBody');
    body.innerHTML = `
      <ol class="ai-steps">
        <li>按下面的按鈕，複製「整理問題 Prompt」</li>
        <li>貼到 ChatGPT、Claude 或 Gemini</li>
        <li>把 AI 的回覆整段貼回下面的框</li>
      </ol>
      <button type="button" class="btn btn-primary btn-block" id="aiCopy">${icon('copy')}複製整理問題 Prompt</button>
      <label class="field-label" for="aiPaste">AI 的回覆</label>
      <textarea id="aiPaste" class="input" rows="6" placeholder="把 AI 的回覆貼在這裡"></textarea>
      <button type="button" class="btn btn-ghost btn-block" id="aiParse">整理成建議</button>
      <p class="muted small">有 OpenAI 或 Google AI Studio 的 key？到「⚙ 設定」填入即可一鍵整理。</p>`;
    $('#aiCopy').onclick = async () => {
      const ok = await copyText(T.ai.buildPrompt(S.form, 'list'));
      toast(ok ? '已複製，貼到 AI 的對話框吧' : '複製失敗，請再試一次');
    };
    $('#aiParse').onclick = () => {
      const text = $('#aiPaste').value.trim();
      if (!text) return $('#aiPaste').focus();
      const res = T.ai.parseList(text);
      if (!res.questions.length && !res.followUp) {
        toast('回覆中沒有可匯入的建議問題。若 AI 拒答或要求補充，請先在原對話中確認，再貼回完整建議。');
        return;
      }
      renderAiResult(res, null);
    };
  }

  // ---------- 對話框與頁尾 ----------

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) e.target.closest('dialog').close();
  });

  const INFO = {
    about: {
      title: '關於本站',
      message:
        '<p><strong>問牌 Prompt</strong>｜塔羅抽牌與 AI 解牌 Prompt 產生器</p>' +
        '<p>作者：<a href="https://github.com/bruce-yang-422" target="_blank" rel="noopener noreferrer" aria-label="Bruce Yang 的 GitHub（另開新分頁）">Bruce Yang ↗</a></p>' +
        // 發布新版時同步更新此日期，避免將瀏覽日期誤當作最後更新日期。
        '<p>最後更新日期：<time datetime="2026-10-27">2026 年 10 月 27 日</time></p>',
    },
    disclaimer: {
      title: '免責聲明',
      message:
        '<p>塔羅解讀僅供參考與自我覺察，不能取代醫療、法律、財務、心理等專業意見。</p><p>本網站只負責整理解牌 Prompt，解讀內容由你選用的 AI 服務產生，請自行判斷。</p>',
    },
    privacy: {
      title: '隱私說明',
      message:
        '<p>你的問題與占卜紀錄只存在你自己的瀏覽器。本網站沒有伺服器，不會收集任何資料。</p><p>使用 API 整理時，問題會直接送到你選擇的 OpenAI 或 Google，適用該服務的資料使用政策；Google 免費與付費額度的資料使用方式可能不同。複製 Prompt 貼到 AI 服務後，也適用該服務的隱私政策。</p>',
    },
  };

  INFO.credits = {
    title: '牌圖出處',
    message:
      '<p>Rider–Waite–Smith 塔羅，Pamela Colman Smith 繪，1909 年出版，已屬公有領域。</p><p>圖檔取自 <a href="https://commons.wikimedia.org/wiki/Category:Rider-Waite_tarot_deck_(Roses_%26_Lilies)" target="_blank" rel="noopener">Wikimedia Commons</a>。</p>',
  };

  $$('[data-info]').forEach((btn) => {
    btn.addEventListener('click', () => choose(Object.assign({ buttons: [{ label: '知道了', value: true, primary: true }] }, INFO[btn.dataset.info])));
  });

  // ---------- 啟動 ----------

  if (!T.store.available) $('#storageWarning').hidden = false;

  // PWA：註冊 Service Worker（只在 https 或 localhost；直接雙擊開檔的 file:// 不支援）
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  window.addEventListener('hashchange', route);
  route();
})();
