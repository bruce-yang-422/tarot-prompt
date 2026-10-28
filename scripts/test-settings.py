"""Browser checks for combined model selection. All provider requests are mocked."""
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import unittest

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parent.parent


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class ModelSettingsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
        Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.playwright = sync_playwright().start()
        chrome = Path('C:/Program Files/Google/Chrome/Application/chrome.exe')
        cls.browser = cls.playwright.chromium.launch(headless=True, **({'executable_path': str(chrome)} if chrome.exists() else {}))

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        self.context = self.browser.new_context(service_workers='block', viewport={'width': 375, 'height': 900}, is_mobile=True, has_touch=True)
        self.page = self.context.new_page()
        self.calls, self.errors, self.held = [], [], []
        self.fail_google = False
        self.hold_google = False
        self.page.on('pageerror', lambda err: self.errors.append(str(err)))
        self.page.route('https://api.openai.com/**', self.api)
        self.page.route('https://generativelanguage.googleapis.com/**', self.api)
        self.url = f'http://127.0.0.1:{self.server.server_port}'

    def tearDown(self):
        self.context.close()
        self.assertEqual(self.errors, [])

    def api(self, route):
        req = route.request
        google = 'googleapis.com' in req.url
        self.calls.append({'provider': 'google' if google else 'openai', 'url': req.url, 'method': req.method, 'headers': req.headers, 'body': req.post_data_json if req.method == 'POST' else None})
        if req.method == 'GET':
            if google and self.hold_google:
                self.held.append(route)
                return
            if google and self.fail_google:
                route.fulfill(status=403, content_type='application/json', body='{}')
                return
            result = self.google_models() if google else {'data': [{'id': x} for x in ['gpt-6-luna', 'gpt-5.6-luna', 'gpt-6.1-sol']]}
        else:
            value = {'questions': [{'text': 'How can I improve my sleep routine?', 'why': 'Based on supplied context'}]}
            result = {'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'text': json.dumps(value)}]}}]} if google else {'choices': [{'message': {'content': json.dumps(value)}}]}
        route.fulfill(content_type='application/json', body=json.dumps(result))

    @staticmethod
    def google_models():
        return {'models': [{'name': 'models/' + x, 'supportedGenerationMethods': ['generateContent']} for x in ['gemini-3.5-flash-lite', 'gemini-3.8-flash']]}

    def open_settings(self, keys=('openai', 'google')):
        self.page.goto(self.url, wait_until='networkidle')
        self.page.evaluate('''(providers) => {
          for (const provider of providers) Tarot.store.setKey('test-' + provider + '-key', true, provider);
        }''', list(keys))
        self.page.reload(wait_until='networkidle')
        self.page.locator('#openSettings').click()

    @staticmethod
    def option(provider, model):
        return json.dumps([provider, model], separators=(',', ':'))

    def choose(self, provider, model):
        self.page.locator('#sModel').select_option(self.option(provider, model))

    def test_combines_models_and_selection_controls_request_routing(self):
        self.open_settings()
        expect(self.page.locator('#sModel option')).to_have_count(8)
        expect(self.page.locator('#sModel')).to_contain_text('OpenAI · gpt-6.1-sol')
        expect(self.page.locator('#sModel')).to_contain_text('Google · gemini-3.8-flash')
        self.choose('google', 'gemini-3.8-flash')
        # The key editor remains on OpenAI; it must not override the Google model selection.
        self.assertEqual(self.page.locator('#sProvider').input_value(), 'openai')
        self.page.locator('#saveSettings').click()
        saved = self.page.evaluate('() => Tarot.store.getSettings().ai')
        self.assertEqual(saved['provider'], 'google')
        self.assertEqual(saved['googleModel'], 'gemini-3.8-flash')
        self.page.locator('[data-start="auto"]').click()
        self.page.locator('#fQuestion').fill('I stay up watching shows and feel tired at work')
        expect(self.page.locator('#activeAiModel')).to_contain_text('Google · gemini-3.8-flash')
        self.page.locator('#openAi').click()
        expect(self.page.locator('[data-ai="0"]')).to_be_visible()
        posts = [call for call in self.calls if call['method'] == 'POST']
        self.assertEqual(len(posts), 1)
        self.assertEqual(posts[0]['provider'], 'google')
        self.assertEqual(posts[0]['headers']['x-goog-api-key'], 'test-google-key')
        self.assertNotIn('authorization', posts[0]['headers'])
        self.assertIn('gemini-3.8-flash:generateContent', posts[0]['url'])
        self.page.locator('#aiDialog [data-close]').click()
        self.page.reload(wait_until='networkidle')
        self.page.locator('#openSettings').click()
        expect(self.page.locator('#sModel')).to_have_value(self.option('google', 'gemini-3.8-flash'))

    def test_only_providers_with_keys_are_listed_and_failed_provider_is_isolated(self):
        self.open_settings(keys=('openai',))
        expect(self.page.locator('#sModel option')).to_have_count(5)
        self.assertEqual(self.page.locator('#sModel optgroup').count(), 1)
        self.assertEqual({call['provider'] for call in self.calls}, {'openai'})
        self.page.locator('#settingsDialog .dialog-close').click()
        self.page.evaluate("() => Tarot.store.setKey('test-google-key', true, 'google')")
        self.fail_google = True
        self.page.locator('#openSettings').click()
        expect(self.page.locator('#modelListStatus')).to_contain_text('Google 拒絕存取')
        expect(self.page.locator('#sModel')).to_contain_text('OpenAI · gpt-6.1-sol')
        self.choose('openai', 'gpt-6.1-sol')
        self.page.locator('#saveSettings').click()
        self.assertEqual(self.page.evaluate('() => Tarot.store.getSettings().ai.provider'), 'openai')

    def test_deleted_key_discards_delayed_model_results(self):
        self.hold_google = True
        self.open_settings()
        expect(self.page.locator('#modelListStatus')).to_contain_text('OpenAI：3 個模型')
        self.page.locator('[data-key-delete="google"]').click()
        self.assertEqual(self.page.locator('#sModel optgroup').count(), 1)
        self.assertEqual(len(self.held), 1)
        with self.page.expect_response(lambda res: 'googleapis.com' in res.url):
            self.held[0].fulfill(content_type='application/json', body=json.dumps(self.google_models()))
        self.page.evaluate('() => new Promise(requestAnimationFrame)')
        self.assertEqual(self.page.locator('#sModel optgroup').count(), 1)
        self.assertEqual(self.page.evaluate("() => Tarot.store.getKey('google')"), '')
        self.assertEqual(self.page.evaluate("() => Tarot.store.getKey('openai')"), 'test-openai-key')

    def test_custom_model_keeps_explicit_provider_and_cancel_discards_edits(self):
        self.open_settings()
        expect(self.page.locator('#sModel option')).to_have_count(8)
        self.choose('google', '__custom__')
        self.page.locator('#sModelCustom').fill('gemini-custom-model')
        self.page.locator('#saveSettings').click()
        self.assertEqual(self.page.evaluate('() => Tarot.store.getSettings().ai.googleModel'), 'gemini-custom-model')
        self.page.locator('#openSettings').click()
        expect(self.page.locator('#sModel')).to_have_value(self.option('google', 'gemini-custom-model'))
        self.page.locator('[data-key-edit="google"]').click()
        self.page.locator('#sKey').fill('unsaved-key')
        self.page.locator('#settingsDialog .dialog-close').click()
        self.assertEqual(self.page.evaluate("() => Tarot.store.getKey('google')"), 'test-google-key')

    def test_add_edit_delete_keys_and_prominent_backup_reminder(self):
        self.open_settings(keys=())
        expect(self.page.locator('[data-key-edit]')).to_have_count(2)
        expect(self.page.locator('[data-key-delete]')).to_have_count(0)
        expect(self.page.locator('.key-backup-note')).to_be_visible()
        self.assertEqual(self.page.locator('.key-backup-note').evaluate('(el) => getComputedStyle(el).borderLeftWidth'), '3px')
        self.page.locator('[data-key-edit="openai"]').click()
        self.page.locator('#sKey').fill('test-openai-key')
        self.page.locator('#sKey').press('Tab')
        expect(self.page.locator('#sModel option')).to_have_count(5)
        self.choose('openai', 'gpt-6-luna')
        self.page.locator('input[name="keyRemember"][value="local"]').check()
        self.page.locator('[data-key-edit="google"]').click()
        self.page.locator('#sKey').fill('test-google-key')
        self.page.locator('#sKey').press('Tab')
        expect(self.page.locator('#sModel option')).to_have_count(8)
        expect(self.page.locator('.api-key-status').nth(0)).to_contain_text('待儲存')
        expect(self.page.locator('.api-key-status').nth(1)).to_contain_text('待儲存')
        self.assertEqual(self.page.locator('#sModel').input_value(), self.option('openai', 'gpt-6-luna'))
        self.page.locator('#closeKeyEditor').click()
        expect(self.page.locator('#keyEditor')).to_be_hidden()
        self.page.locator('#saveSettings').click()
        self.assertEqual(self.page.evaluate("() => Tarot.store.getKey('openai')"), 'test-openai-key')
        self.assertEqual(self.page.evaluate("() => Tarot.store.getKey('google')"), 'test-google-key')
        self.assertTrue(self.page.evaluate("() => Tarot.store.keyRemembered('openai')"))
        self.assertFalse(self.page.evaluate("() => Tarot.store.keyRemembered('google')"))
        self.page.locator('#openSettings').click()
        expect(self.page.locator('[data-key-delete]')).to_have_count(2)
        self.page.locator('[data-key-delete="google"]').click()
        expect(self.page.locator('[data-key-delete]')).to_have_count(1)
        expect(self.page.locator('[data-key-edit="google"]')).to_have_text('新增 key')
        self.assertEqual(self.page.evaluate("() => Tarot.store.getKey('google')"), '')
        self.assertEqual(self.page.evaluate("() => Tarot.store.getKey('openai')"), 'test-openai-key')

    def test_no_keys_and_responsive_layout(self):
        self.open_settings(keys=())
        expect(self.page.locator('#sModel')).to_be_disabled()
        self.assertEqual(self.calls, [])
        self.page.locator('#saveSettings').click()
        for width in [320, 375, 1280]:
            self.page.set_viewport_size({'width': width, 'height': 900})
            self.page.locator('#openSettings').click()
            self.assertTrue(self.page.locator('#settingsDialog').evaluate('(el) => el.scrollWidth <= el.clientWidth'))
            self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
            self.page.locator('#settingsDialog .dialog-close').click()


if __name__ == '__main__':
    unittest.main()
