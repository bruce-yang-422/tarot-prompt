const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const ctx = vm.createContext({ window: {} });
for (const file of ['cards', 'spreads', 'prompt', 'background', 'ai']) {
  vm.runInContext(readFileSync(path.join(__dirname, '..', 'js', file + '.js'), 'utf8'), ctx);
}
const T = ctx.window.Tarot;
const timeframes = [...T.TIMEFRAMES, '本學期結束前', '接下來十天'];
const record = (spread, timeframe) => ({
  spreadId: spread.id, form: { question: '未來三個月，我要如何改善工作狀況？', category: '事業', timeframe },
  cards: Object.keys(T.CARD_BY_ID).slice(0, spread.positions.length).map((id) => ({ id, reversed: false })),
  withOptional: true, mode: 'auto',
});
const dataOf = (prompt) => JSON.parse(prompt.match(/```json\n([\s\S]*?)\n```/)[1]);

test('所有牌陣保留預設與自訂時間，並明確要求依所選時間解讀', () => {
  for (const timeframe of timeframes) {
    for (const spread of T.SPREADS) {
      const prompt = T.buildPrompt(record(spread, timeframe), {});
      assert.ok(prompt.includes(`timeframe: ${JSON.stringify(timeframe)}`));
      assert.ok(prompt.includes(`querent.timeframe「${timeframe}」為準`));
      assert.ok(prompt.includes('問題或背景若提及其他期間，仍以此選擇為準'));
      assert.equal(dataOf(prompt).cards.length, T.getPositions(spread, true).length);
    }
  }
});

test('時間之流不再以固定月份覆蓋一週、一個月或自訂範圍', () => {
  const spread = T.SPREAD_BY_ID.timeline;
  const original = JSON.stringify(spread.positions);
  for (const timeframe of timeframes) {
    const cards = dataOf(T.buildPrompt(record(spread, timeframe), {})).cards;
    assert.ok(cards[2].position_meaning.includes(timeframe));
    assert.ok(!cards.some((card) => /約一個月|兩到三個月/.test(card.position_meaning)));
    assert.equal(cards[3].position, '建議');
  }
  assert.equal(JSON.stringify(spread.positions), original, '不修改共用牌陣定義');
});

test('六張能量運勢依所選範圍分階段，只有半年維持每月一張', () => {
  const spread = T.SPREAD_BY_ID.fortune;
  for (const timeframe of timeframes) {
    const cards = dataOf(T.buildPrompt(record(spread, timeframe), {})).cards;
    assert.equal(cards.length, 6);
    if (timeframe === '半年內') {
      assert.equal(cards[5].position, '第 6 個月');
    } else {
      assert.equal(cards[5].position, '第 6 階段');
      assert.ok(cards.every((card) => card.position_meaning.includes(timeframe)));
    }
  }
});

test('長期範圍標示不確定性，但不強制縮成近三個月', () => {
  for (const timeframe of T.LONG_TIMEFRAMES) {
    const prompt = T.buildPrompt(record(T.SPREAD_BY_ID.timeline, timeframe), {});
    assert.ok(prompt.includes('不可擅自改變使用者選擇的時間範圍'));
    assert.ok(!prompt.includes('請以近三個月的趨勢為主要解讀'));
  }
});

test('API 與複製貼上的問題整理 Prompt 都包含並尊重已選時間', () => {
  for (const timeframe of timeframes) {
    for (const format of ['json', 'list']) {
      const prompt = T.ai.buildPrompt({ question: '我要如何改善工作狀況？', category: '事業', timeframe }, format);
      assert.ok(prompt.includes(`【已選時間範圍】${timeframe}`));
      assert.ok(prompt.includes('回傳的 timeframe 也必須與此選擇一致'));
      assert.ok(!prompt.includes('以三個月內的短期發展為主'));
    }
  }
});
