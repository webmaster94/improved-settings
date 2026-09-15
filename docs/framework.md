# Framework

## Discovery stages

| Stage | Evidence used | Result |
| --- | --- | --- |
| Menu registration | `game.settings.menus`, menu key, application constructor, access restriction | Identifies launcher buttons and accessible menu types |
| Static index | `PARTS`, legacy template paths, literal partial paths, localization keys in class source, referenced hidden setting definitions | Finds descriptions before a menu opens |
| Button capture | Menu key or category plus action/name/id | Associates a newly rendered form with its launcher, including redirecting launchers |
| Control detection | `.form-group`, setting attributes, native controls, associated labels and their nearest shared container | Finds rows without module-specific CSS |
| Navigation detection | `data-tab` and `data-group` on navigation and ancestor panels | Maps rows to any depth of nested tabs |
| Live observation | Child-node and text changes in linked windows | Learns dynamically inserted controls and reapplies the query |

The index parses templates in an inert HTML template element. It does not execute template helpers, application constructors, or preparation functions. Localized strings in class source provide additional descriptions when a template uses runtime loops. These descriptions can be broader than the controls currently rendered, so the window reports when its current controls have no match.

The filter owns only its CSS classes, count markers, banner, and temporary accordion expansion. It preserves the host form's native hidden state and all input values. Original native validation, saving, reset, and permission checks stay with the application.

The main SettingsConfig search handler is wrapped separately from CategoryBrowser, which Foundry also uses for other applications. Per-window observers reconcile changes made by a previously bound core search handler or module rendering. Observers disconnect while the framework writes its own UI and are removed on close.

A second narrow wrapper handles DialogV2's first display. When a dialog contains settings controls and is linked to the shared search, it uses native `show()` instead of `showModal()`. This preserves the dialog's buttons and callbacks while allowing focus to return to Game Settings. Ordinary confirmation dialogs with no settings controls keep their modal behavior.

## Public API

```js
const api = game.modules.get("improved-settings").api;
api.search("concentration", "automation"); // Settings query, then module query
api.coverage();                         // total, observed, described, unknown, busy
api.diagnostics();                      // Per-menu index state and template errors
await api.refreshIndex();
```

Integrations may register through `Hooks.on("improvedSettingsReady", api => { ... })`, or use the API after both modules are ready.

### Describe a dynamically generated menu

```js
const remove = api.registerMenuIndexer("your-package.configuration", async menu => [
  {
    key: "targeting.distance",
    label: game.i18n.localize("YOUR_PACKAGE.Distance"),
    hint: game.i18n.localize("YOUR_PACKAGE.DistanceHint"),
    choices: ["Short", "Long"]
  }
]);
```

Return an array of strings or records with `key`, `label`, `hint`, and `choices`. Records can also supply `path`, `settingId`, `default`, `scope`, `requiresReload`, and `saveMode`. Supply descriptions and declared metadata, never current values or credentials. The callback supplements automatic discovery and should be free of side effects. Call the returned function to unregister it.

`path` is an ordered array such as `[{ group: "primary", tab: "appearance", label: "Appearance" }]`. A matching field name or `selector` associates a provider record with the rendered row. `settingId` maps a control to a complete registered setting, never one subfield of a stored object.

### Describe a custom control convention

```js
const remove = api.registerControlAdapter("my-control-library", {
  selector: "[data-preference-row]",
  text: row => [
    row.querySelector("[data-label]")?.textContent,
    row.querySelector("[data-description]")?.textContent,
    row.dataset.preferenceRow
  ].filter(Boolean).join(" ")
});
```

Use a selector that identifies one meaningful row. The text callback is optional; standard DOM text and field names are used by default. Tabs still follow the standard `data-group` and `data-tab` conventions. Registering or removing an adapter refreshes open trackers.

### Provide defaults and save behavior

An adapter can add a synchronous `describe(row, { app, namespace, menuKey })` callback:

```js
describe: row => ({
  key: "distance",
  default: 30,
  scope: "world",
  requiresReload: false,
  saveMode: "submit",
  getValue: (row, app) => Number(row.querySelector("input").value),
  getSavedValue: (row, app) => app.savedConfiguration.distance,
  setValue: (row, value, app) => {
    const input = row.querySelector("input");
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
})
```

The example assumes the owning application exposes `savedConfiguration`. Supply its actual saved-value reader. `saveMode` accepts `submit`, `immediate`, or `unknown`. Custom readers and writers are optional for standard inputs, selects, textareas, and supported Foundry custom elements. Adapters must describe rows containing such controls; canvas-only widgets need a DOM integration.

Current values and baselines stay in open-window trackers. The discovery index strips values from observed rows, and persisted favorites contain location descriptors only. Reset writes through the form's controls or the adapter, never directly to `game.settings`. It previews supported changes and rechecks for changed, removed, or disabled controls before applying them.

`await api.openLocation(location)` accepts a saved location descriptor with `namespace`, optional `menuKey`, `key` or `settingId`, and a tab `path`. It opens the registered launcher, follows native tab actions, and focuses the matching rendered row. Conditional or absent controls remain unavailable. Locations do not encode field values.

## Limits

- Runtime-only controls cannot be known before rendering unless their owner supplies index entries. Coverage distinguishes observed controls from descriptions and unknown windows; none of these counts establishes that every lazy tab is indexed.
- A native setting that conditionally hides another remains responsible for that condition. Search does not override permissions or make native-hidden inputs visible.
- Launchers that share an application class are distinguished by the clicked button. A directly opened instance of an ambiguous shared class is not guessed.
- Text learned from lazy tabs is retained for the session. Rebuilding the index discards that learned text, and open windows repopulate it.
- The narrow-screen fallback retains a minimum usable window width. Two wide forms cannot always fit side by side.
- Arbitrary Svelte/React routing, closed shadow roots, and canvas controls may require an adapter or index provider.
