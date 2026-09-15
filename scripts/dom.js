import { matches } from "./search.js";

const CONTROL = 'input:not([type="hidden"]):not([type="search"]):not([type="submit"]):not([type="button"]), select, textarea, range-picker, color-picker, file-picker, multi-select, button[type="button"], a[data-action], [role="button"]';
const ROW = '.form-group, [data-setting-id], [data-setting-key], .setting, .setting-row, .settings-row, tr';
const adapters = new Map();

/** Optional semantic adapters belong to the control library, not a module allowlist. */
export function registerControlAdapter(id, { selector, text }) {
  if (!id || typeof selector !== "string") throw new TypeError("An adapter needs an id and a CSS selector");
  adapters.set(id, { selector, text });
  return () => adapters.delete(id);
}

export function elementOf(app) {
  const element = app?.element;
  return element?.nodeType === 1 ? element : element?.[0];
}

export function collectRows(root) {
  const rows = new Set(root.querySelectorAll(ROW));
  for (const adapter of adapters.values()) root.querySelectorAll(adapter.selector).forEach(row => rows.add(row));
  for (const input of root.querySelectorAll(CONTROL)) {
    if (input.closest('[data-improved-ui], header.window-header, footer, nav, [role="tablist"]')) continue;
    if (input.dataset.tab || input.hasAttribute("aria-controls") || input.dataset.contentId) continue;
    let row = input.closest(ROW);
    if (!row) {
      row = input.closest("label");
      // Associate labels across sibling columns without knowing the module's CSS.
      const label = input.id ? [...root.querySelectorAll("label[for]")].find(label => label.htmlFor === input.id) : null;
      if (label) {
        let ancestor = input.parentElement;
        while (ancestor && ancestor !== root && !ancestor.matches('form, .window-content, .tab')) {
          if (ancestor.contains(label)) { row = ancestor; break; }
          ancestor = ancestor.parentElement;
        }
      }
      let parent = input.parentElement;
      while (!row && parent && parent !== root && !parent.matches('form, .window-content, .tab, fieldset')) {
        if (parent.querySelector("label")) row = parent;
        parent = parent.parentElement;
      }
    }
    if (!row && (input.hasAttribute("aria-label") || input.matches('button, a[data-action], [role="button"]'))) row = input;
    if (row && root.contains(row)) rows.add(row);
  }
  return [...rows].filter(row => !row.closest('[data-improved-ui], footer, header.window-header, nav'));
}

/** Search descriptive text and field names, never input values or password contents. */
export function rowText(row) {
  for (const adapter of adapters.values()) if (adapter.text && row.matches(adapter.selector)) return String(adapter.text(row));
  const clone = row.cloneNode(true);
  clone.querySelectorAll('[data-improved-ui], script, style, textarea, input').forEach(node => node.remove());
  const names = [...row.querySelectorAll('[name]:not([type="password"])')].map(el => el.name ?? el.getAttribute("name"));
  return `${clone.textContent} ${names.join(" ")} ${row.getAttribute("name") ?? ""} ${row.getAttribute("aria-label") ?? ""}`;
}

export function tabPath(row, root) {
  const path = [];
  for (let node = row.parentElement; node && node !== root; node = node.parentElement) {
    if (node.matches('[data-tab]:not(button):not(a)') && !node.closest('nav, [role="tablist"]')) {
      path.unshift({ group: node.dataset.group ?? "", tab: node.dataset.tab });
    }
  }
  return path;
}

export class WindowFilter {
  constructor(root) {
    this.root = root;
    this.details = new Map();
    this.decorated = new Set();
  }

  clear() {
    for (const node of this.decorated) {
      node.classList.remove("improved-hidden", "improved-match", "improved-reveal");
      node.removeAttribute("data-improved-count");
    }
    this.decorated.clear();
    for (const [details, wasOpen] of this.details) details.open = wasOpen;
    this.details.clear();
  }

  mark(node, className) {
    node.classList.add(className);
    this.decorated.add(node);
  }

  apply(query, extras = new Map()) {
    this.clear();
    const rows = collectRows(this.root);
    const records = rows.map(row => ({ row, text: rowText(row), path: tabPath(row, this.root) }));
    if (!query.trim()) return { records, count: records.length };
    const hits = records.filter(record => matches(`${record.text} ${extras.get(record.row) ?? ""}`, query));
    const hitRows = new Set(hits.map(hit => hit.row));
    for (const { row } of records) {
      // A wrapper containing a matching child must remain reachable.
      const keep = hitRows.has(row) || hits.some(hit => row.contains(hit.row));
      if (!keep) this.mark(row, "improved-hidden");
    }
    const tabs = [...this.root.querySelectorAll('button[data-tab], a[data-tab], [role="tab"][data-tab]')];
    for (const tab of tabs) {
      const count = hits.filter(hit => hit.path.some(path => path.tab === tab.dataset.tab && path.group === (tab.dataset.group ?? ""))).length;
      if (count) {
        this.mark(tab, "improved-match");
        tab.dataset.improvedCount = String(count);
      }
    }
    for (const { row } of hits) {
      for (let parent = row.parentElement; parent && parent !== this.root; parent = parent.parentElement) {
        if (parent.tagName === "DETAILS") {
          if (!this.details.has(parent)) this.details.set(parent, parent.open);
          parent.open = true;
        }
        if (parent.id) {
          const controls = [...this.root.querySelectorAll('[aria-controls], [data-content-id]')]
            .filter(control => control.getAttribute("aria-controls") === parent.id || control.dataset.contentId === parent.id);
          if (controls.length && !parent.matches('.tab, [data-tab]')) {
            this.mark(parent, "improved-reveal");
            for (const control of controls) {
              this.mark(control, "improved-match");
              // A separate accordion header can itself contain a setting.
              const header = rows.find(row => row.contains(control));
              if (header) header.classList.remove("improved-hidden");
            }
          }
        }
      }
    }
    // Remove empty section headings and boxes as well as their rows, using structure.
    const groups = new Set();
    for (const { row } of records) for (let parent = row.parentElement; parent && parent !== this.root; parent = parent.parentElement) {
      if (!parent.matches('div, section, fieldset, details') || parent.matches('.tab, [data-tab], .window-content, [data-improved-ui]')) continue;
      if (parent.querySelector('nav, footer, [role="tablist"], [data-improved-ui], input[type="search"]')) continue;
      groups.add(parent);
    }
    for (const group of groups) {
      if (!hits.some(hit => group.contains(hit.row)) && !group.querySelector('.improved-match')) this.mark(group, "improved-hidden");
    }
    return { records, count: hits.length };
  }
}
