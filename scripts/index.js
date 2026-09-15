import { matches } from "./search.js";
import { collectRows, rowText } from "./dom.js";

const strings = source => [...source.matchAll(/["'`]([^"'`\n\r]{2,240})["'`]/g)].map(match => match[1]);

/** No app constructors, context preparation, submissions, or setting values are evaluated. */
export class MenuIndex {
  constructor({ game, fetchTemplate, document, changed = () => {} }) {
    this.game = game;
    this.document = document;
    this.fetchTemplate = fetchTemplate;
    this.changed = changed;
    this.menus = new Map();
    this.templates = new Map();
    this.providers = new Map();
    this.busy = false;
  }

  localize(value) {
    return typeof value === "string" ? this.game.i18n.localize(value) : "";
  }

  permitted(menu) {
    return !menu.restricted || this.game.user.can("SETTINGS_MODIFY");
  }

  addProvider(key, provider) {
    this.providers.set(key, provider);
    this.menus.delete(key);
    void this.build();
    return () => { this.providers.delete(key); this.menus.delete(key); void this.build(); };
  }

  build() {
    if (this.running) { this.rerun = true; return this.running; }
    this.running = this.buildOnce().finally(() => {
      this.running = null;
      if (this.rerun) { this.rerun = false; return this.build(); }
    });
    return this.running;
  }

  async buildOnce() {
    this.busy = true;
    this.changed();
    const queue = [...this.game.settings.menus.entries()].filter(([, menu]) => this.permitted(menu));
    // Bound concurrency even in worlds with hundreds of menus.
    const worker = async () => {
      while (queue.length) {
        const [key, menu] = queue.shift();
        if (this.menus.has(key)) continue;
        const entry = { key, menu, texts: [], learned: [], state: "indexing", errors: [] };
        this.menus.set(key, entry);
        try { await this.indexMenu(entry); }
        catch (error) { entry.errors.push(String(error.message ?? error)); }
        entry.state = entry.texts.length ? "indexed" : "unopened";
      }
    };
    try { await Promise.all([worker(), worker(), worker(), worker()]); }
    finally { this.busy = false; this.changed(); }
  }

  translatedStrings(source) {
    const result = [];
    for (const key of new Set(strings(source))) {
      if (this.game.i18n.has?.(key)) result.push(this.localize(key));
      // DataField menus often provide one translation prefix for a whole schema.
      else if (/^[\w-]+(?:\.[\w-]+)+$/.test(key)) {
        const read = object => key.split(".").reduce((value, part) => value?.[part], object);
        const subtree = read(this.game.i18n.translations) ?? read(this.game.i18n._fallback);
        if (subtree && typeof subtree === "object") {
          const flatten = value => {
            if (result.length > 3000) return;
            if (typeof value === "string") result.push(value);
            else if (value && typeof value === "object") Object.values(value).forEach(flatten);
          };
          flatten(subtree);
        }
      }
    }
    return result;
  }

  async indexMenu(entry) {
    const { menu, key } = entry;
    let source = "";
    const paths = new Set();
    for (let type = menu.type; typeof type === "function" && type !== Function.prototype && !["Application", "ApplicationV2", "FormApplication"].includes(type.name); type = Object.getPrototypeOf(type)) {
      source += `\n${Function.prototype.toString.call(type)}`;
      const parts = Object.getOwnPropertyDescriptor(type, "PARTS")?.value;
      for (const part of Object.values(parts ?? {})) {
        if (typeof part.template === "string") paths.add(part.template);
        for (const path of part.templates ?? []) if (typeof path === "string") paths.add(path);
      }
    }
    // Legacy applications conventionally expose a static defaultOptions getter.
    try {
      const template = menu.type?.defaultOptions?.template;
      if (typeof template === "string") paths.add(template);
    } catch { /* A menu with unusual options is still learned when opened. */ }
    for (const literal of strings(source)) if (/\.(hbs|html)$/.test(literal)) paths.add(literal);
    entry.texts.push(...this.translatedStrings(source));
    const visited = new Set();
    const inspectTemplate = async (path, depth = 0) => {
      if (visited.has(path) || depth > 4 || visited.size >= 64) return;
      visited.add(path);
      // Only read templates belonging to Foundry packages, through Foundry's route helper.
      if (!/^(?:\.\/)?(?:modules|systems|templates)\//.test(path) || path.includes("..") || /[{}$]/.test(path)) return;
      try {
        if (!this.templates.has(path)) this.templates.set(path, this.fetchTemplate(path));
        const template = await this.templates.get(path);
        source += `\n${template}`;
        const translated = template.replace(/\{\{\{?\s*(?:localize|i18n)\s+["']([^"']+)["'][^}]*\}\}\}?/g,
          (_match, key) => this.localize(key));
        // Parse inertly. No HTML is ever inserted into a live page for indexing.
        const fragment = this.document.createElement("template");
        fragment.innerHTML = translated.replace(/\{\{[\s\S]*?\}\}/g, " ");
        for (const row of collectRows(fragment.content)) entry.texts.push(rowText(row));
        entry.texts.push(...this.translatedStrings(template));
        for (const match of template.matchAll(/\{\{[~#]?\s*>\s*["']([^"']+)["']/g)) await inspectTemplate(match[1], depth + 1);
      } catch (error) { entry.errors.push(`${path}: ${error.message}`); }
    };
    for (const path of paths) await inspectTemplate(path);
    // Link a hidden setting only when its key is actually referenced by this menu.
    const literals = new Set(strings(source));
    for (const [id, setting] of this.game.settings.settings) {
      if (setting.namespace !== menu.namespace || setting.config) continue;
      if (setting.scope === "world" && !this.game.user.can("SETTINGS_MODIFY")) continue;
      if (literals.has(setting.key) || source.includes(`.${setting.key}`)) {
        const choices = typeof setting.choices === "object" ? Object.values(setting.choices ?? {}).map(value => this.localize(value)) : [];
        entry.texts.push([id, this.localize(setting.name), this.localize(setting.hint), ...choices].join(" "));
      }
    }
    const provider = this.providers.get(key);
    if (provider) {
      const records = await provider(menu);
      entry.texts.push(...records.map(record => typeof record === "string" ? record : [record.label, record.hint, record.key, ...(record.choices ?? [])].join(" ")));
    }
    entry.texts = [...new Set(entry.texts.map(text => text.trim()).filter(Boolean))];
  }

  learn(key, records) {
    let entry = this.menus.get(key);
    if (!entry) {
      entry = { key, texts: [], learned: [], state: "observed", errors: [] };
      this.menus.set(key, entry);
    }
    // Preserve previously visited lazy tabs, but never store form values.
    entry.learned = [...new Set([...entry.learned, ...records.map(record => record.text)])];
    entry.state = "observed";
  }

  hits(key, query) {
    const entry = this.menus.get(key);
    if (!entry || !query.trim()) return 0;
    return [...new Set([...entry.texts, ...entry.learned])].filter(text => matches(text, query)).length;
  }

  coverage() {
    const entries = [...this.menus.values()];
    return { total: entries.length, indexed: entries.filter(entry => entry.texts.length || entry.learned.length).length, busy: this.busy };
  }
}
