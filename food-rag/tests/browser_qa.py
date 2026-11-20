"""Use installed Chrome; playwright may be installed in the temp directory."""
import argparse
import functools
import http.server
import json
import os
from pathlib import Path
import sys
import threading

sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, str(Path(os.environ['TEMP']) / 'food-rag-qa-tools'))
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--url')
args = parser.parse_args()
server = None
if args.url:
    base = args.url.rstrip('/') + '/'
else:
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 8765), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = 'http://127.0.0.1:8765/food-rag/'
artifacts = ROOT / 'artifacts' / 'food-rag'
artifacts.mkdir(parents=True, exist_ok=True)
checks = []
def check(name, condition):
    checks.append({'name': name, 'pass': bool(condition)})
    print(('PASS ' if condition else 'FAIL ') + name, flush=True)

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe', headless=True)
        page = browser.new_page(viewport={'width': 1440, 'height': 1100}, device_scale_factor=1)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        if not args.url:
            page.goto(base + 'tests/', wait_until='networkidle')
            page.wait_for_function('window.testResults !== undefined')
            engine = page.evaluate('window.testResults')
            for test in engine['checks']:
                check('engine: ' + test['name'], test['pass'])
        page.goto(base, wait_until='networkidle')
        page.wait_for_function("document.querySelector('#food-total').textContent === '89'")
        check('initial page: 89 foods / 22 restaurants', page.locator('#restaurant-total').inner_text() == '22')
        check('first page contains eight restaurant cards', page.locator('#results .restaurant-card').count() == 8)
        check('desktop has no horizontal overflow', page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        check('default distance weight is 25 percent', page.locator('#weight').input_value() == '25' and '25%' in page.locator('#formula').text_content())
        page.screenshot(path=str(artifacts / 'desktop.png'), full_page=True)
        page.locator('[data-filter="countries"][data-value="韓國"]').click()
        check('country filter only returns Korean restaurant', page.locator('#result-count').inner_text() == '1 家' and page.locator('#results').inner_text().find('雪嶽山') >= 0)
        page.locator('#reset-filters').click()
        page.locator('[data-question="想吃韓國料理，有飯，不吃牛肉"]').click()
        page.wait_for_function("!document.querySelector('#ask-submit').disabled")
        check('question retrieves Korean rice excluding beef', page.locator('.chat-answer').last.inner_text().find('雪嶽山') >= 0 and page.locator('#active-filters').inner_text().find('排除牛肉') >= 0)
        page.locator('#reuse-conditions').check()
        page.locator('#question').fill('不要豬肉')
        page.locator('#ask-submit').click()
        check('follow-up preserves filters and refuses mismatched results', page.locator('#result-count').inner_text() == '0 家')
        check('new search replaces previous question, answer, citations and trace', page.locator('.chat-message').count() == 1 and page.locator('.chat-question').inner_text() == '不要豬肉' and page.locator('.answer-citations a').count() == 0 and page.locator('.trace-row').count() == 0)
        page.locator('#reset-filters').click()
        check('reset removes the displayed question and answer', page.locator('.chat-message').count() == 0)
        check('reset turns off condition reuse', not page.locator('#reuse-conditions').is_checked())
        page.locator('#question').fill('500公尺內的韓式料理，有飯，不吃牛肉')
        page.locator('#ask-submit').click()
        page.locator('#question').fill('泰式料理')
        page.locator('#ask-submit').click()
        check('typed question resets previous cuisine, staple, exclusion and radius', page.locator('#active-filters .active-filter:not(button)').all_inner_texts() == ['泰國'] and page.locator('#radius').input_value() == '2000')
        page.locator('#question').fill('小籠包多少錢？')
        page.locator('#ask-submit').click()
        check('price question retrieves dumplings and reports missing price', '小籠包' in page.locator('#results').inner_text() and '沒有價格資料' in page.locator('.chat-answer').inner_text())
        page.locator('.retrieval-trace > summary').click()
        check('the prompt starts collapsed', not page.locator('.prompt-preview pre').first.is_visible())
        page.locator('.prompt-preview > summary').click()
        check('prompt preview contains system instructions, original question, filters and evidence without a model', page.locator('.prompt-preview pre').count() == 2 and '你是食在北車美食助理' in page.locator('.prompt-preview pre').first.inner_text() and all(value in page.locator('.prompt-preview pre').last.inner_text() for value in ['小籠包多少錢？', '套用條件', '以下為可引用的檢索結果', 'sourceIds']))
        page.locator('#question').fill('我想吃口味重的食物')
        page.locator('#ask-submit').click()
        check('strong-flavor question returns restaurants with flavor evidence', page.locator('#results .restaurant-card').count() > 1 and '風味依據' in page.locator('.chat-answer').inner_text() and '重口味' in page.locator('#active-filters .active-filter:not(button)').all_inner_texts())
        page.locator('#reset-filters').click()
        page.locator('#load-more').click()
        check('expanded results show sixteen cards before another search', page.locator('#results .restaurant-card').count() == 16)
        repeated_heights = []
        for _ in range(3):
            page.locator('#question').fill('推薦附近美食')
            page.locator('#ask-submit').click()
            page.wait_for_function("!document.querySelector('#ask-submit').disabled")
            repeated_heights.append(page.evaluate('document.documentElement.scrollHeight'))
        check('repeated searches keep one answer and reset result pagination', page.locator('.chat-message').count() == 1 and page.locator('.retrieval-trace').count() == 1 and page.locator('#results .restaurant-card').count() == 8)
        check('repeating the same search does not increase page length', max(repeated_heights) - min(repeated_heights) <= 1)
        check('RAG explanation is the last content section', page.locator('main > section').last.get_attribute('id') == 'rag-guide' and page.locator('.rag-flow > li').count() == 4)
        check('RAG explanation distinguishes summary and model generation', 'TF-IDF' in page.locator('#rag-guide').inner_text() and '距離權重' in page.locator('#rag-guide').inner_text() and '才會' in page.locator('.rag-modes').inner_text())
        page.locator('#reset-filters').click()
        page.locator('#question').fill('韓國鰻魚飯')
        page.locator('#ask-submit').click()
        check('missing dish evidence is shown instead of nearby substitutes', page.locator('#result-count').inner_text() == '0 家' and '相關度門檻' in page.locator('#results').inner_text() and '距離近' in page.locator('.chat-answer').inner_text())
        page.locator('#weight').fill('80')
        page.locator('#weight').dispatch_event('input')
        check('maximum distance weight still refuses missing dish evidence', page.locator('#result-count').inner_text() == '0 家')
        page.locator('#reset-filters').click()
        page.locator('#question').fill('beef noodles')
        page.locator('#ask-submit').click()
        check('English ingredient aliases return relevant foods', page.locator('#results .restaurant-card').count() > 0 and '牛肉' in page.locator('#active-filters').inner_text())
        page.locator('.retrieval-trace > summary').click()
        check('filter-only search is described without a fake similarity score', '本次是條件篩選' in page.locator('.retrieval-trace').inner_text() and '相似度 0.000' not in page.locator('.trace-row').first.inner_text())
        page.locator('#reset-filters').click()
        page.locator('#question').fill('台灣紅燒牛肉麵')
        page.locator('#ask-submit').click()
        page.locator('.retrieval-trace > summary').click()
        check('dish search shows coverage evidence and excludes unrelated broth', '覆蓋率' in page.locator('.trace-row').first.inner_text() and '清燉' not in page.locator('#results').inner_text())
        page.locator('#reset-filters').click()
        page.locator('#question').fill('500公尺內的日本豬排飯')
        page.locator('#ask-submit').click()
        check('500m pork-rice question finds Japanese food', page.locator('#results .restaurant-card').count() > 0 and '500 m' == page.locator('#radius-output').inner_text())
        page.locator('#results .save-button').first.click()
        check('favorite counter updates', page.locator('#favorite-count').inner_text() == '1')
        page.locator('#favorites-open').click()
        check('favorites dialog displays saved restaurant', page.locator('#favorite-results .restaurant-card').count() == 1)
        page.keyboard.press('Escape')
        page.reload(wait_until='networkidle')
        check('favorite persists after reload', page.locator('#favorite-count').inner_text() == '1')
        page.locator('#map-view').click()
        check('map pins represent all filtered restaurants', page.locator('.map-pin').count() == 22)
        page.locator('.map-pin').last.focus()
        page.keyboard.press('Enter')
        check('map pin opens corresponding card with keyboard', page.locator('.card-highlight').count() == 1)
        page.locator('#list-view').click()
        page.locator('#knowledge-open').click()
        check('knowledge dialog contains every record', page.locator('.knowledge-row').count() == 89)
        page.locator('#knowledge-search').fill('韓國')
        check('knowledge search filters records', page.locator('.knowledge-row').count() == 5)
        page.keyboard.press('Escape')
        page.locator('#question').fill('<img src=x onerror="window.injected=true">')
        page.locator('#ask-submit').click()
        check('question text is escaped', page.locator('.chat-history img').count() == 0 and not page.evaluate('Boolean(window.injected)'))
        page.locator('#ai-open').click()
        check('AI dialog explains model download and mode', '1 GB' in page.locator('#ai-dialog').inner_text() and '沒有語言模型生成' in page.locator('#ai-dialog').inner_text())
        page.keyboard.press('Escape')
        page.locator('#reset-filters').click()
        for width in [390, 360]:
            page.set_viewport_size({'width': width, 'height': 844})
            page.evaluate('scrollTo(0,0)')
            check(f'mobile {width}px has no horizontal overflow', page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
            page.screenshot(path=str(artifacts / f'mobile-{width}.png'), full_page=True)
        check('no JavaScript runtime errors', not errors)
        fallback = browser.new_page()
        fallback.add_init_script("Object.defineProperty(navigator,'gpu',{get:()=>undefined,configurable:true})")
        fallback.goto(base, wait_until='networkidle')
        fallback.locator('#ai-open').click()
        fallback.locator('#load-ai').click()
        check('non-WebGPU browser receives usable fallback', '尚未提供 WebGPU' in fallback.locator('#model-status').inner_text())
        browser.close()
finally:
    if server:
        server.shutdown()
    result = {'passed': sum(x['pass'] for x in checks), 'total': len(checks), 'checks': checks}
    (artifacts / ('live-results.json' if args.url else 'qa-results.json')).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'passed': result['passed'], 'total': result['total']}, ensure_ascii=False))
if not all(x['pass'] for x in checks):
    raise SystemExit(1)
