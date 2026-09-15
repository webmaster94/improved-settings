import fs from "node:fs/promises";
import vm from "node:vm";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// Exercise the installed Foundry implementation without copying licensed source into this project.
for (const [version, directory] of [[13, "FoundryVTT_Next"], [14, "FoundryVTT_Test"]]) {
  const base = `C:/Program Files/${directory}/client/applications`;
  const helper = (await fs.readFile(`${base}/ux/search-filter.mjs`, "utf8")).replace("export default class", "class");
  const category = await fs.readFile(`${base}/api/category-browser.mjs`, "utf8");
  const method = category.slice(category.indexOf("  _onSearchFilter("), category.lastIndexOf("\n}"));
  const dom = new JSDOM(`<div id="root"><button data-tab="core"><span data-count></span></button><section data-category="core"><div class="form-group"><label>Automatic Token Rotation</label><p class="hint">Rotate tokens during movement.</p></div></section></div>`);
  const root = dom.window.document.getElementById("root");
  const context = vm.createContext({ foundry: { utils: { debounce: fn => fn } }, root });
  vm.runInContext('String.prototype.stripDiacritics = function() { return this.normalize("NFD").replace(/[\\u0300-\\u036f]/g, ""); }; RegExp.escape ??= value => value.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");', context);
  vm.runInContext(`${helper}\nthis.SearchFilter = SearchFilter; this.browser = new (class { ${method} })(); browser.element = root;`, context);
  for (const [query, expected] of [["tation", true], ["token rotation", true], ["rotation automatic", false]]) {
    context.query = query;
    vm.runInContext('const filter = new SearchFilter({callback: (event, query, regex) => browser._onSearchFilter(event, query, regex, root)}); filter.filter(null, query);', vm.createContext({ ...context, query }));
    const actual = !root.querySelector(".form-group").hidden;
    assert.equal(actual, expected, `v${version}: ${query}`);
    console.log(`v${version} core search ${JSON.stringify(query)} => ${actual ? "match" : "no match"}`);
  }
}
