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
- **PWA**: installable to the home screen; the first visit downloads the whole site in the background (about 16 MB including all 78 card images), after which it works fully offline
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
3. **使用模型 (Model)** combines recommended models from configured providers. Enable **顯示全部模型 (Show all models)** for other text models and custom IDs; **更新模型 (Refresh models)** reloads the lists
4. Select a model and save to apply added or edited keys. Deleting a key takes effect immediately. The model determines which provider is called; editing a key does not change the active provider

Notes:

- A ChatGPT Plus subscription does not include API access; API keys are created and billed separately at [platform.openai.com](https://platform.openai.com).
- Get a Google key from [Google AI Studio](https://aistudio.google.com/apikey); quota and billing depend on your Google account.
- Get a Claude key from [Claude Console](https://platform.claude.com/settings/keys); API billing and credits depend on your Console account.
- Keys are sent only to the selected provider at `api.openai.com`, `generativelanguage.googleapis.com`, or `api.anthropic.com`, never through a site backend.
- Clearing browser data removes stored keys; keep your own backup. Google free and paid tiers have different data-use terms; see [Google pricing and data use](https://ai.google.dev/gemini-api/docs/pricing).

## Deployment

The site is static, so any static host works. For GitHub Pages:

1. **Settings → Pages → Build and deployment**: deploy from branch `main`, folder `/ (root)`
2. For a custom domain, set it under **Custom domain** (this commits the `CNAME` file) and point a DNS `CNAME` record at `<user>.github.io`
3. After changing CSS or JS, update the `?v=` version in `index.html` and `404.html` (so CDN caches do not serve stale files) and bump `SHELL_CACHE` in `sw.js`
4. When moving to another domain, also update the canonical and Open Graph URLs in `index.html`, `robots.txt` and `sitemap.xml`

## Project structure

```text
.
├── index.html            # Markup, views, SVG icon sprite and SEO tags
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
├── favicon.ico           # Browser tab icon
├── icons/                # Logo sizes, PWA icons and the social preview image
│   └── source/           # Original logo artwork (1000×1000)
├── docs/screenshots/     # Images used in this README
├── README.md             # Traditional Chinese README
└── LICENSE               # MIT License
```

## Privacy and security

- There is no backend. Questions, history and settings stay in the user's browser.
- A Content Security Policy only allows same-origin scripts and outbound requests to `api.openai.com`.
- No third-party scripts, analytics or fonts are loaded.

## Browser support

Recent versions of Chrome, Edge, Firefox and Safari, on desktop and mobile. The app relies on `<dialog>`, CSS Grid and `crypto.getRandomValues`.

## Disclaimer

Tarot readings are for reflection and entertainment only. They are not a substitute for medical, legal, financial or psychological advice.

## License

The source code is released under the [MIT License](LICENSE).

The card artwork is the 1909 Rider–Waite–Smith deck illustrated by Pamela Colman Smith, which is in the public domain. Images are from [Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:Rider-Waite_tarot_deck_(Roses_%26_Lilies)); per-file sources are listed in `images/rws-1909/manifest.json`.
