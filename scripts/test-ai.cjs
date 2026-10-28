const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const context = vm.createContext({ window: {} });
for (const file of ['spreads.js', 'prompt.js', 'ai.js']) {
  vm.runInContext(readFileSync(path.join(__dirname, '..', 'js', file), 'utf8'), context);
}
const parse = (text) => JSON.parse(JSON.stringify(context.window.Tarot.ai.parseList(text)));

test('ChatGPT 分行問題與結尾額外說明不會漏題或污染理由', () => {
  const questions = [
    '未來三個月，我要如何調整下班後的娛樂與睡眠習慣，讓自己既能享受休閒時間，又能維持健康且規律的作息？',
    '未來三個月，我要如何改善自己不願太早睡覺的心理與行為模式，建立更有利於睡眠品質的生活習慣？',
    '未來三個月，我要如何配合目前上午10點上班、晚上7點下班的生活節奏，逐步建立適合自己的睡眠時間與睡前習慣？',
  ];
  const reasons = [
    '聚焦於目前追小說、看短劇而延後入睡的實際情況，探索如何在娛樂需求與睡眠健康之間取得平衡。',
    '從內在動機切入，探索「太早睡覺覺得不甘心」背後的心理需求，以及阻礙自己養成良好睡眠習慣的因素。',
    '以現有工作時間及上午9點起床的需求為基礎，聚焦於具體可行的作息調整方向，讓改善睡眠成為能夠持續實踐的目標。',
  ];
  const result = parse([
    '```markdown',
    ...questions.map((q, i) => `${i + 1}. 建議問題：\n   ${q}\n\n   理由：${reasons[i]}\n`),
    '建議類別：健康', '', '建議時間範圍：未來三個月', '', '建議牌陣：障礙排除', '',
    '選擇理由：', '目前最明確的困擾並非缺乏睡眠時間。', '',
    '「障礙排除」牌陣適合用來探索：', '・目前影響規律睡眠的主要障礙', '',
    '最推薦搭配的問題：第2題', '', '原因：', '第2題直接切入目前最核心的困擾。', '```',
  ].join('\n'));
  assert.deepEqual(result.questions, questions.map((text, i) => ({ text, why: reasons[i] })));
  assert.equal(result.category, '健康');
  assert.equal(result.timeframe, '未來三個月');
  assert.deepEqual(result.spreads, ['obstacle']);
});

test('問題標籤後有空行，仍可接回題目', () => {
  assert.deepEqual(parse('1. 建議問題：\n\n我要如何安排休閒？\n\n理由：聚焦行動').questions,
    [{ text: '我要如何安排休閒？', why: '聚焦行動' }]);
});

test('保留行內理由、獨立編號、無編號標籤與 JSON 格式的相容性', () => {
  const expected = [{ text: '我要如何安排休閒？', why: '聚焦行動' }];
  for (const text of [
    '1. 建議問題：我要如何安排休閒？（理由：聚焦行動）',
    '1.\n我要如何安排休閒？\n理由：聚焦行動',
    '**建議問題：**我要如何安排休閒？\n\n**理由：**聚焦行動',
    '```json\n{"questions":[{"text":"我要如何安排休閒？","why":"聚焦行動"}]}\n```',
  ]) assert.deepEqual(parse(text).questions, expected);
});

test('拒答不會被誤認成建議問題', () => {
  assert.deepEqual(parse('我是一个语言模型，这超出了我的设计用途。').questions, []);
});

test('模型候選保留未停用的日期版本，排除專用與已公告停用的模型', async () => {
  const expected = ['gpt-6-luna', 'gpt-6.1-sol', 'gpt-6-luna-2026-10-01', 'gpt-5.6-luna', 'gpt-5.4-mini', 'ft:gpt-5.4-mini:example:custom:123'];
  const excluded = ['gpt-image-1', 'gpt-4o-audio-preview', 'gpt-realtime', 'gpt-5-pro', 'gpt-5-codex', 'o3-deep-research', 'text-embedding-3-small', 'whisper-1', 'gpt-5-nano', 'gpt-5-nano-2025-08-07', 'gpt-4.1-nano', 'o3', 'o4-mini', 'ft:gpt-4.1:example:custom:123', 'gpt-5.4-nano', 'gpt-5.2-chat-latest'];
  const ctx = vm.createContext({ window: {}, fetch: async () => ({
    ok: true, status: 200,
    json: async () => ({ data: [...expected, ...excluded, expected[0], null].map((id) => ({ id })) }),
  }) });
  vm.runInContext(readFileSync(path.join(__dirname, '..', 'js', 'ai.js'), 'utf8'), ctx);
  assert.deepEqual(Array.from(await ctx.window.Tarot.ai.listModels('test-placeholder')), expected.sort());
});

test('模型清單拒絕無效 key，不顯示成連線成功', async () => {
  const ctx = vm.createContext({ window: {}, fetch: async () => ({ ok: false, status: 401 }) });
  vm.runInContext(readFileSync(path.join(__dirname, '..', 'js', 'ai.js'), 'utf8'), ctx);
  await assert.rejects(ctx.window.Tarot.ai.listModels('test-placeholder'), { code: 'invalid' });
});

test('省錢清單只挑現行 Luna，優先選別名並合併日期版本', () => {
  const ai = context.window.Tarot.ai;
  assert.deepEqual(Array.from(ai.budgetModels(['gpt-5-nano', 'gpt-6-luna-2026-10-01', 'gpt-6-luna', 'gpt-5.6-luna', 'gpt-6.1-sol'])), ['gpt-6-luna', 'gpt-5.6-luna']);
  assert.deepEqual(Array.from(ai.budgetModels(['gpt-6-luna-2026-10-01', 'gpt-6-luna-2026-09-01'])), ['gpt-6-luna-2026-10-01']);
  assert.equal(ai.budgetModelInfo('gpt-5-nano'), undefined);
  assert.equal(ai.budgetModelInfo('gpt-6-luna-pro'), undefined);
});

test('停用家族比對不會誤排除其他版本系列', () => {
  const ai = context.window.Tarot.ai;
  for (const id of ['gpt-5-nano', 'gpt-5.1', 'gpt-4o-mini', 'gpt-5.4-nano-2026-03-17']) assert.equal(ai.isDeprecatedModel(id), true);
  for (const id of ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.6-luna', 'gpt-6-luna']) assert.equal(ai.isDeprecatedModel(id), false);
});

test('貼回釐清問題不會誤當建議，也不接受混入的牌陣與題目', () => {
  for (const reply of [
    '```text\n釐清問題：先別鬧 😄 最近想釐清什麼事？\n```',
    '```json\n{"followUp":"最近想釐清什麼事？","questions":[{"text":"不應顯示的泛泛問題？"}],"category":"其他","spreads":["obstacle"]}\n```',
  ]) {
    const res = parse(reply);
    assert.ok(res.followUp);
    assert.deepEqual(res.questions, []);
    assert.deepEqual(res.spreads, []);
    assert.equal(res.category, '');
  }
});
