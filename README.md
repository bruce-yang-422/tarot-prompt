# 問牌 Prompt

塔羅抽牌與 AI 解牌 Prompt 產生器。線上抽牌或輸入實體牌的結果，網站會把問題、牌陣、牌位、正逆位與背景整理成結構化的解牌 Prompt，一鍵複製到 ChatGPT、Claude 或 Gemini。

網站本身不解牌，只負責讓 AI 拿到完整、清楚的資訊。

Tarot draw & AI reading prompt generator. Draw online or enter your physical cards, then copy a structured prompt (YAML settings + JSON card data) for ChatGPT, Claude or Gemini. Static site, no backend.

## 使用方式

1. 選擇「系統自動抽牌」或「實體牌手動輸入」
2. 選類別、寫下問題、點選背景小問卷
3. 選牌陣（會依問題推薦）
4. 抽牌，或依牌位輸入自己抽到的牌
5. 選擇解讀語氣與長度，複製 Prompt，貼到 AI 的對話框

## 功能

- **兩種抽牌方式**
  - 系統自動抽牌：靜心倒數後以 `crypto.getRandomValues` 洗牌，正逆位各 50%
  - 實體牌手動輸入：分類標籤、搜尋（支援中英文與別名）、正逆位切換、跳出牌
- **16 種牌陣，分 6 組**：快速指引、時間與趨勢、人際關係、決策與行動、自我探索、綜合；依問題內容與問卷回答推薦
- **背景小問卷**：依類別出現單選、複選、簡答題，取代空白的大文字框；感情狀態等關鍵項目為必填
- **好問題引導**：即時提示問法（肯定句、以自己為主角、三個月內）
- **時間範圍**：選超過三個月仍可使用，但會提示準確度較低
- **解牌 Prompt**
  - 設定為 YAML、牌面資料為 JSON，結構清楚
  - 附牌面統計（大牌比例、元素分布、重複數字）
  - 有逆位時附上 7 種逆位解讀原則；自我探索類牌陣改為引導式對話
  - 語氣（溫柔療癒、直白犀利、心理學取向、傳統神秘）與長度可選
- **結果頁**：1909 年原版牌圖、牌陣依螢幕大小自動放大、補指引牌、重抽提醒
- **占卜紀錄**：存在瀏覽器的 localStorage
- **AI 輔助（選用）**
  - 沒有 API key：複製「整理問題 Prompt」到任何 AI，再把回覆貼回來
  - 有 OpenAI API key：在「設定」填入後，可直接請 AI 整理問題、追加背景問題（預設模型 `gpt-6-luna`）
- **安全與隱私**
  - 沒有伺服器，資料只存在使用者的瀏覽器
  - API key 只存在瀏覽器，由瀏覽器直接呼叫 OpenAI；清除瀏覽資料或換裝置後就不見，請自行備份（OpenAI 的 key 只會完整顯示一次）
  - Content Security Policy 只允許本站程式與 `api.openai.com`
  - 問題出現自我傷害相關字詞時，顯示求助專線

## 部署

純 HTML、CSS、JavaScript，不需要安裝套件或建置。

- **本機**：直接雙擊 `index.html`
- **GitHub Pages**：repo 的 Settings → Pages → Source 選「Deploy from a branch」，分支選 `main`、資料夾選 `/ (root)`

## 檔案

| 檔案 | 用途 |
| --- | --- |
| `index.html` | 頁面結構與自製 SVG 圖示 |
| `css/style.css` | 樣式 |
| `js/cards.js` | 78 張牌資料、正逆位關鍵字、數字／元素／宮廷牌對照表、牌圖路徑 |
| `js/spreads.js` | 16 種牌陣與推薦規則 |
| `js/background.js` | 背景小問卷的題目與規則 |
| `js/prompt.js` | 牌面統計、問題提示、解牌 Prompt 產生 |
| `js/storage.js` | 紀錄、設定、草稿、API key 的儲存 |
| `js/ai.js` | AI 問題整理與追加問題 |
| `js/app.js` | 畫面切換與互動 |
| `images/rws-1909/` | 78 張牌圖與出處紀錄（`manifest.json`） |

## 免責聲明

塔羅解讀僅供參考與自我覺察，不能取代醫療、法律、財務、心理等專業意見。

## 牌圖出處

Rider–Waite–Smith 塔羅，Pamela Colman Smith 繪，1909 年出版，公有領域，取自 [Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:Rider-Waite_tarot_deck_(Roses_%26_Lilies))。
