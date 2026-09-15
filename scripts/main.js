import { matches, beside } from "./search.js";
import { elementOf, collectRows, rowText, WindowFilter, registerControlAdapter } from "./dom.js";
import { MenuIndex } from "./index.js";
import { SettingWorkspace } from "./workspace.js";

const ID = "improved-settings";
let installed;

/** Install is also callable for a temporary, reload-removable verification session. */
export function install() {
  if (installed) return installed;
  const SettingsConfig = foundry.applications.settings.SettingsConfig;
  const defaultWidth = SettingsConfig.DEFAULT_OPTIONS.position.width;
  SettingsConfig.DEFAULT_OPTIONS.position.width = Math.max(defaultWidth, 1040);
  const controllers = new Map();
  const children = new Map();
  const hooks = [];
  let pending = null;
  let disposed = false;
  const pendingReloads = new Map();
  const index = new MenuIndex({
    game, document,
    // The same template transport used by Foundry's getTemplate in v13 and v14.
    // Core templates are not ordinary HTTP assets on every host.
    fetchTemplate: path => new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Template request timed out")), 8000);
      game.socket.emit("template", path.replace(/^\.\//, ""), response => {
        clearTimeout(timeout);
        if (response.error) reject(new Error(response.error));
        else resolve(response.html);
      });
    }),
    changed: () => { if (!disposed) for (const controller of controllers.values()) controller.apply(); }
  });
  let refreshTimer;
  const refresh = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { if (!disposed) for (const controller of controllers.values()) controller.apply(); }, 20);
  };
  let favoriteStorage;
  try { favoriteStorage = window.localStorage; } catch { /* Favorites remain available for this session. */ }
  const workspace = new SettingWorkspace({ game, document, index, changed: refresh, storage: favoriteStorage,
    confirm: ({ title, content }) => foundry.applications.api.DialogV2.confirm({ window: { title }, content, modal: true, rejectClose: false }),
    copy: async text => { await navigator.clipboard.writeText(text); ui.notifications.info('Setting location copied.'); }
  });

  function createUI(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    node.dataset.improvedUi = "";
    if (text) node.textContent = text;
    return node;
  }

  function searchBox(label, placeholder, value, handler) {
    const wrapper = createUI("search", "improved-search");
    const caption = createUI("label", "improved-search-label", label);
    const row = createUI("div", "improved-search-row");
    const input = createUI("input", "improved-search-input");
    input.type = "search";
    input.placeholder = placeholder;
    input.setAttribute("aria-label", label);
    input.autocomplete = "off";
    input.spellcheck = false;
    input.value = value;
    const update = () => handler(input.value);
    input.addEventListener("input", event => { event.stopPropagation(); update(); });
    input.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (event.key === "Escape") { input.value = ""; update(); }
      }
    });
    caption.append(input);
    row.append(caption);
    wrapper.append(row);
    return { wrapper, input };
  }

  function menuKey(button, root) {
    if (game.settings.menus.has(button.dataset.key)) return button.dataset.key;
    const category = button.closest("[data-category]")?.dataset.category ?? "custom";
    const identity = button.dataset.action || button.name || button.id || button.textContent.trim();
    return `observed:${category}:${identity}`;
  }

  function captureButton(event, owner, source) {
    const button = event.target.closest('button, a[data-action], [role="button"]');
    if (!button || button.closest('[data-improved-ui], header, footer, nav, [role="tablist"]')) return;
    if (button.hasAttribute("aria-controls") || button.dataset.contentId) return;
    if (button.type === "submit" || button.type === "reset" || button.dataset.tab || button.dataset.action === "resetDefaults") return;
    pending = { owner, source, key: source === owner.app ? menuKey(button, owner.root) : children.get(source)?.key,
      type: game.settings.menus.get(button.dataset.key)?.type, expires: Date.now() + 5000 };
  }

  class SettingsController {
    constructor(app) {
      this.app = app;
      this.query = "";
      this.moduleQuery = "";
      this.mode = 'all';
      this.applying = false;
      this.onPosition = () => this.dockChildren();
      app.addEventListener("position", this.onPosition);
    }

    mount() {
      this.abort?.abort();
      this.observer?.disconnect();
      this.root = elementOf(this.app);
      this.rowTexts = new WeakMap();
      this.categoryRows = new WeakMap();
      workspace.invalidate(this.app);
      const aside = this.root.querySelector("aside");
      const main = this.root.querySelector(".main");
      if (!aside || !main) return;
      this.root.classList.add(ID);
      if (!this.initialWidthSet) {
        this.initialWidthSet = true;
        if (this.app.position.width <= defaultWidth) {
          const scale = this.root.getBoundingClientRect().width / this.root.offsetWidth || 1;
          this.app.setPosition({ width: Math.min(1040, (window.innerWidth - 32) / scale) });
        }
      }
      // Keep the core control connected but out of the UI. Core can bind it again on partial renders.
      const native = this.root.querySelector('input[type="search"]:not([data-improved-ui])');
      if (native) {
        native.closest("search")?.classList.add("improved-native-search");
        native.removeAttribute("autofocus");
        this.native = native;
      }
      this.root.querySelectorAll('[data-improved-toolbar]').forEach(node => node.remove());
      this.moduleBox = searchBox("Modules", "Filter modules…", this.moduleQuery, value => { this.moduleQuery = value; this.apply(); });
      this.moduleBox.wrapper.dataset.improvedToolbar = "";
      aside.prepend(this.moduleBox.wrapper);
      const toolbar = createUI("div", "improved-toolbar");
      toolbar.dataset.improvedToolbar = "";
      this.settingBox = searchBox("Settings", "Search settings and custom windows…", this.query, value => {
        this.query = value;
        this.apply();
      });
      this.status = createUI("div", "improved-status");
      this.status.setAttribute("role", "status");
      this.status.setAttribute("aria-live", "polite");
      this.coverage = createUI('details', 'improved-coverage');
      this.coverage.append(createUI('summary', '', 'Search coverage'), createUI('div', 'improved-coverage-body'));
      const options = createUI('div', 'improved-options');
      const filterLabel = createUI('label', 'improved-search-label', 'Show');
      const filterRow = createUI('div', 'improved-filter-row');
      this.filterSelect = createUI('select', 'improved-filter');
      this.filterSelect.setAttribute('aria-label', 'Filter settings');
      for (const [value, title] of Object.entries({ all: 'All settings', changed: 'Different from default', unsaved: 'Unsaved or unconfirmed edits' })) {
        const option = createUI('option', '', title); option.value = value; this.filterSelect.append(option);
      }
      this.filterSelect.value = this.mode;
      this.filterSelect.addEventListener('change', () => { this.mode = this.filterSelect.value; this.apply(); });
      this.resetModule = workspace.iconButton('fa-solid fa-arrow-rotate-left', () => {
        const namespace = this.app.tabGroups.categories;
        return workspace.reset(workspace.records().filter(record => record.namespace === namespace), game.modules.get(namespace)?.title || namespace);
      }, 'Reset module to defaults');
      filterRow.append(this.filterSelect, this.resetModule);
      filterLabel.append(filterRow);
      options.append(filterLabel);
      this.editSummary = createUI('div', 'improved-edit-summary');
      this.reloadSummary = createUI('div', 'improved-reload-summary');
      this.reloadSummary.setAttribute('role', 'status');
      this.recovery = createUI('div', 'improved-recovery');
      this.favoritePanel = createUI('details', 'improved-favorites');
      this.favoritePanel.dataset.improvedToolbar = '';
      this.favoritePanel.open = true;
      this.favoritePanel.append(createUI('summary', '', 'Favorites'), createUI('div', 'improved-favorite-list'));
      this.moduleBox.wrapper.after(this.favoritePanel);
      const searchControls = createUI('div', 'improved-search-controls');
      searchControls.append(this.settingBox.wrapper, options);
      toolbar.append(searchControls, this.editSummary, this.reloadSummary, this.status, this.recovery, this.coverage);
      main.prepend(toolbar);
      this.abort = new AbortController();
      this.root.addEventListener("click", event => captureButton(event, this, this.app), { capture: true, signal: this.abort.signal });
      this.root.addEventListener("keydown", event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
          event.preventDefault(); event.stopPropagation(); this.settingBox.input.focus(); this.settingBox.input.select();
        }
      }, { signal: this.abort.signal });
      workspace.attach(this.app, { main: true });
      this.observer = new MutationObserver(() => {
        workspace.invalidate(this.app);
        this.rowTexts = new WeakMap();
        this.categoryRows = new WeakMap();
        if (this.updateTimer) return;
        this.updateTimer = setTimeout(() => { this.updateTimer = null; this.apply(); }, 30);
      });
      this.apply();
      void index.build();
    }

    apply() {
      if (this.applying || !this.root?.isConnected || !this.status) return;
      this.applying = true;
      this.observer?.disconnect();
      try {
        workspace.attach(this.app, { main: true });
        for (const child of children.values()) if (child.owner === this) workspace.attach(child.app, { namespace: index.menus.get(child.key)?.menu?.namespace || child.key.split('.')[0], menuKey: child.key });
        const visibleCategories = [];
        let total = 0;
        let outsideModules = 0;
        for (const category of this.root.querySelectorAll('[data-category]')) {
          const id = category.dataset.category;
          const anchor = [...this.root.querySelectorAll('aside [data-tab]')].find(tab => tab.dataset.tab === id);
          if (!anchor) continue;
          const label = anchor.querySelector("span:not([data-count])")?.textContent ?? anchor.textContent;
          const moduleMatch = matches(`${label} ${id}`, this.moduleQuery);
          let count = 0;
          const rows = this.categoryRows.get(category) ?? collectRows(category);
          this.categoryRows.set(category, rows);
          for (const row of rows) {
            const launcher = 'button[type="button"], button[data-action], button[data-key], a[data-action], [role="button"]';
            const button = row.matches(launcher) ? row : [...row.querySelectorAll(launcher)].find(el => !el.closest('[data-improved-ui]'));
            const key = button ? menuKey(button, this.root) : null;
            const deepRecords = key ? workspace.records().filter(record => record.menuKey === key && workspace.accepts(record.row, record.state.app, this.mode) && matches(record.text, this.query)) : [];
            const favoriteMatch = key && this.mode === 'favorites' && [...workspace.favorites.values()].some(location => location.menuKey === key && matches(`${location.label} ${location.key}`, this.query));
            const deepMatch = button ? this.mode === 'all' ? index.hits(key, this.query) : deepRecords.length + Number(!!favoriteMatch) : 0;
            const text = this.rowTexts.get(row) ?? rowText(row);
            this.rowTexts.set(row, text);
            const hit = (matches(text, this.query) && workspace.accepts(row, this.app, this.mode)) || deepMatch > 0;
            row.classList.toggle("improved-hidden", !hit);
            if (button) {
              button.classList.toggle("improved-match", !!deepMatch);
              if (deepMatch) button.dataset.improvedCount = "↗";
              else button.removeAttribute("data-improved-count");
              this.preview(row, button, key, this.mode === 'all' ? index.results(key, this.query) : deepRecords.map(record => ({ ...workspace.location(record), source: 'observed' })));
            }
            if (hit) count++;
          }
          const countNode = anchor.querySelector("[data-count]");
          if (countNode) countNode.textContent = `[${count}]`;
          anchor.classList.toggle("no-matches", count === 0);
          const dirty = workspace.records().filter(record => record.namespace === id && record.dirty).length;
          anchor.classList.toggle('improved-dirty-tab', dirty > 0);
          if (dirty) anchor.dataset.improvedDirtyCount = String(dirty); else delete anchor.dataset.improvedDirtyCount;
          const visible = moduleMatch && ((!this.query.trim() && this.mode === 'all') || count > 0);
          anchor.classList.toggle("improved-hidden", !visible);
          category.classList.toggle("improved-hidden", !visible);
          if (visible) { visibleCategories.push(id); total += count; }
          if (!moduleMatch) outsideModules += count;
        }
        const current = this.app.tabGroups.categories;
        if (visibleCategories.length && !visibleCategories.includes(current)) this.app.changeTab(visibleCategories[0], "categories");
        this.status.textContent = this.query.trim() || this.moduleQuery.trim() || this.mode !== 'all'
          ? `${total} matching settings or windows in ${visibleCategories.length} categories${total ? "" : ". Clear a filter or try fewer words."}`
          : "Search any part of a word. Multiple words can appear in any order.";
        for (const child of children.values()) if (child.owner === this) updateChild(child);
        this.updateTools(total, outsideModules);
      } finally {
        this.applying = false;
        this.observer?.observe(this.root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["hidden", "disabled", "readonly"] });
      }
    }

    preview(row, button, key, records) {
      let preview = row.querySelector(':scope > .improved-results');
      if ((!this.query.trim() && this.mode === 'all') || !records.length) { preview?.remove(); return; }
      if (!preview) { preview = createUI('details', 'improved-results'); row.append(preview); }
      const signature = JSON.stringify(records.map(record => [record.key, record.label, record.path, record.source]));
      if (preview.dataset.signature === signature) return;
      preview.dataset.signature = signature;
      preview.replaceChildren(createUI('summary', '', `${records.length} matching setting descriptions`));
      const list = createUI('div', 'improved-result-list');
      for (const record of records) {
        const text = [...(record.path ?? []).map(step => step.label || step.tab), record.label || record.key].join(' → ');
        const result = workspace.button(text, () => this.openLocation({ ...record, namespace: index.menus.get(key)?.menu?.namespace || key.split('.')[0], menuKey: key }, true), `Open ${text}`);
        if (record.source === 'description') result.title += ' · From a template; the form may render differently';
        list.append(result);
      }
      preview.append(list);
    }

    updateTools(total, outsideModules) {
      const coverage = index.coverage();
      this.coverage.querySelector('summary').textContent = coverage.busy ? 'Discovering custom windows…' : `Search coverage · ${coverage.observed} observed · ${coverage.described} described · ${coverage.unknown} undiscovered`;
      const body = this.coverage.querySelector('div');
      body.replaceChildren(createUI('p', '', 'Observed means controls have been seen, including visited tabs. Described means only templates or supplied descriptions are available. Neither guarantees every dynamic control is known. Open a window or visit a lazy tab to discover more.'));
      const list = createUI('ul', '');
      for (const entry of index.menus.values()) list.append(createUI('li', '', `${game.i18n.localize(entry.menu?.label || entry.menu?.name || entry.key)} · ${entry.state === 'observed' ? 'Controls observed' : entry.texts.length ? 'Descriptions available' : 'Not yet discovered'}`));
      body.append(list);
      const records = workspace.records();
      const dirty = records.filter(record => record.dirty);
      this.editSummary.replaceChildren();
      this.editSummary.hidden = !dirty.length;
      if (dirty.length) {
        const confirmed = dirty.filter(record => record.confirmed && record.saveMode !== 'immediate').length;
        this.editSummary.append(createUI('span', '', `${confirmed} unsaved changes${dirty.length - confirmed ? ` · ${dirty.length - confirmed} edits with unconfirmed save state` : ''}${dirty.some(record => record.requiresReload) ? ' · Some require reload after saving' : ''}`));
        this.editSummary.append(workspace.button('Show edits', () => { this.query = ''; this.moduleQuery = ''; this.mode = 'unsaved'; this.syncSearch(); this.apply(); }));
      }
      this.resetModule.disabled = !records.some(record => record.namespace === this.app.tabGroups.categories && record.different && record.canWrite);
      this.reloadSummary.textContent = pendingReloads.size ? `Saved changes require a reload: ${[...pendingReloads.values()].join(', ')}. Reload this browser to apply them; world settings may require other users to reload too.` : '';
      this.reloadSummary.hidden = !pendingReloads.size;
      this.recovery.replaceChildren();
      if (!total && this.moduleQuery.trim()) {
        this.recovery.append(createUI('span', '', outsideModules ? `${outsideModules} results are outside this module filter.` : 'Both searches restrict the results.'));
        this.recovery.append(workspace.button('Search all modules', () => { this.moduleQuery = ''; this.syncSearch(); this.apply(); }));
      }
      if (!total && this.mode !== 'all') this.recovery.append(workspace.button('Show all settings', () => { this.mode = 'all'; this.syncSearch(); this.apply(); }));
      if (this.mode === 'changed') this.recovery.append(createUI('small', '', 'Only controls with known defaults are included. Open custom windows to compare their controls.'));
      this.favoritePanel.querySelector('summary').textContent = `Favorites (${workspace.favorites.size})`;
      const favorites = this.favoritePanel.querySelector('div');
      favorites.replaceChildren();
      if (!workspace.favorites.size) favorites.append(createUI('small', '', 'Star a setting to add it here.'));
      for (const location of workspace.favorites.values()) {
        const row = createUI('div', 'improved-favorite');
        row.append(workspace.button(`${location.namespace} → ${location.label}`, () => this.openLocation(location)));
        row.append(workspace.iconButton('fa-solid fa-star', () => workspace.toggleFavorite(location), `Remove ${location.label} from favorites`));
        row.lastElementChild.setAttribute('aria-pressed', 'true');
        favorites.append(row);
      }
    }

    syncSearch() {
      this.settingBox.input.value = this.query;
      this.moduleBox.input.value = this.moduleQuery;
      this.filterSelect.value = this.mode;
    }

    async openLocation(location, preserveSearch = false) {
      if (!preserveSearch) { this.query = ''; this.moduleQuery = ''; this.mode = 'all'; this.syncSearch(); this.apply(); }
      const category = [...this.root.querySelectorAll('aside [data-tab]')].find(el => el.dataset.tab === location.namespace);
      if (!category) { ui.notifications.warn('This setting is unavailable. Its module may be disabled or access may be restricted.'); return false; }
      this.app.changeTab(location.namespace, 'categories');
      let target = { app: this.app };
      if (location.menuKey) {
        target = [...children.values()].find(child => child.owner === this && child.key === location.menuKey);
        if (!target) {
          const button = [...this.root.querySelectorAll('button[data-key], button[data-action], a[data-action]')].find(button => menuKey(button, this.root) === location.menuKey);
          if (!button) { ui.notifications.warn('The saved configuration window is not currently available.'); return false; }
          button.click();
          for (let attempt = 0; attempt < 40 && !target; attempt++) { await new Promise(resolve => setTimeout(resolve, 50)); target = [...children.values()].find(child => child.owner === this && child.key === location.menuKey); }
        }
      }
      if (!target) { ui.notifications.warn('The window did not expose a searchable form.'); return false; }
      for (const step of location.path ?? []) {
        const root = elementOf(target.app);
        const nav = [...root.querySelectorAll('nav [data-tab], [role="tablist"] [data-tab]')].find(el => el.dataset.tab === step.tab && (el.dataset.group ?? '') === (step.group ?? ''));
        nav?.click();
        await new Promise(resolve => setTimeout(resolve, 80));
      }
      let record;
      for (let attempt = 0; attempt < 10; attempt++) {
        workspace.attach(target.app, target.app === this.app ? { main: true } : { namespace: location.namespace, menuKey: location.menuKey });
        record = workspace.records(target.app).find(record => location.settingId ? record.settingId === location.settingId : record.key === location.key && JSON.stringify(record.path.map(step => [step.group, step.tab])) === JSON.stringify((location.path ?? []).map(step => [step.group, step.tab])));
        if (record) break;
        await new Promise(resolve => setTimeout(resolve, 80));
      }
      if (record && !record.row.closest('[hidden]')) {
        record.row.scrollIntoView({ block: 'center', behavior: 'smooth' });
        record.control.focus({ preventScroll: true });
        record.row.classList.add('improved-location-target');
        setTimeout(() => record.row.classList.remove('improved-location-target'), 2500);
      } else ui.notifications.info('Opened the matching window. This setting may be conditional or in a tab that loads additional controls.');
      return !!record;
    }

    dockChildren() {
      if (this.dockFrame) return;
      this.dockFrame = setTimeout(() => {
        this.dockFrame = null;
        for (const child of children.values()) if (child.owner === this) dock(child);
      }, 16);
    }

    close() {
      this.abort?.abort();
      this.observer?.disconnect();
      clearTimeout(this.updateTimer);
      this.app.removeEventListener("position", this.onPosition);
      if (this.dockFrame) clearTimeout(this.dockFrame);
      for (const [app, child] of children) if (child.owner === this) { cleanupChild(child); children.delete(app); }
      controllers.delete(this.app);
      workspace.detach(this.app);
      if (pending?.owner === this) pending = null;
    }
  }

  function dock(child) {
    const root = elementOf(child.app);
    const parent = child.owner.root;
    if (!root?.isConnected || !parent?.isConnected || child.app.minimized || child.owner.app.minimized) return;
    if (root.ownerDocument !== parent.ownerDocument) return;
    const bounds = root.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const scale = bounds.width / root.offsetWidth || 1;
    child.natural ??= { width: bounds.width, height: bounds.height };
    const view = root.ownerDocument.defaultView;
    const position = beside(parent.getBoundingClientRect(), child.natural, { width: view.innerWidth, height: view.innerHeight });
    child.docking = true;
    try {
      child.app.setPosition({ left: position.left, top: position.top, width: position.width / scale, height: position.height / scale });
    } finally { child.docking = false; }
    root.dataset.improvedSide = position.side;
  }

  function updateChild(child) {
    const root = elementOf(child.app);
    if (!root?.isConnected || child.updating) return;
    child.updating = true;
    child.observer?.disconnect();
    try {
      if (child.filter?.root !== root) { child.filter?.clear(); child.filter = new WindowFilter(root); }
      root.classList.add("improved-settings-child");
      let banner = root.querySelector('[data-improved-banner]');
      if (!banner) {
        banner = createUI("div", "improved-child-banner");
        banner.dataset.improvedBanner = "";
        banner.append(createUI('span', 'improved-child-status'));
        const surround = workspace.button('Show surrounding settings', () => { child.showSurrounding = !child.showSurrounding; updateChild(child); });
        surround.classList.add('improved-surrounding');
        banner.append(surround);
        (root.querySelector(".window-content") ?? root).prepend(banner);
      }
      workspace.attach(child.app, { namespace: index.menus.get(child.key)?.menu?.namespace || child.key.split('.')[0], menuKey: child.key });
      const result = child.filter.apply(child.owner.query, new Map(), { predicate: row => workspace.accepts(row, child.app, child.owner.mode), filtered: child.owner.mode !== 'all', showSurrounding: child.showSurrounding });
      index.learn(child.key, result.records);
      banner.hidden = !child.owner.query.trim() && child.owner.mode === 'all';
      const status = banner.querySelector('.improved-child-status');
      status.textContent = child.owner.query.trim()
        ? `${result.count} matches for “${child.owner.query}”. Highlighted tabs contain results. Edit or clear the search in Game Settings.` : "";
      if (!child.owner.query.trim() && child.owner.mode !== 'all') status.textContent = `${result.count} settings match the selected filter.`;
      if (child.owner.query.trim() && !result.count) status.textContent += " No matching controls are currently rendered; another tab may load them when opened.";
      const surround = banner.querySelector('.improved-surrounding');
      surround.textContent = child.showSurrounding ? 'Show matches only' : 'Show surrounding settings';
      surround.setAttribute('aria-pressed', String(!!child.showSurrounding));
      for (const tab of root.querySelectorAll('nav [data-tab], [role="tablist"] [data-tab]')) {
        const dirty = workspace.records(child.app).filter(record => record.dirty && record.path.some(step => step.tab === tab.dataset.tab && step.group === (tab.dataset.group ?? ''))).length;
        tab.classList.toggle('improved-dirty-tab', dirty > 0);
        if (dirty) tab.dataset.improvedDirtyCount = String(dirty); else delete tab.dataset.improvedDirtyCount;
      }
      child.observer ??= new MutationObserver(() => {
        workspace.invalidate(child.app);
        if (child.filter) child.filter.records = undefined;
        if (child.timer) return;
        child.timer = setTimeout(() => { child.timer = null; updateChild(child); child.owner.apply(); }, 60);
      });
      child.observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'disabled', 'readonly'] });
    } finally { child.updating = false; }
  }

  function cleanupChild(child) {
    child.observer?.disconnect();
    clearTimeout(child.timer);
    clearTimeout(child.dockTimer);
    child.app.removeEventListener?.("position", child.onPosition);
    child.abort?.abort();
    child.filter?.clear();
    workspace.detach(child.app);
    const root = elementOf(child.app);
    root?.querySelector('[data-improved-banner]')?.remove();
    root?.classList.remove("improved-settings-child");
    root?.removeAttribute("data-improved-side");
  }

  function rendered(app) {
    if (app instanceof SettingsConfig) {
      let controller = controllers.get(app);
      if (!controller) { controller = new SettingsController(app); controllers.set(app, controller); }
      controller.mount();
      for (const existing of foundry.applications.instances.values()) {
        if (existing !== app && existing.rendered && !(existing instanceof SettingsConfig) && !children.has(existing)) rendered(existing);
      }
      return;
    }
    let child = children.get(app);
    if (!child) {
      let link;
      const root = elementOf(app);
      const redirectedForm = root && !app.document && collectRows(root).length > 0;
      if (pending && Date.now() < pending.expires && pending.owner.root.isConnected && (!pending.type || app instanceof pending.type || redirectedForm)) {
        link = pending;
        pending = null;
      } else {
        // Also recognize a registered menu opened through a module's own shortcut.
        const candidates = [...game.settings.menus].filter(([, menu]) => index.permitted(menu) && app instanceof menu.type);
        const menu = candidates.length === 1 ? candidates[0] : null;
        const owner = [...controllers.values()].find(controller => controller.root?.isConnected);
        if (menu && owner) link = { key: menu[0], owner };
      }
      if (!link) return;
      child = { app, key: link.key, owner: link.owner };
      child.onPosition = () => {
        if (child.docking) return;
        const bounds = elementOf(app)?.getBoundingClientRect();
        if (bounds?.height && child.natural) child.natural.height = bounds.height;
        clearTimeout(child.dockTimer);
        child.dockTimer = setTimeout(() => { if (children.has(app)) dock(child); }, 0);
      };
      app.addEventListener?.("position", child.onPosition);
      children.set(app, child);
    }
    child.abort?.abort();
    workspace.invalidate(app);
    if (child.filter) child.filter.records = undefined;
    child.abort = new AbortController();
    elementOf(app)?.addEventListener("click", event => captureButton(event, child.owner, app), { capture: true, signal: child.abort.signal });
    updateChild(child);
    child.owner.apply();
    // Run after Foundry applies any final render position and auto-height.
    setTimeout(() => { if (children.has(app)) dock(child); }, 0);
  }

  // Patch only SettingsConfig. CategoryBrowser is shared with unrelated applications.
  const ownDescriptor = Object.getOwnPropertyDescriptor(SettingsConfig.prototype, "_onSearchFilter");
  const original = SettingsConfig.prototype._onSearchFilter;
  function searchOverride(event, query, regex, html) {
    const controller = controllers.get(this);
    if (!controller) return original.call(this, event, query, regex, html);
    // Core rebinds its hidden input during rendering. User searches use our two controls.
    controller.apply();
  }
  SettingsConfig.prototype._onSearchFilter = searchOverride;
  const DialogV2 = foundry.applications.api.DialogV2;
  const originalDialogRender = DialogV2.prototype._onFirstRender;
  function dialogRender(...args) {
    const root = elementOf(this);
    const linked = children.has(this) || (pending && Date.now() < pending.expires && pending.owner.root?.isConnected);
    // A settings form in the browser's modal top layer would block the shared search.
    // Choose non-modal display before its first show, preserving dialog callbacks.
    if (linked && this.options.modal && root?.tagName === "DIALOG" && collectRows(root).length) {
      root.show();
      return;
    }
    return originalDialogRender.apply(this, args);
  }
  DialogV2.prototype._onFirstRender = dialogRender;
  const on = (name, fn) => hooks.push([name, Hooks.on(name, fn)]);
  on("renderSettingsConfig", rendered);
  on("renderApplicationV2", app => { if (!(app instanceof SettingsConfig)) rendered(app); });
  on("renderApplication", rendered);
  on("closeSettingsConfig", app => controllers.get(app)?.close());
  const closed = app => { const child = children.get(app); if (child) { cleanupChild(child); children.delete(app); } };
  on("closeApplicationV2", closed);
  on("closeApplication", closed);
  const savedSetting = key => {
    const definition = game.settings.settings.get(key);
    if (definition?.requiresReload) pendingReloads.set(key, game.i18n.localize(definition.name));
    refresh();
  };
  on('updateSetting', (document, changes) => { if (Object.hasOwn(changes, 'value')) savedSetting(document.key); });
  on('createSetting', document => savedSetting(document.key));
  on('clientSettingChanged', key => savedSetting(key));
  const resized = () => { for (const controller of controllers.values()) controller.dockChildren(); };
  window.addEventListener("resize", resized);
  // A subclass may set BASE_APPLICATION and suppress the generic Foundry render hook.
  // Observe only top-level window insertions, and only inspect apps while Settings is open.
  const windowObserver = new MutationObserver(records => {
    if (!controllers.size || !records.some(record => record.addedNodes.length)) return;
    for (const record of records) for (const node of record.addedNodes) {
      if (node.nodeType !== 1 || !node.matches('.application, .window-app')) continue;
      const app = foundry.applications.instances.get(node.id) ?? Object.values(ui.windows ?? {}).find(app => elementOf(app) === node);
      if (app && !controllers.has(app) && !children.has(app)) rendered(app);
    }
  });
  windowObserver.observe(document.body, { childList: true });

  installed = {
    version: "0.2.1",
    registerControlAdapter(id, adapter) {
      const remove = registerControlAdapter(id, adapter);
      for (const app of workspace.windows.keys()) workspace.invalidate(app);
      refresh();
      return () => { remove(); for (const app of workspace.windows.keys()) workspace.invalidate(app); refresh(); };
    },
    registerMenuIndexer(key, provider) {
      const wrapped = async context => {
        const records = await provider(context);
        for (const app of workspace.windows.keys()) workspace.invalidate(app);
        return records;
      };
      const remove = index.addProvider(key, wrapped);
      return () => { remove(); for (const app of workspace.windows.keys()) workspace.invalidate(app); refresh(); };
    },
    refreshIndex: () => { index.menus.clear(); index.templates.clear(); return index.build(); },
    coverage: () => index.coverage(),
    diagnostics: () => [...index.menus.values()].map(({ key, state, texts, learned, errors }) => ({ key, state, entries: texts.length, learned: learned.length, errors })),
    async openLocation(location) { if (!game.settings.sheet.rendered) await game.settings.sheet.render(true); return controllers.get(game.settings.sheet)?.openLocation(location); },
    search(query, moduleQuery = "") {
      const controller = controllers.get(game.settings.sheet);
      if (!controller) return false;
      controller.query = query;
      controller.moduleQuery = moduleQuery;
      controller.settingBox.input.value = query;
      controller.moduleBox.input.value = moduleQuery;
      controller.apply();
      return true;
    },
    uninstall() {
      disposed = true;
      if (SettingsConfig.DEFAULT_OPTIONS.position.width === Math.max(defaultWidth, 1040)) SettingsConfig.DEFAULT_OPTIONS.position.width = defaultWidth;
      clearTimeout(refreshTimer);
      for (const [name, id] of hooks) Hooks.off(name, id);
      window.removeEventListener("resize", resized);
      windowObserver.disconnect();
      for (const controller of controllers.values()) {
        controller.close();
        const root = controller.root;
        root.querySelectorAll('[data-improved-toolbar]').forEach(node => node.remove());
        root.querySelectorAll('.improved-results').forEach(node => node.remove());
        root.querySelectorAll('.improved-hidden, .improved-match, .improved-native-search').forEach(node => node.classList.remove("improved-hidden", "improved-match", "improved-native-search"));
        root.querySelectorAll('[data-improved-count]').forEach(node => node.removeAttribute("data-improved-count"));
        root.classList.remove(ID);
        original.call(controller.app, null, "", /(?:)/i, root.querySelector(".main"));
      }
      if (SettingsConfig.prototype._onSearchFilter === searchOverride) {
        if (ownDescriptor) Object.defineProperty(SettingsConfig.prototype, "_onSearchFilter", ownDescriptor);
        else delete SettingsConfig.prototype._onSearchFilter;
      }
      if (DialogV2.prototype._onFirstRender === dialogRender) DialogV2.prototype._onFirstRender = originalDialogRender;
      installed = null;
    }
  };
  const module = game.modules.get(ID);
  if (module) module.api = installed;
  for (const app of foundry.applications.instances.values()) if (app instanceof SettingsConfig && app.rendered) rendered(app);
  Hooks.callAll("improvedSettingsReady", installed);
  return installed;
}

if (globalThis.Hooks) {
  if (game.ready) install();
  else Hooks.once("init", install);
}
