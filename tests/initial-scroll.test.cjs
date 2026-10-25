const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const { join } = require('node:path');
const vm = require('node:vm');

const html = readFileSync(join(__dirname, '../site/index.html'), 'utf8');
const bootstrap = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function openPage(hash = '') {
  const window = new EventTarget();
  window.scrollY = 0;
  window.scrollTo = ({ top }) => { window.scrollY = top; };
  const history = {
    state: { navigation: 'existing' },
    scrollRestoration: 'auto',
    replaceState(state, _, url) { this.state = state; this.url = url; },
  };
  vm.runInNewContext(bootstrap, {
    window, history,
    location: { hash, pathname: '/zero-hlm/', search: '?preview=1' },
  });
  return { window, history };
}

test('late resource completion must not interrupt a visitor who already scrolled', () => {
  const { window } = openPage();
  window.scrollY = 1800; // Visitor reads Abstract while images are still loading.
  window.dispatchEvent(new Event('load'));
  window.dispatchEvent(new Event('pageshow'));
  assert.equal(window.scrollY, 1800);
});

test('returning from browser history must not force the reader to the top', () => {
  const { window } = openPage();
  window.scrollY = 3200;
  const event = new Event('pageshow');
  Object.defineProperty(event, 'persisted', { value: true });
  window.dispatchEvent(event);
  assert.equal(window.scrollY, 3200);
});

test('fresh navigation starts at the top without restoring an old anchor or scroll offset', () => {
  const { window, history } = openPage('#abstract');
  assert.equal(window.scrollY, 0);
  assert.equal(history.scrollRestoration, 'manual');
  assert.equal(history.url, '/zero-hlm/?preview=1');
  assert.deepEqual(history.state, { navigation: 'existing' });
});
