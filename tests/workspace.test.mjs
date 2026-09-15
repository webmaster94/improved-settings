import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { SettingWorkspace, locationText, sameValue } from '../scripts/workspace.js';
import { registerControlAdapter, WindowFilter } from '../scripts/dom.js';

function setup(html, options = {}) {
  const dom = new JSDOM(`<form>${html}</form>`, { url: 'https://test.invalid' });
  const document = dom.window.document;
  const values = { 'sample.limit': 4, 'sample.enabled': true };
  const game = { world: { id: 'qa' }, user: { id: 'gm', can: () => true }, i18n: { localize: x => x }, settings: {
    settings: new Map([
      ['sample.limit', { namespace: 'sample', key: 'limit', name: 'Limit', default: 2, scope: 'world', requiresReload: true }],
      ['sample.enabled', { namespace: 'sample', key: 'enabled', name: 'Enabled', default: false, scope: 'client' }]
    ]), get: (namespace, key) => values[`${namespace}.${key}`]
  } };
  const app = { element: document.querySelector('form'), options: {} };
  const previews = [];
  const workspace = new SettingWorkspace({ game, document, storage: dom.window.localStorage, confirm: async data => { previews.push(data); return true; }, copy: async () => {}, ...options });
  workspace.attach(app, { main: true, namespace: 'sample' });
  return { dom, document, app, workspace, values, previews };
}

test('tracks edits hidden by filtering, compares typed defaults, and only clears dirty state after saved values match', () => {
  const { app, workspace, values } = setup('<div class="form-group"><label>Limit</label><input type="number" name="sample.limit" value="4"></div>');
  const input = app.element.querySelector('input');
  assert.equal(workspace.records()[0].different, true);
  assert.equal(workspace.records()[0].dirty, false);
  input.value = '9';
  const filter = new WindowFilter(app.element);
  filter.apply('unrelated');
  workspace.attach(app, { main: true, namespace: 'sample' });
  assert.equal(workspace.records()[0].dirty, true);
  assert.equal(input.value, '9');
  values['sample.limit'] = 9;
  workspace.attach(app, { main: true, namespace: 'sample' });
  assert.equal(workspace.records()[0].dirty, false);
});

test('normalization on initial render does not count as an edit, and sets compare with multi-select arrays', () => {
  const { workspace } = setup('<div class="form-group"><label>Limit</label><select name="sample.limit"><option value="four">Four</option></select></div>');
  assert.equal(workspace.records()[0].dirty, false);
  assert.equal(workspace.records()[0].canWrite, false);
  assert(sameValue(new Set(['a']), ['a']));
});

test('nested object fields inherit scope and reload metadata without reading or resetting the whole object', async () => {
  const { workspace, app, values } = setup('<div class="form-group"><label>Theme</label><select name="sample.preferences.theme"><option value="dark" selected>Dark</option><option value="light">Light</option></select></div>');
  workspace.game.settings.settings.set('sample.preferences', { namespace: 'sample', key: 'preferences', name: 'Preferences', scope: 'client', default: { theme: 'light', private: 'keep' } });
  values['sample.preferences'] = { theme: 'dark', private: 'keep' };
  workspace.invalidate(app);
  workspace.attach(app, { main: false, namespace: 'sample' });
  let record = workspace.records()[0];
  assert.equal(record.scope, 'client');
  assert.equal(record.defaultValue, 'light');
  assert.equal(record.saved(), 'dark');
  assert.equal(record.settingId, 'sample.preferences.theme');
  await workspace.reset([record], 'Theme');
  assert.equal(app.element.querySelector('select').value, 'light');
  assert.deepEqual(values['sample.preferences'], { theme: 'dark', private: 'keep' });
  workspace.game.settings.settings.get('sample.preferences').requiresReload = true;
  workspace.invalidate(app);
  workspace.attach(app, { namespace: 'sample' });
  record = workspace.records()[0];
  assert.equal(record.scope, 'client');
  assert.equal(record.requiresReload, true);
});

