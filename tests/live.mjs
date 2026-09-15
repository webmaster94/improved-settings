/** Run from a GM browser in a local test world. Registers only temporary in-memory menus. */
export async function runLiveVerification(api = game.modules.get("improved-settings").api) {
  const checks = [];
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
    checks.push(message);
  };
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const key = "improved-settings.qa";
  class FrameworkTestWindow extends foundry.applications.api.ApplicationV2 {
    static DEFAULT_OPTIONS = { id: "improved-settings-qa", tag: "form", window: { title: "Improved Settings verification", resizable: true }, position: { width: 420, height: 500 }, form: { handler: () => {} } };
    tabGroups = { primary: "basic", secondary: "alpha" };
    async _renderHTML() {
      return `<nav class="tabs"><button type="button" data-action="tab" data-group="primary" data-tab="basic" class="active">Basic</button><button type="button" data-action="tab" data-group="primary" data-tab="advanced">Advanced</button></nav>
        <section class="tab active" data-group="primary" data-tab="basic"><div class="form-group"><label>Prismatic targeting</label><input name="prismaticTarget" value="original"></div><div class="form-group"><label>Unrelated audio</label><input name="audio" type="checkbox" checked></div></section>
        <section class="tab" data-group="primary" data-tab="advanced"><nav class="tabs"><button type="button" data-action="tab" data-group="secondary" data-tab="alpha" class="active">Alpha</button><button type="button" data-action="tab" data-group="secondary" data-tab="beta">Beta</button></nav>
        <section class="tab active" data-group="secondary" data-tab="alpha"><div class="form-group"><label>Prismatic duration</label><input name="prismaticDuration" value="7"></div></section>
        <section class="tab" data-group="secondary" data-tab="beta"><div class="form-group"><label>Prismatic shape</label><select name="prismaticShape"><option>Round</option></select></div></section></section><footer><button type="submit">Save</button></footer>`;
    }
    _replaceHTML(html, content) { content.innerHTML = html; }
  }
  const settings = game.settings.sheet;
  let app;
  try {
    game.settings.registerMenu("improved-settings", "qa", { name: "Framework verification", label: "Open verification", type: FrameworkTestWindow, restricted: true });
    await settings.render({ force: true, resetTabs: true });
    settings.setPosition({ left: 12, top: 30 });
    api.search("", "improved");
    check(settings.element.querySelectorAll('aside [data-tab]:not(.improved-hidden)').length === 1, "Module filter narrows the category list");
    settings.element.querySelector(`[data-key="${key}"]`).click();
    await pause(250);
    app = foundry.applications.instances.get("improved-settings-qa");
    check(!!app?.rendered, "Unknown registered AppV2 opens through its button");
    const unsaved = app.element.querySelector('[name="prismaticTarget"]');
    unsaved.value = "unsaved edit";
    api.search("prismatic", "improved");
    check(settings.element.querySelector(`[data-key="${key}"]`).classList.contains("improved-match"), "Observed controls make the launcher searchable");
    check(app.element.querySelectorAll('[data-tab].improved-match').length === 4, "Both parent tabs and both nested subtabs are highlighted");
    app.changeTab("advanced", "primary");
    app.changeTab("beta", "secondary");
    check(app.element.querySelector('.tab[data-tab="beta"]').classList.contains("active"), "Highlighted nested tab remains navigable");
    check(app.element.querySelector('[name="audio"]').closest('.form-group').classList.contains("improved-hidden"), "Nonmatching settings are filtered");
    check(unsaved.value === "unsaved edit", "Search preserves unsaved form values");
    const parent = settings.element.getBoundingClientRect();
    const child = app.element.getBoundingClientRect();
    check(child.left >= parent.right, "Child docks to the right when room is available");
    app.setPosition({ scale: 0.8 });
    await pause(80);
    check(Math.abs(app.element.getBoundingClientRect().left - parent.right - 12) < 2, "Scaled applications preserve the docking gap");
    app.setPosition({ scale: 1 });
    settings.setPosition({ left: window.innerWidth - parent.width - 12 });
    await pause(100);
    check(app.element.dataset.improvedSide === "left", "Moving Settings switches docking to the left");
    api.search("prismatic duration", "improved");
    check(app.element.querySelectorAll('.form-group:not(.improved-hidden)').length === 1, "Live query change narrows every tab to the matching setting");
    api.search("no-such-prismatic-setting", "improved");
    check(settings.element.querySelector('.improved-status').textContent.includes("0 matching"), "Empty results explain how to recover");
    api.search("");
    check(app.element.querySelectorAll('.improved-hidden').length === 0, "Clearing search restores all settings");
    check(unsaved.value === "unsaved edit" && app.element.querySelector('[name="audio"]').checked, "Clearing preserves edited and unchanged controls");
    api.search("prismatic");
    await settings.close();
    check(app.element.querySelectorAll('.improved-hidden, .improved-match, .improved-child-banner').length === 0, "Closing Settings removes filtering from its surviving child");
    return { version: game.version, passed: checks.length, checks };
  } finally {
    await app?.close();
    game.settings.menus.delete(key);
    await settings.render({ force: true, resetTabs: true });
    api.search("");
  }
}
