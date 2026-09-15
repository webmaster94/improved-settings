import { collectRows, describeRow, controlMetadata, elementOf } from './dom.js';

const editableSelector = 'input:not([type="hidden"]):not([type="search"]):not([type="button"]):not([type="submit"]), select, textarea, range-picker, color-picker, file-picker, multi-select';
const customSelector = 'range-picker, color-picker, file-picker, multi-select';
const copyValue = value => value === undefined || typeof value === 'function' ? undefined : structuredClone(value);
const stable = value => JSON.stringify(value, (_key, item) => item instanceof Set ? [...item].sort() : item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
export const sameValue = (a, b) => stable(a) === stable(b);
const fieldValue = (value, path) => path.reduce((object, key) => object != null && Object.hasOwn(object, key) ? object[key] : undefined, value);

function registeredField(settings, name, namespace) {
  for (const candidate of [name, `${namespace}.${name}`]) {
    if (!candidate) continue;
    let key = candidate;
    const path = [];
    while (key.includes('.')) {
      const setting = settings.get(key);
      if (setting) return { setting, settingId: candidate, fieldPath: path };
      const dot = key.lastIndexOf('.');
      path.unshift(key.slice(dot + 1));
      key = key.slice(0, dot);
    }
  }
  return { fieldPath: [] };
}

export function fieldControls(row) {
  return [...row.querySelectorAll(editableSelector)].filter(el => !el.closest('[data-improved-ui]') && !el.parentElement?.closest(customSelector));
}

export function readControl(control, controls = [control]) {
  if (control.type === 'password' || control.type === 'file') return undefined;
  if (control.type === 'checkbox') return control.checked;
  if (control.type === 'radio') return controls.find(el => el.checked)?.value;
  if (control.tagName === 'SELECT' && control.multiple) return [...control.selectedOptions].map(option => option.value);
  if (control.type === 'number' || control.type === 'range' || control.tagName === 'RANGE-PICKER' || control.dataset.dtype === 'Number') return control.value === '' ? null : Number(control.value);
  if (control.dataset.dtype === 'Boolean') return control.value === 'true';
  return copyValue(control.value);
}

export function writeControl(control, value, controls = [control]) {
  if (control.type === 'checkbox') control.checked = !!value;
  else if (control.type === 'radio') controls.forEach(el => { el.checked = el.value === String(value); });
  else if (control.tagName === 'SELECT' && control.multiple) [...control.options].forEach(option => { option.selected = value.includes(option.value); });
  else control.value = value ?? '';
  const EventClass = control.ownerDocument.defaultView.Event;
  control.dispatchEvent(new EventClass('input', { bubbles: true }));
  control.dispatchEvent(new EventClass('change', { bubbles: true }));
}

export function locationText(location) {
  const path = [location.namespace, location.menuKey, ...(location.path ?? []).map(step => step.label || step.tab), location.label].filter(Boolean);
  return `${path.join(' → ')}\nSetting: ${location.settingId || location.key}`;
}

/** Values stay in these open-window trackers. Indexes, favorites and copied locations contain descriptions only. */
export class SettingWorkspace {
  constructor({ game, document, index, changed = () => {}, navigate = () => {}, confirm, copy, storage }) {
    Object.assign(this, { game, document, index, changed, navigate, confirm, copy, storage });
    this.windows = new Map();
    this.storageKey = `improved-settings.favorites.${game.world?.id ?? 'world'}.${game.user?.id ?? 'user'}`;
    try { this.favorites = new Map(JSON.parse(storage?.getItem(this.storageKey) || '[]').map(location => [location.id, location])); }
    catch { this.favorites = new Map(); }
  }

  ui(tag, className, text) {
    const element = this.document.createElement(tag);
    element.dataset.improvedUi = '';
    element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  button(text, action, title = text) {
    const button = this.ui('button', 'improved-action', text);
    button.type = 'button';
    button.title = title;
    button.setAttribute('aria-label', title);
    button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); Promise.resolve(action()).catch(error => globalThis.ui?.notifications?.error(error.message)); });
    return button;
  }

  attach(app, context) {
    const storageKey = `improved-settings.favorites.${this.game.world?.id ?? 'world'}.${this.game.user?.id ?? 'user'}`;
    if (storageKey !== this.storageKey) {
      this.storageKey = storageKey;
      try { this.favorites = new Map(JSON.parse(this.storage?.getItem(storageKey) || '[]').map(location => [location.id, location])); } catch { this.favorites = new Map(); }
    }
    let state = this.windows.get(app);
    const root = elementOf(app);
    if (!state) { state = { app, context, records: new Map() }; this.windows.set(app, state); }
    state.context = context;
    if (state.root !== root) {
      state.abort?.abort();
      state.root = root;
      state.needsScan = true;
      state.abort = new root.ownerDocument.defaultView.AbortController();
      const edited = event => {
        if (event.target.closest('[data-improved-ui]')) return;
        const record = [...state.records.values()].find(record => record.row.contains(event.target));
        if (record) record.touched = true;
        this.changed();
      };
      root.addEventListener('input', edited, { capture: true, signal: state.abort.signal });
      root.addEventListener('change', edited, { capture: true, signal: state.abort.signal });
    }
    if (!state.needsScan && [...state.records.values()].some(record => record.present && (!root.contains(record.row) || record.controls.some(control => !record.row.contains(control))))) state.needsScan = true;
    if (state.needsScan) { this.scan(state); state.needsScan = false; }
    else for (const record of state.records.values()) if (record.present) this.updateRecord(record);
    return state;
  }

  invalidate(app) { const state = this.windows.get(app); if (state) state.needsScan = true; }

  scan(state) {
    state.byRow = new WeakMap();
    for (const record of state.records.values()) record.present = false;
    const rows = collectRows(state.root);
    const rowSet = new Set(rows);
    const containers = new Set();
    for (const row of rows) if (fieldControls(row).length) for (let parent = row.parentElement; parent && parent !== state.root; parent = parent.parentElement) if (rowSet.has(parent)) containers.add(parent);
    for (const row of rows) {
      const controls = fieldControls(row);
      if (!controls.length || containers.has(row)) continue;
      const control = controls[0];
      const base = describeRow(row, state.root);
      const namespace = row.closest('[data-category]')?.dataset.category || state.context.namespace;
      const provider = this.index?.menus.get(state.context.menuKey)?.records?.find(item => item.supplied && (item.key === base.key || (item.selector && row.matches(item.selector))));
      let custom = {};
      try { custom = controlMetadata(row, { app: state.app, namespace, menuKey: state.context.menuKey }); }
      catch { /* One adapter cannot break the other settings. */ }
      const meta = { ...provider, ...custom };
      const fieldName = control.name || control.getAttribute('name');
      let { setting, settingId, fieldPath } = registeredField(this.game.settings.settings, meta.settingId || row.dataset.settingId || fieldName, namespace);
      // Nested fields inherit metadata, while reads and resets address only their exact path.
      if (!setting || (!meta.settingId && controls.length > 1 && !controls.every(el => el.type === 'radio' && el.name === fieldName))) { setting = undefined; settingId = undefined; }
      const restricted = setting?.scope === 'world' && !this.game.user.can('SETTINGS_MODIFY');
      if (restricted) continue;
      const path = meta.path ?? base.path;
      const key = meta.key ?? base.key;
      const id = JSON.stringify([namespace, state.context.menuKey ?? '', key, path.map(step => [step.group, step.tab])]);
      const old = state.records.get(id);
      const sensitive = controls.some(el => ['password', 'file'].includes(el.type));
      const read = () => {
        const value = sensitive ? undefined : meta.getValue ? copyValue(meta.getValue(row, state.app)) : readControl(control, controls);
        if (control.tagName === 'SELECT' && !control.multiple && (setting?.type === Number || fieldPath.length && typeof fieldValue(setting?.default, fieldPath) === 'number')) return Number(value);
        if (control.tagName === 'SELECT' && !control.multiple && (setting?.type === Boolean || fieldPath.length && typeof fieldValue(setting?.default, fieldPath) === 'boolean')) return value === 'true';
        return value;
      };
      const saved = setting ? () => copyValue(fieldValue(this.game.settings.get(setting.namespace, setting.key), fieldPath)) : meta.getSavedValue ? () => copyValue(meta.getSavedValue(row, state.app)) : undefined;
      let value, savedValue;
      try { value = read(); savedValue = saved?.(); } catch { continue; }
      const record = old ?? { id, baseline: copyValue(value), touched: false };
      Object.assign(record, { row, controls, control, state, present: true, namespace, menuKey: state.context.menuKey, key, settingId,
        label: meta.label || (setting && !fieldPath.length ? this.game.i18n.localize(setting.name) : base.label), path, text: base.text,
        read, saved, sensitive, scope: meta.scope ?? setting?.scope, requiresReload: meta.requiresReload ?? setting?.requiresReload,
        access: meta.access ?? ((meta.scope ?? setting?.scope) === 'world' || this.game.settings.menus?.get(state.context.menuKey)?.restricted ? 'gm' : setting || meta.scope ? 'user' : undefined),
        saveMode: meta.saveMode || (state.context.main ? 'submit' : state.app.options?.form?.submitOnChange ? 'immediate' : 'unknown'),
        defaultValue: copyValue(Object.hasOwn(meta, 'default') ? meta.default : fieldValue(setting?.default, fieldPath)),
        hasDefault: !sensitive && (Object.hasOwn(meta, 'default') || (!!setting && Object.hasOwn(setting, 'default'))),
        setValue: meta.setValue ? value => meta.setValue(row, copyValue(value), state.app) : value => writeControl(control, copyValue(value), controls),
        canWrite: !sensitive && !controls.some(el => el.disabled || el.readOnly || el.hidden) && !row.closest('[hidden]') && (controls.length === 1 || controls.every(el => el.type === 'radio' && el.name === fieldName) || !!meta.setValue)
      });
      record.confirmed = !!saved || record.saveMode === 'submit';
      if (record.defaultValue === undefined) record.hasDefault = false;
      // Objects need an adapter that can write the complete value, or a standard multi-value input.
      if (record.defaultValue && typeof record.defaultValue === 'object' && !meta.setValue && control.tagName !== 'MULTI-SELECT' && !(control.tagName === 'SELECT' && control.multiple)) record.canWrite = false;
      if (control.tagName === 'SELECT' && !control.multiple && ![...control.options].some(option => option.value === String(record.defaultValue))) record.canWrite = false;
      state.records.set(id, record);
      state.byRow.set(row, record);
      this.updateRecord(record);
    }
    // Removed controls aren't counted as actionable edits. Keep their baseline for lazy-tab re-renders.
  }

  updateRecord(record) {
    let value, saved;
    try { value = record.read(); saved = record.saved?.(); } catch { return; }
    record.dirty = record.sensitive ? record.touched : (record.touched || !sameValue(value, record.baseline)) && (record.saved ? !sameValue(value, saved) : !sameValue(value, record.baseline));
    if (record.saved && sameValue(value, saved)) { record.baseline = copyValue(value); record.touched = false; }
    record.different = record.hasDefault && !sameValue(value, record.defaultValue);
    const signature = stable([value, record.defaultValue, record.dirty, record.different, this.favorites.has(record.id), record.canWrite, record.scope, record.access, record.requiresReload, record.saveMode]);
    if (record.decoration !== signature || !record.row.querySelector(':scope > .improved-row-tools')) {
      record.decoration = signature;
      this.decorate(record);
    }
  }

  records(app) {
    const states = app ? [this.windows.get(app)].filter(Boolean) : [...this.windows.values()];
    return states.flatMap(state => [...state.records.values()].filter(record => record.present && record.row.isConnected));
  }

  recordFor(row, app) { return this.windows.get(app)?.byRow?.get(row); }
  location(record) {
    return { id: record.id, namespace: record.namespace, menuKey: record.menuKey, key: record.key, settingId: record.settingId, label: record.label, path: record.path };
  }

  toggleFavorite(record) {
    if (this.favorites.has(record.id)) this.favorites.delete(record.id);
    else this.favorites.set(record.id, this.location(record));
    try { this.storage?.setItem(this.storageKey, JSON.stringify([...this.favorites.values()])); }
    catch { globalThis.ui?.notifications?.warn('Favorites could not be saved in this browser.'); }
    this.changed();
  }

  accepts(row, app, mode) {
    if (mode === 'all') return true;
    const record = this.recordFor(row, app);
    if (!record) return false;
    return mode === 'changed' ? record.different : mode === 'unsaved' ? record.dirty : mode === 'favorites' ? this.favorites.has(record.id) : true;
  }

  decorate(record) {
    let tools = [...record.row.children].find(el => el.classList.contains('improved-row-tools'));
    if (!tools) {
      tools = this.ui('div', 'improved-row-tools');
      tools.append(this.ui('span', 'improved-badges'));
      const actions = this.ui('div', 'improved-row-actions');
      actions.append(this.iconButton('fa-regular fa-star', () => this.toggleFavorite(tools.record), 'Toggle favorite'));
      actions.append(this.iconButton('fa-solid fa-passport', () => this.copy(locationText(this.location(tools.record))), 'Copy location'));
      actions.append(this.iconButton('fa-solid fa-arrow-rotate-left', () => this.reset([tools.record], tools.record.label), 'Reset to default'));
      tools.append(actions);
      record.row.append(tools);
    }
    tools.record = record;
    const badge = tools.querySelector('.improved-badges');
    badge.replaceChildren();
    const scope = { client: ['fa-display', 'Browser', 'Applies to this browser'], user: ['fa-user', 'Player', 'Applies to this user in this world'], world: ['fa-globe', 'World', 'Applies to the entire world'] }[record.scope];
    badge.append(this.chip(...(scope ?? ['fa-circle-question', 'Scope unknown', 'The form does not expose a registered setting or scope metadata'])));
    if (record.access === 'gm') badge.append(this.chip('fa-user-shield', 'GM', 'Requires permission to configure the world or this restricted menu'));
    else if (record.access === 'user' && record.scope !== 'user') badge.append(this.chip('fa-user', 'User', 'A user can configure their own preference'));
    if (record.requiresReload) badge.append(this.chip('fa-rotate', 'Reload', 'Reload required after saving'));
    if (record.dirty) badge.append(this.chip('fa-pen', record.confirmed && record.saveMode !== 'immediate' ? 'Unsaved' : 'Edited', record.confirmed && record.saveMode !== 'immediate' ? 'Unsaved change' : 'Edited; save state unconfirmed'));
    if (record.saveMode === 'immediate') badge.append(this.chip('fa-bolt', 'Auto-save', 'Saves immediately'));
    if (record.different) badge.append(this.chip('fa-sliders', 'Modified', 'Different from default'));
    if (record.hasDefault) badge.append(this.chip('fa-circle-info', 'Default', `Current: ${this.display(record.read())} · Default: ${this.display(record.defaultValue)}`, 'improved-default'));
    record.row.classList.toggle('improved-dirty', record.dirty);
    const actions = tools.querySelector('.improved-row-actions');
    const [favorite, , reset] = actions.querySelectorAll('button');
    favorite.querySelector('i').className = this.favorites.has(record.id) ? 'fa-solid fa-star' : 'fa-regular fa-star';
    favorite.setAttribute('aria-pressed', String(this.favorites.has(record.id)));
    reset.disabled = !record.hasDefault || !record.canWrite || !record.different;
    reset.title = !record.hasDefault ? 'Default is unknown for this control' : !record.canWrite ? 'This control cannot be reset here' : 'Preview reset to default';
  }

  iconButton(icon, action, label) {
    const button = this.button('', action, label);
    button.classList.add('improved-icon-button');
    const glyph = this.ui('i', icon);
    glyph.setAttribute('aria-hidden', 'true');
    button.append(glyph);
    return button;
  }

  chip(icon, label, title, className = '') {
    const chip = this.ui('span', `improved-chip ${className}`.trim());
    chip.title = title;
    chip.setAttribute('aria-label', title);
    chip.tabIndex = 0;
    const glyph = this.ui('i', `fa-solid ${icon}`);
    glyph.setAttribute('aria-hidden', 'true');
    chip.append(glyph, this.document.createTextNode(label));
    return chip;
  }

  display(value) {
    if (value === undefined) return 'Unavailable';
    const text = typeof value === 'string' ? value || '(empty)' : stable(value);
    return text.length > 500 ? `${text.slice(0, 500)}…` : text;
  }

  async reset(records, title) {
    const eligible = records.filter(record => record.present && record.hasDefault && record.canWrite && record.different);
    const plan = eligible.map(record => ({ record, before: copyValue(record.read()), after: copyValue(record.defaultValue) }));
    const body = this.ui('div', 'improved-reset-preview');
    body.append(this.ui('p', '', 'This covers editable settings in Game Settings and open custom windows, including settings hidden by your filters. Unopened custom controls and controls with unknown defaults are excluded.'));
    body.append(this.ui('p', '', `${plan.length} changes. ${records.filter(record => !record.hasDefault || !record.canWrite).length} controls cannot be reset here. Use each form\'s Save button afterward; controls marked “Saves immediately” apply at once. For forms with unknown save behavior, changing a control may apply immediately.`));
    const list = this.ui('ul', '');
    for (const item of plan) list.append(this.ui('li', '', `${item.record.label}: ${this.display(item.before)} → ${this.display(item.after)}${item.record.saveMode === 'immediate' ? ' · Saves immediately' : ''}${item.record.requiresReload ? ' · Reload required' : ''}`));
    body.append(list);
    if (!plan.length) { globalThis.ui?.notifications?.info('No editable settings differ from a known default.'); return false; }
    if (!await this.confirm({ title: `Reset ${title}`, content: body.outerHTML })) return false;
    // Recheck after the preview; never overwrite edits made while it was open.
    let skipped = 0;
    for (const item of plan) {
      if (!item.record.row.isConnected || !sameValue(item.record.read(), item.before) || !item.record.canWrite || item.record.controls.some(control => control.disabled || control.readOnly || control.hidden) || item.record.row.closest('[hidden]')) { skipped++; continue; }
      await item.record.setValue(item.after);
      item.record.touched = true;
    }
    if (skipped) globalThis.ui?.notifications?.warn(`${skipped} settings changed while the preview was open and were skipped.`);
    this.changed();
    return true;
  }

  detach(app) {
    const state = this.windows.get(app);
    state?.abort?.abort();
    clearTimeout(state?.timer);
    state?.root?.querySelectorAll('.improved-row-tools').forEach(el => el.remove());
    state?.root?.querySelectorAll('.improved-dirty').forEach(el => el.classList.remove('improved-dirty'));
    state?.root?.querySelectorAll('.improved-dirty-tab').forEach(el => { el.classList.remove('improved-dirty-tab'); delete el.dataset.improvedDirtyCount; });
    this.windows.delete(app);
  }
}
