// 背景小問卷：依問題類別給出選擇題與簡答，取代空白的大文字框。不使用 AI。
// 題型：single 單選、multi 複選、text 一行簡答；showIf 依前面的回答決定是否顯示；
// required 為必填（沒有這項 AI 無法正確解讀，例如問感情一定要知道感情狀態）；
// custom 為單選題加上「自訂」選項，值是輸入框的提示文字。
// 選項盡量通用：跨年齡（學生到退休）、跨處境（受雇、自營、家庭照顧者、單親、喪偶等）。
(function () {
  const T = (window.Tarot = window.Tarot || {});

  const MOOD = { id: 'mood', label: '目前的心情', type: 'multi', options: ['焦慮', '迷惘', '期待', '疲憊', '難過', '孤單', '生氣', '平靜', '充滿動力'] };

  T.BG_QUESTIONS = {
    感情: [
      {
        id: 'status',
        label: '感情狀態',
        type: 'single',
        required: true,
        custom: '例如：再婚、遠距離婚姻',
        options: ['單身', '曖昧中', '有男女朋友・交往中', '已婚', '分居中', '分手或離婚後', '喪偶', '關係複雜'],
      },
      {
        id: 'duration',
        label: '在一起多久（認識、交往或結婚）',
        type: 'single',
        custom: '例如：結婚 25 年',
        options: ['不到 3 個月', '3 個月～1 年', '1～3 年', '3～10 年', '10～20 年', '20 年以上'],
        showIf: { id: 'status', not: ['單身'] },
      },
      {
        id: 'issues',
        label: '目前的困擾',
        type: 'multi',
        options: ['溝通不良', '經常爭吵', '冷淡疏離', '信任問題', '第三者', '遠距離', '家人或親友的意見', '經濟或金錢觀', '子女或家庭責任', '不確定對方心意', '想復合', '遇不到合適的對象'],
      },
      {
        id: 'goal',
        label: '你希望的方向',
        type: 'single',
        options: ['改善關係', '釐清彼此心意', '決定要不要繼續', '找到新對象', '放下過去', '了解這段關係的走向'],
      },
      { id: 'event', label: '最近發生的關鍵事件', type: 'text', placeholder: '例如：上週因為家裡的事起了爭執' },
    ],
    事業: [
      {
        id: 'status',
        label: '目前狀態',
        type: 'single',
        required: true,
        custom: '例如：兼職、二度就業',
        options: ['在職（受雇）', '自營或創業', '自由工作・接案', '待業・找工作中', '學生・準備就業', '全職照顧家庭', '準備退休或已退休'],
      },
      {
        id: 'years',
        label: '工作年資',
        type: 'single',
        custom: '例如：在同一家公司 15 年',
        options: ['新人（1 年內）', '1～3 年', '3～10 年', '10～20 年', '20 年以上'],
        showIf: { id: 'status', not: ['學生・準備就業'] },
      },
      {
        id: 'issues',
        label: '目前的困擾',
        type: 'multi',
        options: ['工作量太大', '太閒・沒有成長', '和主管、同事或客戶的關係', '收入待遇', '升遷或發展卡關', '方向迷惘', '考慮轉換工作', '覺得能力跟不上', '職場倦怠', '工作和家庭難以兼顧', '年齡或體力的顧慮'],
      },
      {
        id: 'goal',
        label: '你希望的方向',
        type: 'single',
        options: ['在現在的位置做得更好', '爭取升遷或加薪', '換工作', '轉換跑道', '創業或發展副業', '規劃退休或第二人生', '還不確定'],
      },
      { id: 'detail', label: '具體情況', type: 'text', placeholder: '例如：最近接了新專案，進度一直落後' },
    ],
    財運: [
      {
        id: 'focus',
        label: '主要關注',
        type: 'multi',
        options: ['增加收入', '存錢', '投資理財', '償還債務', '大筆支出（買房、買車等）', '家庭開銷或子女教育費', '退休金規劃', '經營副業'],
      },
      { id: 'status', label: '目前的財務狀況', type: 'single', options: ['寬裕', '收支平衡', '有點吃緊', '壓力很大'] },
      {
        id: 'income',
        label: '收入來源',
        type: 'multi',
        options: ['固定薪資', '接案或業績獎金', '自營事業', '投資收益', '租金收入', '退休金或年金', '家人支援', '目前沒有收入'],
      },
      { id: 'decision', label: '正在考慮的財務決定', type: 'text', placeholder: '例如：要不要把存款拿去投資' },
    ],
    健康: [
      {
        id: 'focus',
        label: '關注的面向',
        type: 'multi',
        options: ['身體狀況', '睡眠', '情緒與壓力', '體重與飲食', '運動習慣', '長期病痛的照護', '照顧家人的健康'],
      },
      { id: 'status', label: '目前的狀態', type: 'single', options: ['想預防保養', '有些小毛病', '正在治療或復健', '剛經歷重大變化'] },
      { id: 'detail', label: '具體情況', type: 'text', placeholder: '例如：最近常失眠，白天很疲倦' },
    ],
    人際: [
      {
        id: 'who',
        label: '對象是誰',
        type: 'multi',
        options: ['朋友', '同事或主管', '家人', '伴侶的家人', '子女', '親戚', '同學', '鄰居或社區', '團體或社群（社團、宗教團體、網路等）'],
      },
      {
        id: 'issues',
        label: '目前的困擾',
        type: 'multi',
        options: ['溝通誤會', '衝突爭執', '被排擠或孤立', '不知道怎麼拒絕', '關係變疏遠', '世代或觀念差異', '想認識新朋友'],
      },
      { id: 'goal', label: '你希望的方向', type: 'single', options: ['修復關係', '保持適當距離', '改善相處方式', '了解對方的想法'] },
      { id: 'detail', label: '最近發生的事', type: 'text', placeholder: '例如：家庭聚會上意見不合，之後就沒再聯絡' },
    ],
    學業: [
      {
        id: 'stage',
        label: '目前階段',
        type: 'single',
        required: true,
        custom: '例如：準備出國唸書',
        options: ['國中小', '高中職', '大學或專科', '研究所', '在職進修', '準備考試或證照', '自學・興趣學習'],
      },
      {
        id: 'issues',
        label: '目前的困擾',
        type: 'multi',
        options: ['學習效率', '考試壓力', '選擇科系或方向', '拖延', '和老師同學的關係', '升學或留學', '學習和工作、家庭難以兼顧', '學費負擔'],
      },
      { id: 'deadline', label: '重要的時間點', type: 'text', placeholder: '例如：12 月底期末考、明年 3 月證照考試' },
    ],
    自我成長: [
      {
        id: 'focus',
        label: '想探索的方向',
        type: 'multi',
        options: ['人生方向', '自我價值', '情緒管理', '習慣養成', '內在阻礙', '天賦與優勢', '人際界線', '身心平衡', '人生下半場的規劃'],
      },
      { id: 'state', label: '最近的狀態', type: 'single', options: ['充滿動力', '平穩', '迷惘', '低潮', '正在轉變中'] },
      { id: 'detail', label: '想改變的事', type: 'text', placeholder: '例如：想培養運動習慣，但總是三天捕魚兩天曬網' },
    ],
    其他: [
      { id: 'duration', label: '這件事持續多久', type: 'single', options: ['剛發生', '幾週', '幾個月', '一年以上'] },
      { id: 'want', label: '你最想知道', type: 'single', options: ['現況分析', '未來走向', '該怎麼做', '對方的想法', '整體運勢'] },
      { id: 'detail', label: '發生了什麼事', type: 'text', placeholder: '用一句話簡單描述就好' },
    ],
  };

  // 問題框的範例，依類別切換
  T.QUESTION_EXAMPLES = {
    感情: '例如：我該如何改善和伴侶之間的溝通？',
    事業: '例如：我要如何在目前的工作中找到成長的方向？',
    財運: '例如：接下來三個月，我該如何調整理財方式？',
    健康: '例如：我該如何調整作息，找回好的睡眠品質？',
    人際: '例如：我該如何和家人好好溝通彼此的想法？',
    學業: '例如：我要如何準備這次的考試，才能發揮實力？',
    自我成長: '例如：我要如何找到接下來的人生方向？',
    其他: '例如：面對這件事，我需要注意什麼？',
  };

  // 健康類的提醒：顯示在問卷上方
  T.BG_NOTES = { 健康: '塔羅無法取代醫療診斷，身體不適請先就醫。' };

  // form 有 AI 追加的題目（同一類別）時，接在規則題目後面、心情題前面
  T.bgQuestionsFor = function (category, form) {
    const extra = form && form.bgExtra && form.bgExtra.category === (category || '其他') ? form.bgExtra.questions : [];
    return (T.BG_QUESTIONS[category] || T.BG_QUESTIONS.其他).concat(extra, MOOD);
  };

  T.bgAnswersFor = function (form) {
    const all = form.bgAnswers || {};
    return all[form.category || '其他'] || {};
  };

  T.bgVisible = function (q, answers) {
    if (!q.showIf) return true;
    const v = answers[q.showIf.id];
    return !v || !q.showIf.not.includes(v);
  };

  // 把問卷回答整理成「題目：回答」的列表，寫進 Prompt
  T.contextLines = function (form) {
    const answers = T.bgAnswersFor(form);
    return T.bgQuestionsFor(form.category, form)
      .filter((q) => T.bgVisible(q, answers))
      .map((q) => {
        const v = answers[q.id];
        const text = Array.isArray(v) ? v.join('、') : (v || '').trim();
        return text ? `${q.label}：${text}` : '';
      })
      .filter(Boolean);
  };

  // 回傳尚未回答的必填題（只算目前看得到的題目）
  T.bgMissingRequired = function (form) {
    const answers = T.bgAnswersFor(form);
    const empty = (v) => (Array.isArray(v) ? !v.length : !String(v || '').trim());
    return T.bgQuestionsFor(form.category, form).filter((q) => q.required && T.bgVisible(q, answers) && empty(answers[q.id]));
  };

  // 回答對牌陣推薦的影響
  const SPREAD_HINTS = {
    單身: ['fortune'],
    遇不到合適的對象: ['fortune'],
    曖昧中: ['relation'],
    '有男女朋友・交往中': ['relation'],
    已婚: ['relation'],
    分居中: ['relation'],
    關係複雜: ['relation'],
    不確定對方心意: ['relation'],
    決定要不要繼續: ['choice2'],
    換工作: ['choice2'],
    轉換跑道: ['choice2'],
    考慮轉換工作: ['choice2'],
    了解對方的想法: ['relation'],
    內在阻礙: ['obstacle'],
    人生方向: ['triangle'],
    人生下半場的規劃: ['triangle'],
    習慣養成: ['goal'],
    規劃退休或第二人生: ['goal'],
  };

  T.bgSpreadHints = function (form) {
    const answers = T.bgAnswersFor(form);
    const values = [].concat(...Object.values(answers).map((v) => (Array.isArray(v) ? v : [v])));
    return [].concat(...values.map((v) => SPREAD_HINTS[v] || []));
  };
})();
