import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { WindowFilter, collectRows, rowText, registerControlAdapter } from "../scripts/dom.js";

function form(html) { return new JSDOM(`<form>${html}</form>`).window.document.querySelector("form"); }
const hidden = row => row.classList.contains("improved-hidden");

test("highlights multiple tabs and nested subtabs while preserving unsaved and native-hidden fields", () => {
  const root = form(`<nav><button data-group="main" data-tab="a">A</button><button data-group="main" data-tab="b">B</button></nav>
    <section class="tab active" data-group="main" data-tab="a"><nav><button data-group="sub" data-tab="first">First</button><button data-group="sub" data-tab="other">Other</button></nav>
    <section class="tab" data-group="sub" data-tab="first"><div class="form-group" id="one"><label>Automatic targeting</label><input name="target" value="unsaved"></div><div class="form-group" id="two"><label>Damage</label><input name="damage" type="checkbox" checked></div></section>
    <section class="tab" data-group="sub" data-tab="other"><div class="form-group" id="three"><label>Target distance</label><select name="distance"><option>Long</option></select></div></section></section>
    <section class="tab" data-group="main" data-tab="b"><div class="form-group" hidden id="four"><label>Target permission</label><input name="permission" value="world"></div></section><footer><button type="submit">Save</button></footer>`);
  const filter = new WindowFilter(root);
  assert.equal(filter.apply("target").count, 3);
  assert.equal(root.querySelectorAll("button.improved-match").length, 4);
  assert(hidden(root.querySelector("#two")));
  assert(root.querySelector("#four").hidden);
  assert.equal(root.querySelector('[name="target"]').value, "unsaved");
  assert(root.querySelector('[name="damage"]').checked);
  assert.equal(root.querySelectorAll(":disabled").length, 0);
  filter.apply("");
  assert.equal(root.querySelectorAll(".improved-hidden, .improved-match").length, 0);
  assert(root.querySelector("#four").hidden);
});

test("detects unknown column layouts through associated labels without module selectors", () => {
  const root = form(`<div class="anything"><div><label for="alpha">Concentration checks</label></div><div><input id="alpha" name="alpha"></div></div><div class="something"><label for="beta">Dice color</label><input id="beta" name="beta"></div>`);
  const rows = collectRows(root);
  assert.equal(rows.length, 2);
  const filter = new WindowFilter(root);
  filter.apply("concentration");
  assert(!hidden(root.querySelector(".anything")));
  assert(hidden(root.querySelector(".something")));
});

test("reveals matching accordions, restores details, and never indexes field values", () => {
  const root = form(`<div class="form-group"><button type="button" aria-controls="options">Advanced</button></div><div id="options" style="display:none"><div class="form-group"><label>Timeout</label><input name="timeout" value="secret123"></div></div><details><summary>Audio</summary><div class="form-group"><label>Timeout sound</label><textarea>private value</textarea></div></details>`);
  const filter = new WindowFilter(root);
  filter.apply("timeout");
  assert(root.querySelector("#options").classList.contains("improved-reveal"));
  assert(root.querySelector("details").open);
  assert(!collectRows(root).map(rowText).join(" ").includes("secret123"));
  assert(!collectRows(root).map(rowText).join(" ").includes("private value"));
  filter.clear();
  assert(!root.querySelector("details").open);
  assert.equal(root.querySelector("#options").style.display, "none");
});

test("hides empty structural groups and supports external control conventions", () => {
  const root = form('<section class="custom-box"><h3>Appearance</h3><div class="form-group"><label>Color</label><input name="color"></div></section><section class="custom-box"><div data-preference="target"><strong>Targeting</strong></div></section>');
  const remove = registerControlAdapter("qa", { selector: "[data-preference]", text: row => row.textContent });
  const filter = new WindowFilter(root);
  try {
    assert.equal(filter.apply("target").count, 1);
    assert(hidden(root.querySelector(".custom-box")));
    filter.clear();
    assert(!hidden(root.querySelector(".custom-box")));
  } finally { remove(); }
});

test("discovers standalone custom launcher buttons while excluding navigation and submit actions", () => {
  const root = form('<button type="button" id="open-custom">Custom preferences</button><nav><button type="button" data-tab="a">A</button></nav><button type="submit">Save</button>');
  assert.deepEqual(collectRows(root).map(row => row.id), ["open-custom"]);
  assert(rowText(collectRows(root)[0]).includes("Custom preferences"));
});
