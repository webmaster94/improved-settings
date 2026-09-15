/** Verify browser-modal settings forms keep the shared search accessible. */
export async function runModalVerification(api = game.modules.get("improved-settings").api) {
  const key = "core.improvedSettingsModalQA";
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  let callbacks = 0;
  let app;
  const checks = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
  class ModalSettingsQA extends foundry.applications.api.DialogV2 {
    constructor() {
      super({ id: "improved-settings-modal-qa", modal: true, window: { title: "Modal settings verification" },
        content: '<div class="form-group"><label>Prismatic modal setting</label><input name="prismatic"></div><div class="form-group"><label>Other setting</label><input name="other"></div>',
        buttons: [{ action: "done", label: "Done", callback: () => { callbacks++; } }] });
    }
  }
  try {
    game.settings.registerMenu("core", "improvedSettingsModalQA", { name: "Modal verification", label: "Open modal verification", type: ModalSettingsQA, restricted: true });
    await game.settings.sheet.render({ force: true, resetTabs: true });
    api.search("");
    game.settings.sheet.element.querySelector(`[data-key="${key}"]`).click();
    await pause(200);
    app = foundry.applications.instances.get("improved-settings-modal-qa");
    check(app.element.open && !app.element.matches(":modal"), "Native settings dialog opens without blocking the parent search");
    const input = game.settings.sheet.element.querySelector('input[aria-label="Settings"]');
    input.focus();
    check(document.activeElement === input, "Main search can receive focus while the dialog is open");
    api.search("prismatic");
    check(app.element.querySelectorAll('.form-group:not(.improved-hidden)').length === 1, "Native dialog controls update from the shared search");
    app.element.querySelector('[data-action="done"]').click();
    await pause(100);
    check(callbacks === 1, "Native dialog action callback still runs exactly once");
    return { version: game.version, passed: checks.length, checks };
  } finally {
    await app?.close();
    game.settings.menus.delete(key);
    await game.settings.sheet.render({ force: true, resetTabs: true });
    api.search("");
  }
}
