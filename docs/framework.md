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
api.coverage();                         // Described windows / discovered windows
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

Return an array of strings or records with `key`, `label`, `hint`, and `choices`. Supply descriptions, not saved values or credentials. The callback supplements automatic discovery and should be free of side effects. Call the returned function to unregister it.

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

Use a selector that identifies one meaningful row. The text callback is optional; standard DOM text and field names are used by default. Tabs still follow the standard `data-group` and `data-tab` conventions. Reopen the form or change the search after registering an adapter.

## Limits

- Runtime-only controls cannot be known before rendering unless their owner supplies index entries. The coverage count means a window has searchable descriptions; it is not a count of fully indexed windows.
- A native setting that conditionally hides another remains responsible for that condition. Search does not override permissions or make native-hidden inputs visible.
- Launchers that share an application class are distinguished by the clicked button. A directly opened instance of an ambiguous shared class is not guessed.
- Text learned from lazy tabs is retained for the session. Rebuilding the index discards that learned text, and open windows repopulate it.
- The narrow-screen fallback retains a minimum usable window width. Two wide forms cannot always fit side by side.
- Arbitrary Svelte/React routing, closed shadow roots, and canvas controls may require an adapter or index provider.