test('reset previews include filtered controls, stage defaults through input events, and exclude unknown, disabled and sensitive controls', async () => {
  const { app, workspace, previews } = setup('<div class="form-group improved-hidden"><label>Limit</label><input type="number" name="sample.limit" value="4"></div><div class="form-group"><label>Disabled</label><input name="sample.enabled" type="checkbox" checked disabled></div><div class="form-group"><label>Unknown</label><input name="unknown" value="abc"></div><div class="form-group"><label>Secret</label><input name="secret" type="password" value="DO-NOT-COPY"></div>');
  let changes = 0;
  app.element.addEventListener('change', () => changes++);
  await workspace.reset(workspace.records(), 'sample');
  assert.equal(previews.length, 1);
  assert(previews[0].content.includes('4 → 2'));
  assert(!previews[0].content.includes('DO-NOT-COPY'));
  assert.equal(app.element.querySelector('input').value, '2');
  assert.equal(app.element.querySelector('[name="sample.enabled"]').checked, true);
  assert.equal(changes, 1);
});

test('cancelled reset and edits made while the preview is open are never overwritten', async () => {
  const fixture = setup('<div class="form-group"><label>Limit</label><input type="number" name="sample.limit" value="4"></div>');
  const { workspace, app } = fixture;
  workspace.confirm = async () => false;
  assert.equal(await workspace.reset(workspace.records(), 'sample'), false);
  assert.equal(app.element.querySelector('input').value, '4');
  workspace.confirm = async () => { app.element.querySelector('input').value = '7'; return true; };
  await workspace.reset(workspace.records(), 'sample');
  assert.equal(app.element.querySelector('input').value, '7');
});

test('favorites persist descriptions and paths only, never current or default values', () => {
  const { workspace, app, dom } = setup('<div class="form-group"><label>Private preference</label><input name="preference" value="PRIVATE-VALUE"></div>');
  const record = workspace.records()[0];
  workspace.toggleFavorite(record);
  const stored = dom.window.localStorage.getItem(workspace.storageKey);
  assert(stored.includes('Private preference'));
  assert(!stored.includes('PRIVATE-VALUE'));
  assert(!locationText(workspace.location(record)).includes('PRIVATE-VALUE'));
  assert(workspace.accepts(record.row, app, 'favorites'));
  workspace.toggleFavorite(record);
  assert.equal(workspace.favorites.size, 0);
});

test('captures stopped input events and follows controls replaced by a form render', () => {
  let updates = 0;
  const { workspace, app, dom } = setup('<div class="form-group"><label>Limit</label><input name="sample.limit" type="number" value="4"></div>', { changed: () => updates++ });
  const input = app.element.querySelector('input');
  input.addEventListener('input', event => event.stopPropagation());
  input.value = '8';
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(updates, 1);
  input.outerHTML = '<input name="sample.limit" type="number" value="7">';
  workspace.attach(app, { main: true, namespace: 'sample' });
  assert.equal(workspace.records()[0].read(), 7);
  assert.equal(workspace.records()[0].dirty, true);
});

test('a control disabled while its reset preview is open is not changed', async () => {
  const { workspace, app } = setup('<div class="form-group"><label>Limit</label><input name="sample.limit" type="number" value="4"></div>');
  workspace.confirm = async () => { app.element.querySelector('input').disabled = true; return true; };
  await workspace.reset(workspace.records(), 'sample');
  assert.equal(app.element.querySelector('input').value, '4');
});

