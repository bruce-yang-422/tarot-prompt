/* PWA 安裝入口：支援原生提示，其他瀏覽器提供手動安裝指引。 */
(() => {
  'use strict';

  const button = document.querySelector('#installApp');
  const hint = document.querySelector('#installHint');
  const dialog = document.querySelector('#installDialog');
  const mode = window.matchMedia('(display-mode: standalone)');
  let pendingPrompt = null;
  let installed = false;
  let busy = false;

  function sync() {
    const isInstalled = installed || mode.matches || navigator.standalone === true;
    button.disabled = isInstalled || busy;
    button.innerHTML = isInstalled
      ? (installed ? '已安裝 App' : '已在 App 中開啟')
      : '<svg class="icon" aria-hidden="true"><use href="#i-download"></use></svg>安裝成 App';
    hint.textContent = isInstalled
      ? '已可從主畫面或桌面快速開啟問牌。'
      : '加入主畫面或桌面，下次一點就能開啟問牌。';
  }

  function showGuide() {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const steps = ios ? [
      '使用 Safari 開啟本網站，再點選瀏覽器的「分享」按鈕。',
      '選擇「加入主畫面」；若有「作為網頁 App 開啟」選項，請開啟。',
      '點選「加入」，之後即可從主畫面開啟問牌。',
    ] : [
      '使用 Chrome、Edge 或支援安裝網站的瀏覽器開啟本網站。',
      '在網址列或瀏覽器選單中尋找「安裝應用程式」、「安裝此網站」或「新增至主畫面」。',
      '依照畫面提示完成安裝；若沒有安裝選項，可先加入書籤，或改用其他支援的瀏覽器。',
    ];
    document.querySelector('#installSteps').replaceChildren(...steps.map((text) => {
      const li = document.createElement('li');
      li.textContent = text;
      return li;
    }));
    dialog.showModal();
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    pendingPrompt = event;
    sync();
  });

  window.addEventListener('appinstalled', () => {
    installed = true;
    pendingPrompt = null;
    sync();
  });
  mode.addEventListener('change', sync);

  button.addEventListener('click', async () => {
    if (busy || installed || mode.matches || navigator.standalone === true) return;
    if (!pendingPrompt) return showGuide();
    const event = pendingPrompt;
    pendingPrompt = null;
    busy = true;
    button.disabled = true;
    try {
      await event.prompt();
      await event.userChoice;
    } catch {
      if (!installed) showGuide();
    } finally {
      busy = false;
      sync();
    }
  });

  sync();
})();
