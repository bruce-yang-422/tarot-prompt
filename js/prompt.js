// 牌面統計、問題提示與解牌 Prompt 產生。
(function () {
  const T = (window.Tarot = window.Tarot || {});

  T.CATEGORIES = ['感情', '事業', '財運', '健康', '人際', '學業', '自我成長', '其他'];
  T.TIMEFRAMES = ['一週內', '一個月內', '三個月內', '半年內', '一年內', '一年以上'];
  // 超過三個月：可以選，但提醒準確度會下降
  T.LONG_TIMEFRAMES = ['半年內', '一年內', '一年以上'];
  T.isLongTimeframe = (t) => T.LONG_TIMEFRAMES.includes(t) || /年|輩子/.test(t || '');

  T.TONES = {
    gentle: { label: '溫柔療癒', text: '語氣溫柔、有同理心，著重療癒與鼓勵，但不迴避牌面揭示的課題' },
    direct: { label: '直白犀利', text: '直接坦率、不繞圈子，清楚指出問題與盲點' },
    psych: { label: '心理學取向', text: '從心理學與自我覺察的角度解讀，把牌視為內在狀態的投射' },
    mystic: { label: '傳統神秘', text: '以傳統塔羅的象徵與意象解讀，保留儀式感' },
  };

  T.LENGTHS = {
    short: { label: '簡短', chars: 300 },
    standard: { label: '標準', chars: 800 },
    long: { label: '詳細', chars: 1500 },
  };

  const REVERSED_RULES = [
    '逆位不一定代表負面。請依牌陣脈絡，為每張逆位牌選擇最合適的解讀方式，並說明你採用哪一種：',
    '1. 維持正位意義：與其他牌搭配時，正逆位差異不大',
    '2. 能量不足：具備正位的能量但不夠充足，是目前需要學習的課題',
    '3. 能量過多：正位的能量過頭，需要調節',
    '4. 回推前一張牌：塔羅順序中的前一張牌，其課題尚未完成（例如太陽逆位回到月亮）',
    '5. 相反含義：取正位意義的反面',
    '6. 取牌面元素：直接用牌面上的畫面元素對應問題',
    '7. 視為「沒有」：多張逆位都呈現能量不足時，可解讀為沒有、結束、沒有發展空間',
  ];

  // entries: [{ card, reversed }]，只統計牌陣中的牌（不含跳出牌與指引牌）
  T.analyze = function (entries) {
    const s = { total: entries.length, major: 0, minor: 0, upright: 0, reversed: 0, courts: 0, elements: { 火: 0, 水: 0, 風: 0, 土: 0 }, repeats: [] };
    const numbers = {};
    entries.forEach(({ card, reversed }) => {
      card.arcana === 'major' ? s.major++ : s.minor++;
      reversed ? s.reversed++ : s.upright++;
      s.elements[card.element]++;
      if (card.court) s.courts++;
      else if (card.arcana === 'minor') numbers[card.number] = (numbers[card.number] || 0) + 1;
    });
    s.repeats = Object.keys(numbers)
      .filter((n) => numbers[n] > 1)
      .map((n) => ({ number: Number(n), count: numbers[n] }));
    return s;
  };

  T.numberLabel = (n) => (n === 1 ? 'Ace（一）' : String(n));

  T.statsLines = function (s) {
    const repeats = s.repeats.length ? s.repeats.map((r) => `${T.numberLabel(r.number)} 出現 ${r.count} 次`).join('、') : '無';
    return [
      `大牌 ${s.major} 張、小牌 ${s.minor} 張；正位 ${s.upright} 張、逆位 ${s.reversed} 張`,
      `元素分布：${T.ELEMENTS.map((e) => `${e} ${s.elements[e]}`).join('、')}（大牌依黃金黎明體系的占星對應計入）`,
      `宮廷牌 ${s.courts} 張；重複數字：${repeats}`,
    ];
  };

  T.entriesOf = function (list) {
    return (list || []).filter(Boolean).map((x) => ({ card: T.CARD_BY_ID[x.id], reversed: !!x.reversed }));
  };

  const orient = (reversed) => (reversed ? '逆位' : '正位');

  T.buildPrompt = function (record, prefs) {
    const spread = T.SPREAD_BY_ID[record.spreadId];
    const f = record.form || {};
    const positions = T.getPositions(spread, record.withOptional, f.timeframe);
    const self = spread.type === 'self';
    const main = T.entriesOf(record.cards);
    const jumpers = T.entriesOf(record.jumpers);
    const clarifiers = T.entriesOf(record.clarifiers);
    const tone = T.TONES[prefs.tone] || T.TONES.gentle;
    const length = T.LENGTHS[prefs.length] || T.LENGTHS.standard;
    const stats = T.analyze(main);

    // 設定寫成 YAML；字串一律用 JSON 雙引號格式，使用者輸入含冒號、引號或換行也不會破壞格式
    const q = (s) => JSON.stringify(String(s));
    const Y = [];
    Y.push('querent:', `  question: ${q(f.question)}`);
    if (f.category) Y.push(`  category: ${q(f.category)}`);
    if (f.timeframe) Y.push(`  timeframe: ${q(f.timeframe)}`);
    const context = T.contextLines ? T.contextLines(f) : [];
    if (context.length) Y.push('  context:', ...context.map((c) => `    - ${q(c)}`));
    if (f.background) Y.push(`  background: ${q(f.background)}`);
    if (f.gender) Y.push(`  gender: ${q(f.gender)}`);
    if (f.age) Y.push(`  age: ${Number(f.age) || q(f.age)}`);
    if (spread.options) {
      Y.push('options:');
      spread.options.forEach((k) => Y.push(`  ${k}: ${q((f.options && f.options[k]) || '（未填）')}`));
    }
    Y.push('spread:', `  name: ${q(spread.name)}`, `  card_count: ${positions.length}`);
    Y.push(`  draw_method: ${q(record.mode === 'manual' ? '求問者使用實體塔羅牌親手抽牌' : '線上系統隨機抽牌')}`);
    if (self) Y.push(`  orientation_rule: ${q('本牌陣為自我探索牌陣，所有牌以正位解讀')}`);
    else if (record.uprightOnly) Y.push(`  orientation_rule: ${q('本次只使用正位，不考慮逆位')}`);

    const anyReversed = main.concat(jumpers, clarifiers).some((e) => e.reversed);
    if (anyReversed && !self) {
      Y.push('reversed_reading_rules:', `  instruction: ${q(REVERSED_RULES[0])}`, '  methods:');
      REVERSED_RULES.slice(1).forEach((r) => Y.push(`    - ${q(r.replace(/^\d+\.\s*/, ''))}`));
    }

    const req = self
      ? ['描述每張牌的畫面與象徵，連結到牌位意義', '針對每張牌提出 1～2 個引導我自我覺察的問題', '整理出我可以帶走的一個洞察']
      : ['逐張解讀：結合牌位意義與正逆位', '說明牌與牌之間的關聯，串成完整的故事', '給出具體可行的行動建議', '最後用一句話總結'];
    req.push(...typeRequirements(spread, record, stats));
    if (f.timeframe) req.push(`本次解讀、未來發展與行動建議必須以 querent.timeframe「${f.timeframe}」為準，不得自行延長或改成其他時間範圍；問題或背景若提及其他期間，仍以此選擇為準；過去牌位僅作背景，不延長未來預測期間`);
    if (T.isLongTimeframe(f.timeframe)) req.push('所選時間範圍較長，較遠的發展只作方向參考，請說明不確定性，但不可擅自改變使用者選擇的時間範圍');
    Y.push('requirements:', ...req.map((r) => `  - ${q(r)}`));

    Y.push('output:', `  tone: ${q(tone.text)}`, `  length: ${q(`約 ${length.chars} 字`)}`, `  language: ${q('繁體中文')}`, '  notes:');
    if (self) Y.push(`    - ${q('重點是幫助我看見內心的想法，而不是預測未來')}`);
    Y.push(`    - ${q('避免宿命論或絕對的斷言')}`, `    - ${q('若問題涉及健康、法律或財務，請提醒我諮詢專業人士')}`);

    // 牌面資料寫成 JSON
    const cardJson = (e) => ({ card: e.card.name, card_en: e.card.en, orientation: orient(e.reversed) });
    const data = {
      cards: positions.map((p, i) => Object.assign({ no: i + 1, position: p.name, position_meaning: p.meaning }, main[i] ? cardJson(main[i]) : {})),
    };
    if (jumpers.length) data.jumpers = { note: '洗牌時自行跳出的牌，請作為額外提示參考', cards: jumpers.map(cardJson) };
    if (clarifiers.length) data.clarifiers = { note: '解讀後補抽的指引牌，用來釐清整體訊息', cards: clarifiers.map(cardJson) };
    if (main.length > 1) {
      data.stats = {
        major_arcana: stats.major,
        minor_arcana: stats.minor,
        upright: stats.upright,
        reversed: stats.reversed,
        elements: stats.elements,
        elements_note: '大牌依黃金黎明體系的占星對應計入',
        court_cards: stats.courts,
        repeated_numbers: stats.repeats,
      };
    }

    return [
      '你是一位經驗豐富的塔羅解讀師，熟悉偉特—史密斯（Rider–Waite–Smith）塔羅體系。請根據下方的設定（YAML）與牌面資料（JSON）為我解牌。',
      '',
      '```yaml',
      ...Y,
      '```',
      '',
      '```json',
      JSON.stringify(data, null, 2),
      '```',
    ].join('\n');
  };

  function typeRequirements(spread, record, stats) {
    switch (spread.type) {
      case 'yesno':
        return ['明確給出傾向（是／否／不明），並結合牌義說明理由'];
      case 'timeline':
        return [record.withOptional ? '依時間順序說明趨勢，最後以「建議」牌收尾' : '依時間順序說明趨勢'];
      case 'fortune':
        return ['依牌位標示的時間階段依序說明運勢，指出哪些階段的牌與問題主題相關；只有牌位明確標示月份時才逐月解讀，不得延長所選時間範圍；若都不相關，請誠實說明這段期間看不出跡象，並建議可以從哪裡著手'];
      case 'relation':
        return ['第 2、3 張若為人物牌，請留意兩張牌人物的眼神方向、表情與互動'];
      case 'choice':
        return ['最後判斷以「結果」位置為主，比較各選項的優缺點；不要替我做決定，而是幫我看清各選項'];
      case 'overview': {
        const tone =
          stats.upright === stats.reversed
            ? '正逆位數量相同，請說明兩股能量如何並存'
            : `本次正位 ${stats.upright} 張、逆位 ${stats.reversed} 張，請以${stats.upright > stats.reversed ? '正位' : '逆位'}為解讀主調、${stats.upright > stats.reversed ? '逆位' : '正位'}為副調`;
        return [tone, '依元素多寡分析能量分布，指出偏多與缺少的元素'];
      }
      case 'self':
        return spread.id === 'core' ? ['把 10 張牌整理成 10 句「我……」開頭的自我宣言'] : [];
      default:
        return [];
    }
  }

  // 問題寫法的即時提示：只提示、不阻擋，最多兩則
  T.lintQuestion = function (q) {
    q = (q || '').trim();
    if (!q) return [];
    const hints = [];
    if (/(他|她|對方|老闆|主管|同事|家人|伴侶|男友|女友|老公|老婆)(會不會|是不是|有沒有|喜不喜歡|愛不愛|會)/.test(q)) {
      hints.push('試著以自己為主角，例如「我該如何面對……？」');
    } else if (/(能不能|有沒有|會不會|可不可以|是不是)/.test(q)) {
      hints.push('試試肯定句：「我要如何……？」');
    }
    if (/(幾歲|什麼時候會|何時會|這輩子|一輩子|命中注定)/.test(q)) hints.push('塔羅最適合看三個月內的事，可以縮小時間範圍');
    if (q.length < 6) hints.push('多寫一點背景，解讀會更具體');
    return hints.slice(0, 2);
  };

  T.isSensitive = (text) => /(自殺|輕生|不想活|想死|去死|結束生命|自殘|割腕|跳樓|活不下去|了結自己)/.test(text || '');
})();
