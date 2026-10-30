// 16 種牌陣資料與牌陣推薦規則。
// layout.cells 依牌位順序給 [欄, 列, 旋轉角度]，optional 牌位接在後面。
(function () {
  const T = (window.Tarot = window.Tarot || {});

  T.SPREAD_GROUPS = [
    { id: 'quick', name: '快速指引' },
    { id: 'time', name: '時間與趨勢' },
    { id: 'relation', name: '人際關係' },
    { id: 'decision', name: '決策與行動' },
    { id: 'self', name: '自我探索' },
    { id: 'overall', name: '綜合' },
  ];

  const nth = (n, meaning) => Array.from({ length: n }, (_, i) => ({ name: `第 ${i + 1} 張`, meaning }));

  T.SPREADS = [
    {
      id: 'single',
      group: 'quick',
      name: '單張指引',
      description: '一張牌，給出最重要的一個訊息',
      examples: ['今天我需要注意什麼？', '面對這件事，我最需要知道的是什麼？'],
      type: 'normal',
      positions: [{ name: '核心訊息', meaning: '針對問題最重要的指引' }],
      layout: { cells: [[1, 1]] },
    },
    {
      id: 'yesno1',
      group: 'quick',
      name: '是非題・單張',
      description: '一張牌看傾向：正位偏「是」，逆位偏「否」',
      examples: ['這週適合提出加薪嗎？'],
      type: 'yesno',
      positions: [{ name: '答案', meaning: '正位傾向「是」，逆位傾向「否」，並參考牌義' }],
      layout: { cells: [[1, 1]] },
    },
    {
      id: 'yesno3',
      group: 'quick',
      name: '是非題・三張',
      description: '三張牌看傾向：正位多偏「是」，逆位多偏「否」',
      examples: ['這個月適合搬家嗎？'],
      type: 'yesno',
      positions: nth(3, '正位多傾向「是」，逆位多傾向「否」，並參考牌義'),
      layout: { cells: [[1, 1], [2, 1], [3, 1]] },
    },
    {
      id: 'timeline',
      group: 'time',
      name: '時間之流',
      description: '看一件事從過去、現在到未來的走向',
      examples: ['這件事情會如何發展？', '我最近的求職運勢如何？'],
      type: 'timeline',
      positions: [
        { name: '過去', meaning: '過去約一個月的狀態' },
        { name: '現在', meaning: '目前約一個月的狀態' },
        { name: '未來', meaning: '未來兩到三個月的狀態' },
      ],
      optional: [{ name: '建議', meaning: '面對這個發展的建議' }],
      optionalLabel: '加抽一張建議牌',
      layout: { cells: [[1, 1], [2, 1], [3, 1], [4, 1]] },
    },
    {
      id: 'fortune',
      group: 'time',
      name: '能量運勢',
      description: '將所選時間範圍分成六個階段，看哪個時段有機會',
      examples: ['未來半年我的桃花運勢如何？', '未來半年我的求職運勢如何？'],
      type: 'fortune',
      positions: Array.from({ length: 6 }, (_, i) => ({ name: `第 ${i + 1} 個月`, meaning: `從現在起第 ${i + 1} 個月的運勢` })),
      layout: { cells: [[1, 1], [2, 1], [3, 1], [1, 2], [2, 2], [3, 2]] },
    },
    {
      id: 'relation',
      group: 'relation',
      name: '棘手關係',
      description: '有特定對象時，看雙方的態度與關係走向',
      examples: ['對方怎麼看我？', '現任男友是適合我的人嗎？'],
      hint: '沒有特定對象（例如：什麼時候會遇到好對象？）請改用「能量運勢」；想釐清自己內心的感受，請改用「障礙排除」。',
      type: 'relation',
      positions: [
        { name: '現狀', meaning: '你與對方目前相處的情況' },
        { name: '你的態度', meaning: '你對對方的感覺，或你對這段關係的理解' },
        { name: '對方的態度', meaning: '對方如何看待這段關係，或對你的想法' },
        { name: '未來', meaning: '照目前的相處方式發展下去的走向' },
      ],
      layout: { cells: [[2, 1], [1, 2], [3, 2], [2, 3]] },
    },
    {
      id: 'choice2',
      group: 'decision',
      name: '二擇一',
      description: '兩個選項各自的過程與結果',
      examples: ['我要留在這間公司，還是換工作？', '我要住在家裡，還是搬出去住？'],
      type: 'choice',
      options: ['A', 'B'],
      positions: [
        { name: '現況', meaning: '此刻的心態與處境' },
        { name: '選項 A 過程', meaning: '選擇 A 時會經歷的狀況' },
        { name: '選項 B 過程', meaning: '選擇 B 時會經歷的狀況' },
        { name: '選項 A 結果', meaning: '選擇 A 的最終結果' },
        { name: '選項 B 結果', meaning: '選擇 B 的最終結果' },
      ],
      layout: { cells: [[2, 3], [1, 2], [3, 2], [1, 1], [3, 1]] },
    },
    {
      id: 'choice3',
      group: 'decision',
      name: '三擇一',
      description: '三個選項各自的過程與結果',
      examples: ['我要留任、轉職，還是去進修？'],
      type: 'choice',
      options: ['A', 'B', 'C'],
      positions: [
        { name: '現況', meaning: '此刻的心態與處境' },
        { name: '選項 A 過程', meaning: '選擇 A 時會經歷的狀況' },
        { name: '選項 B 過程', meaning: '選擇 B 時會經歷的狀況' },
        { name: '選項 A 結果', meaning: '選擇 A 的最終結果' },
        { name: '選項 B 結果', meaning: '選擇 B 的最終結果' },
        { name: '選項 C 過程', meaning: '選擇 C 時會經歷的狀況' },
        { name: '選項 C 結果', meaning: '選擇 C 的最終結果' },
      ],
      layout: { cells: [[3, 3], [1, 2], [3, 2], [1, 1], [3, 1], [5, 2], [5, 1]] },
    },
    {
      id: 'insight',
      group: 'decision',
      name: '事件洞察',
      description: '從人、事、物三個面向看一件事，再給建議',
      examples: ['我如何在這間公司做出貢獻？', '這個案子可以怎麼準備？'],
      type: 'normal',
      positions: [
        { name: '人', meaning: '與這件事有關的人' },
        { name: '事', meaning: '客觀條件與環境' },
        { name: '物', meaning: '可運用的物品與資源' },
        { name: '建議', meaning: '總結與建議' },
      ],
      layout: { cells: [[1, 1], [2, 1], [3, 1], [2, 2]] },
    },
    {
      id: 'improve',
      group: 'decision',
      name: '自我提升',
      description: '看清自身與外在的原因，找出改善的方法',
      examples: ['這件事情應該怎麼處理？', '我如何讓這件事變得更好？'],
      type: 'normal',
      positions: [
        { name: '現在', meaning: '目前這件事的狀況' },
        { name: '內在世界', meaning: '自身的原因' },
        { name: '外在世界', meaning: '事情的客觀條件' },
        { name: '未來發展或建議', meaning: '未來的發展，或應對的建議' },
      ],
      layout: { cells: [[2, 1], [1, 1], [3, 1], [2, 2]] },
    },
    {
      id: 'obstacle',
      group: 'self',
      name: '障礙排除',
      description: '找出阻礙你的是什麼，以及你擁有的資源',
      examples: ['是什麼阻礙了我找對象？', '我應該如何克服這個困難？'],
      type: 'self',
      uprightOnly: true,
      positions: [
        { name: '現在', meaning: '目前的處境' },
        { name: '內在資源', meaning: '內心真實的想法，或能幫助自己的內在力量' },
        { name: '外在資源', meaning: '外界環境的態度，或能幫助自己的客觀條件' },
      ],
      layout: { cells: [[2, 1], [1, 1], [3, 1]] },
    },
    {
      id: 'triangle',
      group: 'self',
      name: '內在三角',
      description: '從身、心、靈三個層次看你對一件事的真實想法',
      examples: ['我對這件事的真實看法是什麼？', '我做這件事的能量如何？'],
      type: 'self',
      uprightOnly: true,
      positions: [
        { name: '身', meaning: '理性判斷、具體可行的想法' },
        { name: '心', meaning: '情緒感受，決定有沒有動力' },
        { name: '靈', meaning: '靈魂追求，長期前進的方向' },
      ],
      layout: { cells: [[1, 2], [2, 1], [3, 2]] },
    },
    {
      id: 'goal',
      group: 'self',
      name: '目標設定',
      description: '釐清目標、現狀與障礙，找到下一步',
      examples: ['我如何做好這個企劃？', '我可以從這次學習中得到什麼？'],
      type: 'self',
      uprightOnly: true,
      positions: [
        { name: '目標', meaning: '視為目標的事' },
        { name: '現狀', meaning: '到目前為止的情況' },
        { name: '障礙', meaning: '造成行動困難的原因' },
        { name: '建議', meaning: '對這件事的建議' },
      ],
      layout: { cells: [[1, 1], [2, 1], [3, 1], [4, 1]] },
    },
    {
      id: 'core',
      group: 'self',
      name: '核心定位',
      description: '十張牌整理出十個內在核心，寫成自我宣言',
      examples: ['我在這段關係裡需要堅守的原則是什麼？', '我在這間公司想學到什麼？'],
      type: 'self',
      uprightOnly: true,
      positions: Array.from({ length: 10 }, (_, i) => ({ name: `第 ${i + 1} 個核心`, meaning: '一個內在核心，最後整理成一句「我……」的自我宣言' })),
      layout: { cells: Array.from({ length: 10 }, (_, i) => [(i % 5) + 1, i < 5 ? 1 : 2]) },
    },
    {
      id: 'celtic',
      group: 'overall',
      name: '凱爾特十字',
      description: '十張牌全面分析一件事的來龍去脈',
      examples: ['我目前的工作狀況全貌是什麼？'],
      type: 'normal',
      positions: [
        { name: '現況', meaning: '目前的核心狀況' },
        { name: '阻礙', meaning: '橫跨在現況上的挑戰或助力' },
        { name: '根基', meaning: '事情的根源、潛意識' },
        { name: '過去', meaning: '正在離開的影響' },
        { name: '目標', meaning: '意識層面的期望、可能的最佳結果' },
        { name: '近未來', meaning: '即將發生的發展' },
        { name: '自我', meaning: '求問者的態度與狀態' },
        { name: '環境', meaning: '周遭人事物的影響' },
        { name: '希望與恐懼', meaning: '內心的期待與擔憂' },
        { name: '結果', meaning: '事情的可能走向' },
      ],
      layout: { cells: [[2, 2], [2, 2, 90], [2, 3], [1, 2], [2, 1], [3, 2], [4, 4], [4, 3], [4, 2], [4, 1]] },
    },
    {
      id: 'overview',
      group: 'overall',
      name: '整體能量',
      description: '五張牌不分牌位，看正逆位與元素的整體分布',
      examples: ['我最近的整體狀態如何？'],
      type: 'overview',
      positions: nth(5, '整體能量的一部分'),
      layout: { cells: [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1]] },
    },
  ];

  T.SPREAD_BY_ID = Object.fromEntries(T.SPREADS.map((s) => [s.id, s]));

  T.getPositions = function (spread, withOptional, timeframe) {
    let positions = spread.positions;
    if (timeframe && spread.type === 'timeline') {
      positions = positions.map((p, i) => ({ ...p, meaning: [
        '形成目前狀態的過往經驗與背景',
        `現在的狀態，以及影響接下來「${timeframe}」的因素`,
        `從現在起「${timeframe}」範圍內的發展`,
      ][i] }));
    } else if (timeframe && spread.type === 'fortune' && timeframe !== '半年內') {
      positions = positions.map((p, i) => ({
        ...p, name: `第 ${i + 1} 階段`,
        meaning: `將「${timeframe}」分成六個依序階段，這是第 ${i + 1} 階段的趨勢；不可將每一階段固定當成一個月`,
      }));
    }
    return positions.concat(withOptional && spread.optional ? spread.optional : []);
  };

  const PERSON = /(他|她|對方|男友|女友|男朋友|女朋友|老公|老婆|先生|太太|伴侶|曖昧|前任|現任|主管|老闆|同事|朋友|家人|媽媽|爸爸)/;

  // 依問題內容推薦牌陣，最多兩個；aiSpreads 是 AI 問題整理建議的牌陣，優先列出
  T.recommendSpreads = function (form, aiSpreads) {
    const q = (form.question || '').trim();
    const picks = [];
    const add = (...ids) => ids.forEach((id) => T.SPREAD_BY_ID[id] && !picks.includes(id) && picks.push(id));
    add(...(aiSpreads || []));
    if (T.bgSpreadHints) add(...T.bgSpreadHints(form));
    if (/還是|或是|或者/.test(q)) add(/(還是|或是|或者).*(還是|或是|或者)/.test(q) ? 'choice3' : 'choice2');
    if (/嗎[？?]?\s*$/.test(q) && q.length <= 25) add('yesno3');
    if ((form.category === '感情' || form.category === '人際') && PERSON.test(q)) add('relation');
    if (/運勢|桃花|半年/.test(q)) add('fortune', 'timeline');
    if (T.isLongTimeframe && T.isLongTimeframe(form.timeframe)) add('fortune');
    if (/阻礙|卡關|卡住|克服/.test(q)) add('obstacle');
    if (/怎麼做|如何準備|怎麼準備|怎麼處理|如何處理|怎麼辦/.test(q)) add('improve', 'insight');
    if (!picks.length) add('timeline');
    return picks.slice(0, 2);
  };
})();
