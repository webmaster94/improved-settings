/** Browser-only fixture. No setting values are persisted or real module defaults reset. */
export async function runWorkspaceVerification() {
  const api = game.modules.get('improved-settings').api;
  const checks = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const sheet = game.settings.sheet;
  const menuKey = 'improved-settings.workspaceQA';
  const settingId = 'improved-settings.workspaceLimitQA';
  let child, removeProvider, removeAdapter, favorite;
  let saved = 4;
  class WorkspaceQA extends foundry.applications.api.ApplicationV2 {
    static DEFAULT_OPTIONS = { id: 'improved-settings-workspace-qa', tag: 'form', window: { title: 'Workspace verification', resizable: true }, position: { width: 440, height: 400 }, form: { handler: () => {} } };
    tabGroups = { primary: 'first', secondary: 'nested' };
    async _renderHTML() {
      return '<nav class="tabs"><a data-action="tab" data-group="primary" data-tab="first">First</a><a data-action="tab" data-group="primary" data-tab="second">Second</a></nav><section class="tab active" data-group="primary" data-tab="first"><div class="form-group"><label>Ordinary sound</label><input name="sound" value="untouched"></div></section><section class="tab" data-group="primary" data-tab="second"><nav><a data-action="tab" data-group="secondary" data-tab="nested">Nested</a></nav><section class="tab active" data-group="secondary" data-tab="nested"><div class="form-group" data-workspace-qa><label>Prismatic limit</label><input name="prismatic" type="number" value="4"></div><div class="form-group" hidden><label>Conditional control</label><input name="condition" value="protected"></div></section></section><footer><button type="submit">Save</button></footer>';
    }
    _replaceHTML(html, content) { content.innerHTML = html; }
  }
  const setMode = mode => {
    const select = sheet.element.querySelector('.improved-filter'); select.value = mode; select.dispatchEvent(new Event('change', { bubbles: true }));
  };
  try {
    game.settings.register('improved-settings', 'workspaceLimitQA', { name: 'Workspace main limit', scope: 'client', config: true, type: Number, default: 2 });
    game.settings.registerMenu('improved-settings', 'workspaceQA', { name: 'Workspace verification', label: 'Open workspace verification', type: WorkspaceQA, restricted: true });
    removeProvider = api.registerMenuIndexer(menuKey, async () => [{ key: 'prismatic', label: 'Prismatic limit', default: 2, scope: 'user', requiresReload: true, path: [{ group: 'primary', tab: 'second', label: 'Second' }, { group: 'secondary', tab: 'nested', label: 'Nested' }] }]);
    removeAdapter = api.registerControlAdapter('workspace-qa', { selector: '[data-workspace-qa]', describe: () => ({ default: 2, scope: 'user', requiresReload: true, saveMode: 'submit', getSavedValue: () => saved }) });
    await sheet.render({ force: true, resetTabs: true });
    await api.refreshIndex();
    check(!!sheet.element.querySelector('aside .improved-favorites') && !sheet.element.querySelector('.improved-filter option[value="favorites"]'), 'Favorites are in the sidebar and absent from the Show menu');
    const searchBounds = sheet.element.querySelector('.improved-search-controls search').getBoundingClientRect();
    const showBounds = sheet.element.querySelector('.improved-filter-row').getBoundingClientRect();
    check(Math.abs(searchBounds.bottom - showBounds.bottom) < 3 && Math.abs(searchBounds.width - showBounds.width) < 3, 'Search and Show share an evenly divided row');
    api.search('prismatic', 'improved');
    const launch = sheet.element.querySelector(`[data-key="${menuKey}"]`);
    const preview = launch.closest('.form-group').querySelector('.improved-result-list button');
    check(preview?.textContent.includes('Second → Nested → Prismatic limit'), 'Unopened provider results expose their complete setting path');
    preview.click();
    await pause(750);
    child = foundry.applications.instances.get('improved-settings-workspace-qa');
    check(child?.tabGroups.primary === 'second' && child.tabGroups.secondary === 'nested', 'Selecting a result opens its window and navigates parent and nested tabs');
    const input = child.element.querySelector('[name="prismatic"]');
    const row = input.closest('.form-group');
    check(row.querySelector('.improved-badges').textContent.includes('Player') && row.querySelector('.improved-badges').textContent.includes('Reload'), 'Custom metadata displays scope and reload requirements');
    input.value = '9'; input.dispatchEvent(new Event('input', { bubbles: true }));
    await pause(180);
    api.search('ordinary');
    check(sheet.element.querySelector('.improved-edit-summary').textContent.includes('unsaved'), 'Unsaved summary persists when search hides an edited setting');
    check(input.value === '9' && row.classList.contains('improved-hidden'), 'Filtering preserves the hidden edit');
    sheet.element.querySelector('.improved-edit-summary button').click();
    check(!row.classList.contains('improved-hidden') && sheet.element.querySelector('.improved-filter').value === 'unsaved', 'Show edits clears conflicting searches and exposes the edited controls');
    check(child.element.querySelector('nav [data-tab="second"]').classList.contains('improved-dirty-tab'), 'Edited tabs are marked independently of search matches');
    saved = 9;
    api.search('prismatic');
    check(sheet.element.querySelector('.improved-edit-summary').hidden, 'Confirmed saved values remove the pending-edit indicator');
    setMode('all');
    favorite = row.querySelector('.improved-row-actions button');
    if (favorite.getAttribute('aria-pressed') === 'true') { favorite.click(); await pause(100); }
    favorite.click(); await pause(100);
    check(favorite.querySelector('.fa-solid.fa-star') && row.querySelector('[aria-label="Copy location"] .fa-passport') && !row.querySelector('details.improved-row-actions'), 'Favorite and copy are inline icons without a Settings actions disclosure');
    const storageKey = `improved-settings.favorites.${game.world.id}.${game.user.id}`;
    check(localStorage.getItem(storageKey).includes('Prismatic limit'), 'Favorites persist a custom setting location');
    check(sheet.element.querySelector('.improved-favorite-list').textContent.includes('Prismatic limit'), 'Favorites have a direct navigation list');
    api.search('unrelated', 'no-such-module');
    const favoriteLink = [...sheet.element.querySelectorAll('.improved-favorite-list button')].find(button => button.textContent.includes('Prismatic limit'));
    favoriteLink.click(); await pause(400);
    check(!row.classList.contains('improved-hidden') && sheet.element.querySelector('.improved-search-input').value === '', 'Favorite navigation removes conflicting filters');
    api.search('prismatic');
    child.element.querySelector('.improved-surrounding').click();
    check(!child.element.querySelector('[name="sound"]').closest('.form-group').classList.contains('improved-hidden') && child.element.querySelector('[name="condition"]').closest('.form-group').hidden, 'Surrounding settings restore context without exposing native-hidden controls');
    child.element.querySelector('.improved-surrounding').click();
    setMode('changed');
    check(!row.classList.contains('improved-hidden'), 'Different-from-default filtering includes supported custom fields');
    const reset = [...row.querySelectorAll('.improved-row-actions button')].find(button => button.getAttribute('aria-label') === 'Reset to default');
    reset.click(); await pause(600);
    const previewElement = document.querySelector('dialog[open] .improved-reset-preview');
    check(previewElement?.textContent.includes('9 → 2'), 'Per-setting reset presents an exact current-to-default preview');
    const dialog = previewElement.closest('dialog');
    const yes = dialog?.querySelector('[data-action="yes"]');
    check(!!yes, 'Reset preview requires an explicit confirmation');
    yes.click(); await pause(600);
    check(input.value === '2' && saved === 9, 'Confirmed reset stages the value without saving the custom form');
    const mainInput = sheet.element.querySelector(`[name="${settingId}"]`);
    mainInput.value = '8'; mainInput.dispatchEvent(new Event('input', { bubbles: true }));
    for (let attempt = 0; attempt < 12 && sheet.element.querySelector('.improved-options button').disabled; attempt++) await pause(250);
    sheet.element.querySelector('.improved-options button').click(); await pause(600);
    const modulePreview = document.querySelector('dialog[open] .improved-reset-preview');
    check(modulePreview?.textContent.includes('Workspace main limit: 8 → 2'), 'Module reset includes editable settings hidden by the active search');
    modulePreview.closest('dialog').querySelector('[data-action="yes"]').click(); await pause(600);
    check(mainInput.value === '2' && game.settings.get('improved-settings', 'workspaceLimitQA') === 2, 'Module reset stages native controls without persisting test values');
    setMode('all');
    api.search('prismatic', 'no-such-module');
    const recovery = [...sheet.element.querySelectorAll('.improved-recovery button')].find(button => button.textContent === 'Search all modules');
    check(!!recovery, 'Empty results offer a targeted recovery action');
    recovery.click();
    check(sheet.element.querySelector('[aria-label="Settings"]').value === 'prismatic' && sheet.element.querySelector('[aria-label="Modules"]').value === '', 'Recovery preserves the settings query while clearing the module filter');
    const coverage = api.coverage();
    check(coverage.observed > 0 && coverage.described >= 0 && coverage.unknown >= 0 && coverage.observed + coverage.described + coverage.unknown === coverage.total, 'Coverage separates observed, described and undiscovered windows');
    return { version: game.version, passed: checks.length, checks };
  } finally {
    if (favorite?.getAttribute('aria-pressed') === 'true') { favorite.click(); await pause(50); }
    for (const dialog of document.querySelectorAll('dialog:has(.improved-reset-preview)')) dialog.querySelector('[data-action="no"]')?.click();
    await child?.close();
    removeAdapter?.(); removeProvider?.();
    game.settings.menus.delete(menuKey); game.settings.settings.delete(settingId);
    if (sheet.rendered) await sheet.close();
    await api.refreshIndex();
    await sheet.render({ force: true, resetTabs: true });
    api.search('');
  }
}
