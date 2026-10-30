<p align="center"><img src="icons/logo-256.png" alt="問牌 Prompt 標誌" width="140"></p>

# 問牌 Prompt（Tarot Prompt）

**繁體中文** | [English](README.en.md)

[![線上展示](https://img.shields.io/badge/demo-tarot.stack--base.com-d9b45a)](https://tarot.stack-base.com)
![Vanilla JS](https://img.shields.io/badge/vanilla-HTML%20%7C%20CSS%20%7C%20JS-1b1736)
![No build step](https://img.shields.io/badge/build-none-1b1736)
![No backend](https://img.shields.io/badge/backend-none-1b1736)
![PWA](https://img.shields.io/badge/PWA-installable-1b1736)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

塔羅抽牌工具：把你的問題、牌陣和抽到的牌，整理成結構化的解牌 Prompt，貼到 ChatGPT、Claude 或 Gemini 解讀。

網站本身不解牌，而是把 AI 解牌需要的資訊整理完整：問題、背景、牌位意義、正逆位與牌面統計，並以「YAML 設定＋JSON 牌面資料」的格式一鍵複製。

**線上展示：**<https://tarot.stack-base.com>

**使用教學：**[OpenAI API key 申請、儲值與安全設定](https://tarot.stack-base.com/openai-api-key.html)

<p>
  <img src="docs/screenshots/desktop-result.jpg" alt="結果頁：牌陣圖與產生的 Prompt" width="640">
  <img src="docs/screenshots/mobile-question.jpg" alt="手機版問題頁：類別按鈕與背景小問卷" width="180">
</p>

## 功能

- **首頁導覽**：原版牌圖扇形、範例問題一鍵帶入、牌陣縮圖、完整範例（牌面 → Prompt → AI 解讀）、30 秒認識塔羅與常見問題
- **兩種抽牌方式**
  - 系統抽牌：以 `crypto.getRandomValues` 進行 Fisher–Yates 洗牌，正逆位各 50%
  - 實體牌輸入：依牌位輸入自己抽到的牌，支援搜尋（中文、英文、別名）、正逆位切換與跳出牌
- **16 種牌陣，分 6 組**，依問題與問卷回答推薦（單張、是非題、時間之流、能量運勢、棘手關係、二擇一／三擇一、凱爾特十字、自我探索類等）
- **依類別出現的背景小問卷**：單選、複選、簡答，取代空白大框；感情狀態等關鍵項目必填
- **提問引導**：即時提示更好的問法（以自己為主角、肯定句、三個月內）
- **結構化 Prompt**
  - YAML 設定＋JSON 牌面資料
  - 牌面統計：大牌比例、元素分布、宮廷牌、重複數字
  - 逆位解讀原則；自我探索類牌陣改為引導式對話
  - 可選解讀語氣與回答長度
- **結果頁**：1909 年原版 Rider–Waite–Smith 公有領域牌圖、牌陣依螢幕自動放大、補指引牌、重抽提醒
- **占卜紀錄**存在瀏覽器
- **選用的 AI 輔助**
  - 沒有 API key：複製「整理問題 Prompt」到任何 AI，再把回覆貼回來
  - 有自己的 OpenAI、Google AI Studio 或 Claude API key：直接整理問題、追加背景問題；預設只列出推薦的省錢模型（`gpt-6-luna`、`gpt-5.6-luna`、`gemini-3.5-flash-lite`、`claude-haiku-5-5`），勾選「顯示全部模型」可查看其餘模型與自訂 ID
  - 頁面內分組模型選單，可捲動選擇；手機設定視窗底部保留「更新模型／儲存」操作
- **OpenAI API key 教學**：中文快速申請流程、Email 驗證、保存 key、付款儲值與安全提醒；截圖、完整翻譯與補充說明預設收合，手機版提供浮動主題選單
- **PWA**：可「加到主畫面」當成 App 使用；安裝時在背景快取網站、78 張牌圖與教學截圖。快取完成後，抽牌、產生 Prompt 與閱讀教學可離線使用；AI 輔助與載入模型清單仍需連線
- **SEO**：Open Graph／Twitter 分享預覽、JSON-LD 結構化資料、`sitemap.xml`、`robots.txt`
- **無障礙**：可用鍵盤操作、`aria-live` 通知、遵循「減少動態效果」設定
- **安全**：偵測到自我傷害相關字詞時顯示求助專線

## 技術

- 純 HTML、CSS、JavaScript，不用框架、不用打包工具、沒有任何套件
- 用一般 `<script>` 而非 ES Modules，直接雙擊 `file://` 也能執行
- 紀錄、草稿、設定與選用的 API key 存在 `localStorage`／`sessionStorage`
- 自製 SVG 圖示
- Service Worker：安裝時預先快取網站與全部牌圖；網站本身採「先連網、失敗用快取」，牌圖採「先用快取」
- 部署在 GitHub Pages，前面接 Cloudflare

## 快速開始

```bash
git clone https://github.com/bruce-yang-422/tarot-prompt.git
cd tarot-prompt
```

直接用瀏覽器打開 `index.html`，不需要安裝或建置。

想用 HTTP 方式執行（比較接近正式環境，PWA 與離線功能也只在 HTTP／HTTPS 下運作）：

```bash
python -m http.server 8000
# 打開 http://localhost:8000
```

## 設定

API 串接是選用功能，每位使用者在自己的瀏覽器設定：

1. 點頂端列的「設定」
2. 在「管理 API keys」點 OpenAI、Google 或 Claude 的「新增 key」或「編輯」，填入 key 並選擇保存方式；每列也可單獨刪除，編輯區提供申請連結
3. 點上方「使用模型」，在頁面內依供應商分組的清單中選擇模型；勾選「顯示全部模型」可查看其他文字模型與自訂 ID，也可按「更新模型」重新載入
4. 選擇要使用的模型並「儲存」，套用新增／編輯的 key。刪除 key 立即生效；實際呼叫由模型選擇決定，編輯 key 不會切換使用中的服務

注意：

- 第一次申請 OpenAI key，可點設定中「管理 API keys」下的教學連結，另開[使用教學](https://tarot.stack-base.com/openai-api-key.html)。正文提供中文快速步驟，截圖與完整說明可依需要展開。
- API 額度與 ChatGPT 訂閱分開管理；API key 到 [platform.openai.com](https://platform.openai.com) 建立，是否有可領取的訂閱優惠額度，請看帳戶與[官方說明](https://developers.openai.com/api/docs/guides/chatgpt-api-credits)。
- Google 的 key 可從 [Google AI Studio](https://aistudio.google.com/apikey) 取得；額度、計費與資料使用依 Google 帳戶方案為準。
- Claude 的 key 可從 [Claude Console](https://platform.claude.com/settings/keys) 取得；API 費用與額度依 Console 帳戶為準。
- key 只會送往所選服務的 `api.openai.com`、`generativelanguage.googleapis.com` 或 `api.anthropic.com`，不經過本站伺服器。
- 清除瀏覽資料會刪除記住的 key，請自行備份。Google 免費與付費額度的資料使用政策不同，詳見[官方價格與資料使用說明](https://ai.google.dev/gemini-api/docs/pricing)。
- 完整 key 要在建立時立即複製保存。若沒有保存或已遺失，需要重新建立；官方清單中的縮略 key 與 Tracking ID 不能取代完整 key。

## 驗證

網站執行不需要套件；開發測試使用 Node.js，以及 Python 的 Playwright：

```bash
node --test scripts/test-ai.cjs scripts/test-providers.cjs
python -m pip install playwright
python -m playwright install chromium
python scripts/test-settings.py
```

測試涵蓋 AI 回覆解析、供應商請求與 key 隔離、模型選擇、設定保存及手機版排版。供應商 API 請求使用模擬資料，不需要真實 API key。

## 部署

純靜態網站，任何靜態主機都能用。以 GitHub Pages 為例：

1. **Settings → Pages → Build and deployment**：分支選 `main`、資料夾選 `/ (root)`
2. 自訂網域：在 **Custom domain** 填入網域（會自動提交 `CNAME` 檔），DNS 加一筆 `CNAME` 指向 `<使用者>.github.io`
3. 更新 CSS／JS 後，更新 `index.html`、`404.html`、`openai-api-key.html` 中相應的 `?v=` 版本號（避免 CDN 快取到舊檔），並遞增 `sw.js` 的 `SHELL_CACHE`；新增離線資源時也要更新快取清單
4. 換網域時，記得一併修改各 HTML 頁面的 canonical／Open Graph 網址、`robots.txt` 與 `sitemap.xml`

## 專案結構

```text
.
├── index.html            # 頁面結構、各畫面、SVG 圖示、SEO 標籤
├── openai-api-key.html   # OpenAI key 申請、付款儲值與安全教學
├── 404.html              # 自訂 404 頁（GitHub Pages 自動使用）
├── manifest.webmanifest  # PWA 設定
├── sw.js                 # Service Worker（離線快取）
├── robots.txt
├── sitemap.xml
├── CNAME                 # GitHub Pages 自訂網域
├── css/style.css         # 樣式（暗色主題、響應式版面）
├── js/
│   ├── cards.js          # 78 張牌資料、關鍵字、元素／數字／宮廷牌對照表、牌圖路徑
│   ├── spreads.js        # 16 種牌陣與推薦規則
│   ├── background.js     # 背景小問卷題目
│   ├── prompt.js         # 牌面統計、問題提示、Prompt 產生
│   ├── storage.js        # 紀錄、草稿、設定、API key 的儲存
│   ├── ai.js             # 呼叫 OpenAI／Google／Claude：整理問題、追加背景問題
│   ├── settings.js       # API key 管理、混合供應商模型清單
│   └── app.js            # 路由、畫面與互動
├── images/rws-1909/      # 78 張牌圖與 manifest.json（來源與授權）
├── images/guide/         # 申請與付款教學截圖
├── favicon.ico           # 瀏覽器分頁圖示
├── icons/                # Logo 各尺寸、PWA 圖示、社群分享預覽圖
│   └── source/           # Logo 原始檔（1000×1000）
├── docs/screenshots/     # README 用的截圖
├── scripts/             # AI 與供應商測試、Playwright 設定介面測試
├── README.en.md          # 英文版說明
└── LICENSE               # MIT 授權
```

## 隱私與安全

- 沒有後端伺服器；紀錄、草稿與設定保存在使用者的瀏覽器。使用 AI 輔助時，問題與背景會由瀏覽器直接送到所選供應商，請避免填入不必要的個人資料。
- API key 的「本次使用」保存在 `sessionStorage`，「記住此裝置」保存在 `localStorage`，沒有額外加密。在問牌刪除 key 只會移除本機保存；要停用 key，必須到供應商的官方平台撤銷。
- [OpenAI 官方建議](https://help.openai.com/zh-hant/articles/5112595-best-practices-for-api-key-safety)由後端保管 key，避免在瀏覽器或行動 App 部署。問牌目前採用使用者自備 key 的瀏覽器直連方式；不希望在瀏覽器填入 key 時，可以使用複製 Prompt 功能。
- 主程式的 Content Security Policy 限制程式來源，對外 API 連線只允許 `api.openai.com`、`generativelanguage.googleapis.com` 與 `api.anthropic.com`；教學頁不執行 JavaScript。
- 不載入任何第三方程式、追蹤分析或外部字型。

## 瀏覽器支援

近期版本的 Chrome、Edge、Firefox、Safari，電腦與手機皆可。需要支援 `<dialog>`、CSS Grid 與 `crypto.getRandomValues`。

## 免責聲明

塔羅解讀僅供自我覺察與娛樂參考，不能取代醫療、法律、財務或心理等專業意見。

## 授權

程式碼以 [MIT 授權](LICENSE) 釋出。

牌圖為 Pamela Colman Smith 繪製的 1909 年 Rider–Waite–Smith 牌組，已屬公有領域，取自 [Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:Rider-Waite_tarot_deck_(Roses_%26_Lilies))；每張圖的來源記錄在 `images/rws-1909/manifest.json`。
