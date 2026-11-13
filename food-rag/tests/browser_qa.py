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
        page.screenshot(path=str(artifacts / 'desktop.png'), full_page=True)
        page.locator('[data-filter="countries"][data-value="韓國"]').click()
        check('country filter only returns Korean restaurant', page.locator('#result-count').inner_text() == '1 家' and page.locator('#results').inner_text().find('雪嶽山') >= 0)
        page.locator('#reset-filters').click()
        page.locator('[data-question="想吃韓國料理，有飯，不吃牛肉"]').click()
        page.wait_for_function("!document.querySelector('#ask-submit').disabled")
        check('question retrieves Korean rice excluding beef', page.locator('.chat-answer').last.inner_text().find('雪嶽山') >= 0 and page.locator('#active-filters').inner_text().find('排除牛肉') >= 0)
        page.locator('#question').fill('不要豬肉')
        page.locator('#ask-submit').click()
        check('follow-up preserves filters and refuses mismatched results', page.locator('#result-count').inner_text() == '0 家')
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