test('custom adapters supply nested locations, defaults and immediate save behavior without package-specific detection', async () => {
  let saved = 'red';
  const remove = registerControlAdapter('test-custom', { selector: '[data-custom]', describe: row => ({ key: 'palette', default: 'blue', scope: 'user', saveMode: 'immediate', path: [{ group: 'main', tab: 'appearance', label: 'Appearance' }], getSavedValue: () => saved, setValue: (_row, value) => { saved = value; row.querySelector('input').value = value; } }) });
  try {
    const { workspace, app } = setup('<div data-custom><label>Palette</label><input name="palette" value="red"></div>');
    const record = workspace.records()[0];
    assert.equal(record.scope, 'user');
    assert(locationText(workspace.location(record)).includes('Appearance'));
    await workspace.reset([record], 'palette');
    workspace.attach(app, { namespace: 'sample' });
    assert.equal(saved, 'blue');
    assert.equal(workspace.records()[0].dirty, false);
  } finally { remove(); }
});

test('custom world metadata uses a GM chip and honors an explicit access override', () => {
  let access;
  const remove = registerControlAdapter('test-world-access', { selector: '[data-world]', describe: () => ({ scope: 'world', access }) });
  try {
    const { workspace, app } = setup('<div class="form-group" data-world><label>Shared preference</label><input name="shared"></div>');
    assert.equal(workspace.records()[0].access, 'gm');
    access = 'user';
    workspace.invalidate(app);
    workspace.attach(app, { namespace: 'sample' });
    assert.equal(workspace.records()[0].access, 'user');
  } finally { remove(); }
});

test('surrounding mode reveals search-filtered rows while preserving native hidden fields and highlights', () => {
  const { app } = setup('<nav><a data-tab="one" data-group="main">One</a></nav><section data-tab="one" data-group="main"><div class="form-group"><label>Limit</label><input name="limit"></div><div class="form-group"><label>Sound</label><input name="sound"></div><div class="form-group" hidden><label>Secret limit</label><input name="hiddenLimit"></div></section>');
  const filter = new WindowFilter(app.element);
  filter.apply('limit');
  assert(app.element.querySelector('[name="sound"]').closest('.form-group').classList.contains('improved-hidden'));
  filter.apply('limit', new Map(), { showSurrounding: true });
  assert.equal(app.element.querySelectorAll('.improved-hidden').length, 0);
  assert(app.element.querySelector('[hidden]').hidden);
  assert(app.element.querySelector('a').classList.contains('improved-match'));
});

test('setting action tools do not leave empty structural groups visible', () => {
  const { app } = setup('<fieldset><legend>Audio</legend><div class="form-group"><label>Sound</label><input name="sound"></div></fieldset><fieldset><legend>Interface</legend><div class="form-group"><label>Font</label><input name="font"></div></fieldset>');
  const filter = new WindowFilter(app.element);
  filter.apply('font');
  assert(app.element.querySelector('fieldset').classList.contains('improved-hidden'));
  assert(!app.element.querySelectorAll('fieldset')[1].classList.contains('improved-hidden'));
  filter.apply('');
  assert.equal(app.element.querySelectorAll('.improved-hidden').length, 0);
});

test('actions stay beside the native label without changing checkbox activation, and detach restores the form', () => {
  const { workspace, app } = setup('<fieldset><legend>Options</legend><div class="form-group"><label for="enabled">Enabled</label><input id="enabled" name="sample.enabled" type="checkbox"></div></fieldset>');
  const label = app.element.querySelector('label');
  const input = app.element.querySelector('input');
  const row = input.closest('.form-group');
  const actions = row.querySelector('.improved-row-actions');
  assert.equal(label.parentElement, actions.parentElement);
  assert(!label.contains(actions));
  actions.querySelector('button').click();
  assert.equal(input.checked, false);
  label.click();
  assert.equal(input.checked, true);
  new WindowFilter(app.element).apply('unrelated');
  assert(row.classList.contains('improved-hidden'));
  workspace.detach(app);
  assert.equal(label.parentElement, row);
  assert.equal(row.querySelector('.improved-row-actions'), null);
  assert.equal(app.element.querySelector('fieldset > legend').textContent, 'Options');
});
