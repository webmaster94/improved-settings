import { matches, beside } from "./search.js";
import { elementOf, collectRows, rowText, WindowFilter, registerControlAdapter } from "./dom.js";
import { MenuIndex } from "./index.js";

const ID = "improved-settings";
let installed;

/** Install is also callable for a temporary, reload-removable verification session. */
export function install() {
  if (installed) return installed;
  const SettingsConfig = foundry.applications.settings.SettingsConfig;
  const controllers = new Map();
  const children = new Map();
  const hooks = [];
  let pending = null;
  let disposed = false;
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
    const clear = createUI("button", "improved-clear", "×");
    clear.type = "button";
    clear.title = `Clear ${label.toLowerCase()}`;
    clear.setAttribute("aria-label", clear.title);
    const update = () => { clear.disabled = !input.value; handler(input.value); };
    input.addEventListener("input", event => { event.stopPropagation(); update(); });
    input.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (event.key === "Escape") { input.value = ""; update(); }
      }
    });
    clear.addEventListener("click", () => { input.value = ""; update(); input.focus(); });
    clear.disabled = !value;
    caption.append(input);
    row.append(caption, clear);
    wrapper.append(row);
    return { wrapper, input, clear };
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
      this.applying = false;
      this.onPosition = () => this.dockChildren();
      app.addEventListener("position", this.onPosition);
    }

    mount() {
      this.abort?.abort();
      this.observer?.disconnect();
      this.root = elementOf(this.app);
      const aside = this.root.querySelector("aside");
      const main = this.root.querySelector(".main");
      if (!aside || !main) return;
      this.root.classList.add(ID);
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
      this.coverage = createUI("small", "improved-coverage");
      this.coverage.title = "Custom windows are indexed from templates and descriptions, then learned as you open them. Controls built entirely at runtime become searchable after opening their window. Setting values are not indexed.";
      toolbar.append(this.settingBox.wrapper, this.status, this.coverage);
      main.prepend(toolbar);
      this.abort = new AbortController();
      this.root.addEventListener("click", event => captureButton(event, this, this.app), { capture: true, signal: this.abort.signal });
      this.root.addEventListener("keydown", event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
          event.preventDefault(); event.stopPropagation(); this.settingBox.input.focus(); this.settingBox.input.select();
        }
      }, { signal: this.abort.signal });
      this.observer = new MutationObserver(() => {
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
        const visibleCategories = [];
        let total = 0;
        for (const category of this.root.querySelectorAll('[data-category]')) {
          const id = category.dataset.category;
          const anchor = [...this.root.querySelectorAll('aside [data-tab]')].find(tab => tab.dataset.tab === id);
          if (!anchor) continue;
          const label = anchor.querySelector("span:not([data-count])")?.textContent ?? anchor.textContent;
          const moduleMatch = matches(`${label} ${id}`, this.moduleQuery);
          let count = 0;
          for (const row of collectRows(category)) {
            const launcher = 'button[type="button"], button[data-action], button[data-key], a[data-action], [role="button"]';
            const button = row.matches(launcher) ? row : row.querySelector(launcher);
            const deepMatch = button ? index.hits(menuKey(button, this.root), this.query) : 0;
            const hit = matches(rowText(row), this.query) || deepMatch > 0;
            row.classList.toggle("improved-hidden", !hit);
            if (button) {
              button.classList.toggle("improved-match", !!deepMatch);
              if (deepMatch) button.dataset.improvedCount = "↗";
              else button.removeAttribute("data-improved-count");
            }
            if (hit) count++;
          }
          const countNode = anchor.querySelector("[data-count]");
          if (countNode) countNode.textContent = `[${count}]`;
          anchor.classList.toggle("no-matches", count === 0);
          const visible = moduleMatch && (!this.query.trim() || count > 0);
          anchor.classList.toggle("improved-hidden", !visible);
          category.classList.toggle("improved-hidden", !visible);
          if (visible) { visibleCategories.push(id); total += count; }
        }
        const current = this.app.tabGroups.categories;
        if (visibleCategories.length && !visibleCategories.includes(current)) this.app.changeTab(visibleCategories[0], "categories");
        this.status.textContent = this.query.trim() || this.moduleQuery.trim()
          ? `${total} matching settings or windows in ${visibleCategories.length} categories${total ? "" : ". Clear a filter or try fewer words."}`
          : "Search any part of a word. Multiple words can appear in any order.";
        const coverage = index.coverage();
        this.coverage.textContent = coverage.busy ? "Indexing custom windows…" : `${coverage.indexed}/${coverage.total} custom windows indexed · Open other windows to learn their controls`;
        for (const child of children.values()) if (child.owner === this) updateChild(child);
      } finally {
        this.applying = false;
        this.observer?.observe(this.root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["hidden"] });
      }
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
        banner.setAttribute("role", "status");
        (root.querySelector(".window-content") ?? root).prepend(banner);
      }
      const result = child.filter.apply(child.owner.query);
      index.learn(child.key, result.records);
      banner.hidden = !child.owner.query.trim();
      banner.textContent = child.owner.query.trim()
        ? `${result.count} matches for “${child.owner.query}”. Highlighted tabs contain results. Edit or clear the search in Game Settings.` : "";
      if (child.owner.query.trim() && !result.count) banner.textContent += " No matching controls are currently rendered; another tab may load them when opened.";
      child.observer ??= new MutationObserver(() => {
        if (child.timer) return;
        child.timer = setTimeout(() => { child.timer = null; updateChild(child); child.owner.apply(); }, 60);
      });
      child.observer.observe(root, { childList: true, subtree: true, characterData: true });
    } finally { child.updating = false; }
  }

  function cleanupChild(child) {
    child.observer?.disconnect();
    clearTimeout(child.timer);
    clearTimeout(child.dockTimer);
    child.app.removeEventListener?.("position", child.onPosition);
    child.abort?.abort();
    child.filter?.clear();
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
    version: "0.1.0",
    registerControlAdapter,
    registerMenuIndexer: (key, provider) => index.addProvider(key, provider),
    refreshIndex: () => { index.menus.clear(); index.templates.clear(); return index.build(); },
    coverage: () => index.coverage(),
    diagnostics: () => [...index.menus.values()].map(({ key, state, texts, learned, errors }) => ({ key, state, entries: texts.length, learned: learned.length, errors })),
    search(query, moduleQuery = "") {
      const controller = controllers.get(game.settings.sheet);
      if (!controller) return false;
      controller.query = query;
      controller.moduleQuery = moduleQuery;
      controller.settingBox.input.value = query;
      controller.settingBox.clear.disabled = !query;
      controller.moduleBox.input.value = moduleQuery;
      controller.moduleBox.clear.disabled = !moduleQuery;
      controller.apply();
      return true;
    },
    uninstall() {
      disposed = true;
      for (const [name, id] of hooks) Hooks.off(name, id);
      window.removeEventListener("resize", resized);
      windowObserver.disconnect();
      for (const controller of controllers.values()) {
        controller.close();
        const root = controller.root;
        root.querySelectorAll('[data-improved-toolbar]').forEach(node => node.remove());
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
