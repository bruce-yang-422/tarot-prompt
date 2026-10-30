<p align="center"><img src="icons/logo-256.png" alt="Tarot Prompt logo" width="140"></p>

# Tarot Prompt (問牌 Prompt)

**English** | [繁體中文](README.md)

[![Live demo](https://img.shields.io/badge/demo-tarot.stack--base.com-d9b45a)](https://tarot.stack-base.com)
![Vanilla JS](https://img.shields.io/badge/vanilla-HTML%20%7C%20CSS%20%7C%20JS-1b1736)
![No build step](https://img.shields.io/badge/build-none-1b1736)
![No backend](https://img.shields.io/badge/backend-none-1b1736)
![PWA](https://img.shields.io/badge/PWA-installable-1b1736)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

A tarot draw tool that turns your question, spread and cards into a structured reading prompt for ChatGPT, Claude or Gemini.

The app does not interpret the cards itself. It collects everything an LLM needs for a good reading — the question, background, spread positions, card orientation and card statistics — and formats it as YAML settings plus JSON card data that you can copy with one click.

**Live demo:** <https://tarot.stack-base.com>

**Setup guide:** [OpenAI API key registration, billing, and safety guide](https://tarot.stack-base.com/openai-api-key.html) ([local page](openai-api-key.html), in Traditional Chinese)

<p>
  <img src="docs/screenshots/desktop-result.jpg" alt="Result page with the drawn spread and the generated prompt" width="640">
  <img src="docs/screenshots/mobile-question.jpg" alt="Question step on mobile with category chips and the background questionnaire" width="180">
</p>

## Features

- **Two ways to draw**
  - Online draw: Fisher–Yates shuffle with `crypto.getRandomValues`, 50% chance of reversal
  - Physical deck: enter the cards you drew, with search (Chinese, English and aliases), orientation toggle and "jumper" cards
- **16 spreads in 6 groups**, recommended from the question and questionnaire answers (single card, yes/no, timeline, six-month forecast, relationship, two/three options, Celtic Cross, self-reflection spreads and more)
- **Category-based background questionnaire** with single-choice, multi-choice and short-answer items instead of a blank text box; key items such as relationship status are required
- **Question coaching**: live hints for better phrasing (first person, affirmative, within three months)
- **Structured prompt output**
  - YAML settings + JSON card data
  - Card statistics: Major/Minor ratio, element distribution, court cards, repeated numbers
  - Guidelines for reading reversed cards; self-reflection spreads switch to a guided-dialogue format
  - Selectable tone and response length
- **Result page**: public-domain 1909 Rider–Waite–Smith artwork, board that scales to the viewport, clarifier cards, redraw reminder
- **History** stored locally in the browser
- **Optional AI assist**
  - Without an API key: copy a "refine my question" prompt to any chatbot and paste the answer back
  - With your own OpenAI, Google AI Studio, or Claude API key: refine questions and generate follow-up background questions. Recommended budget models appear by default (`gpt-6-luna`, `gpt-5.6-luna`, `gemini-3.5-flash-lite`, and `claude-haiku-5-5`); enable **顯示全部模型 (Show all models)** for other models and custom IDs
  - A scrollable, in-page model menu groups choices by provider; refresh and save actions remain available at the bottom of the settings dialog on mobile
- **OpenAI API key guide**: a Traditional Chinese walkthrough for registration, email verification, saving keys, billing, and safety. Screenshots, full translations, and reference notes are collapsed by default; mobile readers get floating topic navigation
- **PWA**: installable to the home screen; installation caches the site, all 78 card images, and tutorial screenshots in the background. Once cached, card draws, prompt generation, and the guide work offline; AI assistance and model-list requests still require a connection
- **SEO**: Open Graph / Twitter card previews, JSON-LD structured data, `sitemap.xml`, `robots.txt`
- **Accessibility**: keyboard navigation, `aria-live` announcements, respects `prefers-reduced-motion`
- **Safety**: shows crisis hotlines when self-harm related wording is detected

## Tech stack

- Plain HTML, CSS and JavaScript — no framework, no bundler, no dependencies
- Classic `<script>` tags instead of ES modules so the app also runs from `file://`
- `localStorage` / `sessionStorage` for history, drafts, settings and the optional API key
- Hand-drawn SVG icon sprite
- Service worker: precaches the app shell and all card images on install; network-first for the app shell, cache-first for card images
- Hosted on GitHub Pages behind Cloudflare

## Getting started

```bash
git clone https://github.com/bruce-yang-422/tarot-prompt.git
cd tarot-prompt
```

Then open `index.html` in a browser. There is nothing to install or build.

To serve it over HTTP instead (closer to production; the PWA and offline features only work over HTTP/HTTPS):

```bash
python -m http.server 8000
# open http://localhost:8000
```

## Configuration

The API integration is optional and configured per user in the browser:

1. Open **設定 (Settings)** in the top bar
2. Under **管理 API keys (Manage API keys)**, add or edit an OpenAI, Google, or Claude key and its storage preference; each row has a separate delete action, and the editor links to the provider's key application page
3. Open **使用模型 (Model)** and choose from the in-page list grouped by provider. Enable **顯示全部模型 (Show all models)** for other text models and custom IDs; **更新模型 (Refresh models)** reloads the lists
4. Select a model and save to apply added or edited keys. Deleting a key takes effect immediately. The model determines which provider is called; editing a key does not change the active provider

Notes:

- New OpenAI users can open the [registration and billing guide](openai-api-key.html) from the link under **管理 API keys (Manage API keys)**. It opens in a new tab and provides a concise Chinese walkthrough with expandable screenshots and reference details.
- API credits and ChatGPT subscriptions are managed separately. Create keys at [platform.openai.com](https://platform.openai.com); check your account and the [official documentation](https://developers.openai.com/api/docs/guides/chatgpt-api-credits) for any eligible subscription credit benefits.
- Get a Google key from [Google AI Studio](https://aistudio.google.com/apikey); quota and billing depend on your Google account.
- Get a Claude key from [Claude Console](https://platform.claude.com/settings/keys); API billing and credits depend on your Console account.
- Keys are sent only to the selected provider at `api.openai.com`, `generativelanguage.googleapis.com`, or `api.anthropic.com`, never through a site backend.
- Clearing browser data removes stored keys; keep your own backup. Google free and paid tiers have different data-use terms; see [Google pricing and data use](https://ai.google.dev/gemini-api/docs/pricing).
- Copy and save the full key when you create it. If it was not saved or has been lost, create a replacement; a shortened key or Tracking ID in the provider's key list cannot replace the full secret key.

## Validation

The app has no runtime package dependencies. Development checks use Node.js and Python with Playwright:

```bash
node --test scripts/test-ai.cjs scripts/test-providers.cjs
python -m pip install playwright
python -m playwright install chromium
python scripts/test-settings.py
```

Checks cover AI response parsing, provider requests and key isolation, model selection, saved settings, and mobile layouts. Provider API requests are mocked; no real API key is needed.

## Deployment

The site is static, so any static host works. For GitHub Pages:

1. **Settings → Pages → Build and deployment**: deploy from branch `main`, folder `/ (root)`
2. For a custom domain, set it under **Custom domain** (this commits the `CNAME` file) and point a DNS `CNAME` record at `<user>.github.io`
3. After changing CSS or JS, update the relevant `?v=` versions in `index.html`, `404.html`, and `openai-api-key.html` to avoid stale CDN responses, and bump `SHELL_CACHE` in `sw.js`. Add new offline resources to its cache list
4. When moving to another domain, update canonical and Open Graph URLs in the HTML pages, along with `robots.txt` and `sitemap.xml`

## Project structure

```text
.
├── index.html            # Markup, views, SVG icon sprite and SEO tags
├── openai-api-key.html   # OpenAI key registration, billing, and safety guide
├── 404.html              # Custom 404 page (served automatically by GitHub Pages)
├── manifest.webmanifest  # PWA manifest
├── sw.js                 # Service worker (offline cache)
├── robots.txt
├── sitemap.xml
├── CNAME                 # GitHub Pages custom domain
├── css/style.css         # Styles (dark theme, responsive layout)
├── js/
│   ├── cards.js          # 78-card data, keywords, element/number/court tables, image paths
│   ├── spreads.js        # 16 spread definitions and recommendation rules
│   ├── background.js     # Background questionnaire definitions
│   ├── prompt.js         # Card statistics, question hints, prompt builder
│   ├── storage.js        # History, drafts, settings and API key storage
│   ├── ai.js             # OpenAI / Google / Claude: refine question, follow-up questions
│   ├── settings.js       # API key management and combined model selector
│   └── app.js            # Routing, views and interactions
├── images/rws-1909/      # 78 card images + manifest.json (source and license)
├── images/guide/         # Registration and billing tutorial screenshots
├── favicon.ico           # Browser tab icon
├── icons/                # Logo sizes, PWA icons and the social preview image
│   └── source/           # Original logo artwork (1000×1000)
├── docs/screenshots/     # Images used in this README
├── scripts/             # AI/provider checks and Playwright settings UI tests
├── README.md             # Traditional Chinese README
└── LICENSE               # MIT License
```

## Privacy and security

- There is no backend. History, drafts, and settings are stored in the user's browser. When AI assistance is used, questions and background details are sent directly to the selected provider; avoid including unnecessary personal information.
- Session-only API keys use `sessionStorage`; remembered keys use `localStorage`, without additional encryption. Deleting a key in Tarot Prompt removes the local copy only; revoke it on the provider's official platform to disable it.
- [OpenAI recommends](https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety) keeping keys on a backend instead of deploying them in browsers or mobile apps. This app currently lets users supply their own keys and calls the provider directly from the browser. Use the copy-prompt workflow if you prefer not to enter a key in the browser.
- The main app's Content Security Policy restricts script sources and allows outbound API requests only to `api.openai.com`, `generativelanguage.googleapis.com`, and `api.anthropic.com`. The tutorial page runs without JavaScript.
- No third-party scripts, analytics or fonts are loaded.

## Browser support

Recent versions of Chrome, Edge, Firefox and Safari, on desktop and mobile. The app relies on `<dialog>`, CSS Grid and `crypto.getRandomValues`.

## Disclaimer

Tarot readings are for reflection and entertainment only. They are not a substitute for medical, legal, financial or psychological advice.

## License

The source code is released under the [MIT License](LICENSE).

The card artwork is the 1909 Rider–Waite–Smith deck illustrated by Pamela Colman Smith, which is in the public domain. Images are from [Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:Rider-Waite_tarot_deck_(Roses_%26_Lilies)); per-file sources are listed in `images/rws-1909/manifest.json`.
