import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { MenuIndex } from "../scripts/index.js";

test("indexes unopened templates, skips restricted menus, and never constructs apps or reads values", async () => {
  let constructed = 0;
  class GenericMenu {
    constructor() { constructed++; throw new Error("Must not run"); }
    static PARTS = { form: { template: "modules/example/options.hbs" } };
  }
  const game = {
    user: { can: () => false }, i18n: { localize: key => ({ "Example.Name": "Opportunity attack" })[key] ?? key, has: key => key === "Example.Name" },
    settings: { get() { throw new Error("Must not read values"); }, menus: new Map([
      ["example.options", { namespace: "example", type: GenericMenu }],
      ["example.private", { namespace: "example", type: GenericMenu, restricted: true }]
    ]), settings: new Map() }
  };
  const index = new MenuIndex({ game, document: new JSDOM().window.document,
    fetchTemplate: async () => '<div class="form-group"><label>{{localize "Example.Name"}}</label><input name="opportunityAttack"></div>' });
  await index.build();
  assert(index.hits("example.options", "portunity"));
  assert.equal(index.hits("example.private", "portunity"), 0);
  assert.equal(constructed, 0);
  index.learn("example.options", [{ text: "Runtime generated lightning controls" }]);
  assert(index.hits("example.options", "lightning"));
});
