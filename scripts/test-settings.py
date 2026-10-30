"""Browser checks for combined model selection. All provider requests are mocked."""
import json
import re
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
        self.fail_claude = False
        self.claude_followup = False
        self.claude_blocked = False
        self.google_quiz_text = None
        self.suggest_timeframe = ''
        self.page.on('pageerror', lambda err: self.errors.append(str(err)))
        self.page.route('https://api.openai.com/**', self.api)
        self.page.route('https://generativelanguage.googleapis.com/**', self.api)
        self.page.route('https://api.anthropic.com/**', self.api)
        self.url = f'http://127.0.0.1:{self.server.server_port}'

    def tearDown(self):
        self.context.close()
        self.assertEqual(self.errors, [])

    def api(self, route):
        req = route.request
        google = 'googleapis.com' in req.url
        claude = 'anthropic.com' in req.url
        self.calls.append({'provider': 'claude' if claude else 'google' if google else 'openai', 'url': req.url, 'method': req.method, 'headers': req.headers, 'body': req.post_data_json if req.method == 'POST' else None})
        if req.method == 'GET':
            if claude:
                route.fulfill(status=403 if self.fail_claude else 200, content_type='application/json', body=json.dumps({'data': [
                    {'id': 'claude-haiku-5-5', 'lifecycle': 'active'},
                    {'id': 'claude-sonnet-5-5', 'lifecycle': 'active'},
                    {'id': 'claude-sonnet-4-5-20250929', 'lifecycle': 'deprecated'},
                ], 'has_more': False}))
                return
            if google and self.hold_google:
                self.held.append(route)
                return
            if google and self.fail_google:
                route.fulfill(status=403, content_type='application/json', body='{}')
                return
            result = self.google_models() if google else {'data': [{'id': x} for x in ['gpt-6-luna', 'gpt-5.6-luna', 'gpt-6.1-sol']]}
        else:
            if claude:
                schema = req.post_data_json['output_config']['format']['schema']
                if 'followUp' not in schema['properties']:
                    value = {'questions': [{'label': 'Preferred bedtime?', 'type': 'single', 'options': ['Earlier', 'Later'], 'placeholder': ''}]}
                elif self.claude_followup:
                    self.claude_followup = False
                    value = {'followUp': 'What time do you go to sleep?', 'questions': [], 'category': '', 'timeframe': '', 'spreads': []}
                else:
                    value = {'followUp': '', 'questions': [{'text': 'How can I improve my sleep routine?', 'why': 'Based on supplied context'}], 'category': '', 'timeframe': '', 'spreads': []}
                result = {'stop_reason': 'end_turn', 'content': [{'type': 'text', 'text': json.dumps(value)}]}
                if self.claude_blocked:
                    result = {'stop_reason': 'end_turn', 'stop_details': {'type': 'refusal'}, 'content': []}
                route.fulfill(content_type='application/json', body=json.dumps(result))
                return
            value = {'questions': [{'text': 'How can I improve my sleep routine?', 'why': 'Based on supplied context'}], 'timeframe': self.suggest_timeframe}
            if google and 'followUp' not in req.post_data_json['generationConfig']['responseJsonSchema']['properties']:
                text = self.google_quiz_text or json.dumps({'questions': [{'label': 'What has your manager said?', 'type': 'single', 'options': ['We spoke', 'Not yet'], 'placeholder': ''}]})
                route.fulfill(content_type='application/json', body=json.dumps({'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'text': text}]}}]}))
                return
            result = {'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'text': json.dumps(value)}]}}]} if google else {'choices': [{'message': {'content': json.dumps(value)}}]}
        route.fulfill(content_type='application/json', body=json.dumps(result))

    @staticmethod
    def google_models():
        return {'models': [{'name': 'models/' + x, 'supportedGenerationMethods': ['generateContent']} for x in ['gemini-3.5-flash-lite', 'gemini-3.8-flash']]}

    def open_settings(self, keys=('openai', 'google'), show_all=True):
        self.page.goto(self.url, wait_until='networkidle')
        self.page.evaluate('''(providers) => {
          for (const provider of providers) Tarot.store.setKey('test-' + provider + '-key', true, provider);
        }''', list(keys))
        self.page.reload(wait_until='networkidle')
        self.page.locator('#openSettings').click()
        if show_all:
            self.page.locator('#showAllModels').check()

    @staticmethod
    def option(provider, model):
        return json.dumps([provider, model], separators=(',', ':'))

    def choose(self, provider, model):
        self.page.locator('#modelPickerToggle').click()
        value = json.dumps(self.option(provider, model))
        self.page.locator('#modelPickerList button[data-model-value=' + value + ']').click()

    def test_mobile_model_picker_fits_and_keyboard_dismisses_without_closing_settings(self):
        self.open_settings(keys=('openai', 'google', 'claude'), show_all=True)
        expect(self.page.locator('#sModel option')).to_have_count(11)
        for width, height in [(320, 568), (375, 667), (412, 915), (844, 390), (1280, 800)]:
            self.page.set_viewport_size({'width': width, 'height': height})
            toggle = self.page.locator('#modelPickerToggle')
            toggle.click()
            picker = self.page.locator('#modelPickerList')
            expect(picker).to_be_visible()
            bounds = picker.bounding_box()
            self.assertGreaterEqual(bounds['x'], 0)
            self.assertLessEqual(bounds['x'] + bounds['width'], width)
            self.assertLessEqual(bounds['height'], min(280, height * .38) + 1)
            self.assertTrue(picker.evaluate('(el) => el.scrollWidth <= el.clientWidth'))
            self.page.keyboard.press('Escape')
            expect(picker).to_be_hidden()
            expect(self.page.locator('#settingsDialog')).to_be_visible()
            expect(toggle).to_be_focused()
        self.page.set_viewport_size({'width': 375, 'height': 667})
        self.choose('claude', 'claude-haiku-5-5')
        expect(self.page.locator('#modelPickerValue')).to_contain_text('Claude · claude-haiku-5-5')
        expect(self.page.locator('#modelPickerList')).to_be_hidden()
        self.page.locator('#saveSettings').click()
        self.assertEqual(self.page.evaluate('() => Tarot.store.getSettings().ai.provider'), 'claude')

    def test_saved_reading_uses_its_own_timeframe_in_prompt_and_positions(self):
        self.page.goto(self.url, wait_until='networkidle')
        for spread in ['timeline', 'fortune']:
            for timeframe in ['一週內', '一個月內', '接下來十天']:
                with self.subTest(spread=spread, timeframe=timeframe):
                    self.page.evaluate('''({spread, timeframe}) => {
                        const T = Tarot;
                        const id = spread + timeframe;
                        T.store.saveRecord({id, spreadId: spread, mode: 'auto', createdAt: Date.now(),
                            form: {question: '我要如何改善工作狀況？', category: '事業', timeframe},
                            cards: Object.keys(T.CARD_BY_ID).slice(0, T.SPREAD_BY_ID[spread].positions.length).map(id => ({id, reversed: false})),
                            jumpers: [], clarifiers: [], withOptional: false});
                        location.hash = '#/result/' + encodeURIComponent(id);
                    }''', {'spread': spread, 'timeframe': timeframe})
                    prompt = self.page.locator('#promptText')
                    expect(prompt).to_have_value(re.compile('timeframe: "' + timeframe + '"'))
                    text = prompt.input_value()
                    self.assertIn(f'querent.timeframe「{timeframe}」為準', text)
                    self.assertNotIn('未來兩到三個月的狀態', text)
                    if spread == 'fortune':
                        expect(self.page.locator('#resultBoard .bslot-no').last).to_have_attribute('title', '第 6 階段')

    def test_ai_suggestion_does_not_overwrite_selected_timeframe(self):
        self.open_settings(keys=('openai',), show_all=False)
        self.choose('openai', 'gpt-6-luna')
        self.page.locator('#saveSettings').click()
        self.page.locator('[data-start="auto"]').click()
        self.page.locator('#fQuestion').fill('I need a clearer plan to improve communication with my manager')
        self.suggest_timeframe = '三個月'
        for timeframe in ['一週內', '一個月內', '接下來十天']:
            with self.subTest(timeframe=timeframe):
                if timeframe == '接下來十天':
                    self.page.locator('[data-tf-custom]').click()
                    self.page.locator('#fTimeframeCustom').fill(timeframe)
                else:
                    self.page.locator(f'[data-tf="{timeframe}"]').click()
                self.page.locator('#openAi').click()
                expect(self.page.locator('[data-ai="0"]')).to_be_visible()
                self.page.locator('[data-ai="0"]').click()
                actual = self.page.evaluate('() => Tarot.store.getDraft().form.timeframe')
                self.assertEqual(actual, timeframe)
                body = [call for call in self.calls if call['method'] == 'POST'][-1]['body']
                self.assertIn(timeframe, json.dumps(body, ensure_ascii=False))

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
        self.page.locator('#showAllModels').check()
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
        expect(self.page.locator('[data-key-edit]')).to_have_count(3)
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

    def test_claude_add_key_application_link_and_session_storage(self):
        self.open_settings(keys=())
        self.page.locator('[data-key-edit="claude"]').click()
        expect(self.page.locator('#keyLabel')).to_have_text('Claude API key')
        expect(self.page.locator('#keyHelpLink')).to_have_attribute('href', 'https://platform.claude.com/settings/keys')
        self.page.locator('#sKey').fill('test-claude-key')
        self.page.locator('#sKey').press('Tab')
        expect(self.page.locator('#sModel option')).to_have_count(4)
        self.choose('claude', 'claude-haiku-5-5')
        expect(self.page.locator('#modelHint')).to_contain_text('$0.10')
        self.page.locator('#saveSettings').click()
        self.assertEqual(self.page.evaluate("() => Tarot.store.getKey('claude')"), 'test-claude-key')
        self.assertFalse(self.page.evaluate("() => Tarot.store.keyRemembered('claude')"))
        self.assertEqual(self.page.evaluate("() => Tarot.store.getKey('openai')"), '')
        self.page.reload(wait_until='networkidle')
        self.page.locator('#openSettings').click()
        expect(self.page.locator('#sModel')).to_have_value(self.option('claude', 'claude-haiku-5-5'))

    def test_claude_selection_routes_quiz_followup_and_suggestions(self):
        self.open_settings(keys=('openai', 'google', 'claude'))
        expect(self.page.locator('#sModel option')).to_have_count(11)
        self.choose('claude', 'claude-sonnet-5-5')
        # Managing an OpenAI key must not change a selected Claude model.
        self.assertEqual(self.page.locator('#sProvider').input_value(), 'openai')
        self.page.locator('#saveSettings').click()
        self.assertEqual(self.page.evaluate('() => Tarot.store.getSettings().ai.provider'), 'claude')
        self.page.locator('[data-start="auto"]').click()
        self.page.locator('#categoryChips .chip').nth(3).click()
        self.page.locator('#fQuestion').fill('I stay up watching shows and feel tired at work')
        expect(self.page.locator('#activeAiModel')).to_contain_text('Claude · claude-sonnet-5-5')
        self.page.locator('#aiQuiz').click()
        expect(self.page.locator('#bgQuizBody')).to_contain_text('Preferred bedtime?')
        self.claude_followup = True
        self.page.locator('#openAi').click()
        expect(self.page.locator('.followup')).to_contain_text('What time')
        self.page.locator('#aiFollow').fill('After midnight while watching shows')
        self.page.locator('#aiFollowSend').click()
        self.page.locator('[data-ai="0"]').click()
        expect(self.page.locator('#fQuestion')).to_have_value('How can I improve my sleep routine?')
        posts = [call for call in self.calls if call['method'] == 'POST']
        self.assertEqual(len(posts), 3)
        for call in posts:
            self.assertEqual(call['provider'], 'claude')
            self.assertEqual(call['headers']['x-api-key'], 'test-claude-key')
            self.assertEqual(call['headers']['anthropic-version'], '2026-10-21')
            self.assertEqual(call['headers']['anthropic-dangerous-direct-browser-access'], 'true')
            self.assertNotIn('authorization', call['headers'])
            self.assertNotIn('x-goog-api-key', call['headers'])
            self.assertEqual(call['body']['model'], 'claude-sonnet-5-5')
        self.claude_blocked = True
        self.page.locator('#openAi').click()
        expect(self.page.locator('#aiFallback')).to_be_visible()
        self.page.locator('#aiDialog [data-close]').click()
        self.page.locator('#openSettings').click()
        expect(self.page.locator('#sModel')).to_have_value(self.option('claude', 'claude-sonnet-5-5'))
        self.page.locator('[data-key-delete="claude"]').click()
        self.assertEqual(self.page.evaluate("() => Tarot.store.getKey('claude')"), '')
        self.assertEqual(self.page.evaluate("() => Tarot.store.getKey('openai')"), 'test-openai-key')
        self.assertEqual(self.page.evaluate("() => Tarot.store.getKey('google')"), 'test-google-key')

    def test_claude_model_error_does_not_hide_other_providers(self):
        self.fail_claude = True
        self.open_settings(keys=('openai', 'google', 'claude'))
        expect(self.page.locator('#modelListStatus')).to_contain_text('Claude 拒絕存取')
        expect(self.page.locator('#sModel')).to_contain_text('Google · gemini-3.8-flash')
        expect(self.page.locator('#sModel')).to_contain_text('OpenAI · gpt-6.1-sol')
        self.choose('google', 'gemini-3.8-flash')
        self.page.locator('#saveSettings').click()
        self.assertEqual(self.page.evaluate('() => Tarot.store.getSettings().ai.provider'), 'google')

    def test_recommended_default_and_show_all_toggle_preserves_explicit_choices(self):
        self.open_settings(keys=('openai', 'google', 'claude'), show_all=False)
        expect(self.page.locator('#showAllModels')).not_to_be_checked()
        expect(self.page.locator('#sModel option')).to_have_count(5)
        self.assertNotIn('gemini-3.8-flash', self.page.locator('#sModel').text_content())
        self.assertNotIn('claude-sonnet-5-5', self.page.locator('#sModel').text_content())
        self.page.locator('#showAllModels').check()
        expect(self.page.locator('#sModel option')).to_have_count(11)
        self.choose('claude', 'claude-sonnet-5-5')
        self.page.locator('#showAllModels').uncheck()
        expect(self.page.locator('#sModel option')).to_have_count(5)
        self.assertEqual(self.page.locator('#sModel').input_value(), '')
        self.page.locator('#showAllModels').check()
        expect(self.page.locator('#sModel')).to_have_value(self.option('claude', 'claude-sonnet-5-5'))
        self.choose('claude', 'claude-haiku-5-5')
        self.page.locator('#showAllModels').uncheck()
        self.page.locator('#saveSettings').click()
        self.page.reload(wait_until='networkidle')
        self.page.locator('#openSettings').click()
        expect(self.page.locator('#showAllModels')).not_to_be_checked()
        expect(self.page.locator('#sModel')).to_have_value(self.option('claude', 'claude-haiku-5-5'))

    def test_google_quiz_accepts_wrapped_array_and_exposes_unparseable_response(self):
        self.open_settings(keys=('google',), show_all=False)
        expect(self.page.locator('#sModel option')).to_have_count(2)
        self.choose('google', 'gemini-3.5-flash-lite')
        self.page.locator('#saveSettings').click()
        self.page.locator('[data-start="auto"]').click()
        self.page.locator('#categoryChips .chip').nth(7).click()
        self.page.locator('#fQuestion').fill('Unplanned leave has made communication with my manager awkward')
        self.google_quiz_text = '```json\n' + json.dumps([{'question': 'What has your manager said?', 'type': 'single', 'options': [{'label': 'We spoke'}, {'label': 'Not yet'}]}]) + '\n```'
        self.page.locator('#aiQuiz').click()
        expect(self.page.locator('#bgQuizBody')).to_contain_text('What has your manager said?')
        posts = [call for call in self.calls if call['method'] == 'POST']
        self.assertEqual(len(posts), 1)
        self.assertIn('label', posts[0]['body']['generationConfig']['responseJsonSchema']['properties']['questions']['items']['properties'])
        self.google_quiz_text = '{"questions":['
        self.page.locator('#aiQuiz').click()
        details = self.page.locator('#bgQuizBody details').last
        expect(details.locator('summary')).to_be_visible()
        details.locator('summary').click()
        expect(details.locator('pre')).to_have_text('{"questions":[')
        # A failed refresh does not delete the previously generated questions.
        expect(self.page.locator('#bgQuizBody')).to_contain_text('What has your manager said?')


if __name__ == '__main__':
    unittest.main()
