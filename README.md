# Improved Settings

A Foundry VTT module for v13 and v14. It adds separate module and setting searches to Game Settings and carries the setting search into custom configuration windows.

## Use

- **Modules**, on the left, filters category names and package IDs. Core and the game system remain searchable categories.
- **Settings**, on the right, searches labels, descriptions, field names, and rendered choice labels. Words can occur in any order. Search is literal, ignores case and accents, and matches inside words.
- A highlighted menu button leads to matching descriptions or controls inside that window.
- Open the button, then choose a highlighted tab or subtab. Matching controls remain visible under each tab. Changing the main search updates the open windows.
- Windows open beside Game Settings and switch sides when you move it. They shrink to available space and scroll when needed. If neither side has enough space for a usable window, some overlap is unavoidable.
- Standard DialogV2 settings forms also allow you to keep typing in the main search.
- Clear either filter with its × button or Escape. Ctrl/Cmd+F inside Game Settings focuses the settings search. Enter in either search field does not submit the settings form.

Filtering preserves form fields and unsaved values. It does not disable controls or submit forms. Closing Game Settings removes its filters from surviving child windows.

## Find, review, and reset settings

- Expand matching results beneath a custom-window button to see setting names and tab paths. Click a result to open that location. Description-only matches may require finding the control after opening the window.
- Search and **Show** share one row in a wider default window. Show offers all settings, different-from-default settings, and unsaved or unconfirmed edits. Edited categories and tabs remain marked when a search hides their fields. **Show edits** clears conflicting searches.
- Each setting has an outline/filled favorite star, Foundry's passport/book Copy location icon, and a reset arrow beside its name. Light dividers separate settings within existing form groups. Favorites appear above Core in the module sidebar and belong to this browser, world, and user. Copied locations and favorites contain paths and descriptions, never setting values.
- The reset arrow beside **Show** previews changes in the selected category, including its open custom windows and rows hidden by these filters. Each reset shows current and default values before confirmation. Unopened custom controls, unknown defaults, and unsupported controls are excluded. Ordinary forms still need their own Save button; forms that save on change can apply a reset immediately.
- Compact chips at the bottom of each setting show browser, player, or world scope, user/GM access, and reload requirements independently. Hover or focus chips for their full meaning; the Default chip describes current/default values. A summary of saved settings explains pending reload requirements.
- Empty results offer **Search all modules**, preserving the settings query. Custom windows offer **Show surrounding settings** to restore context while keeping matches highlighted.

For arbitrary custom forms, a changed field does not prove that its owner has saved it. Such edits are labeled unconfirmed unless registered settings or an integration supply reliable saved values. Fully qualified nested fields inherit their registered parent's scope and reload metadata; current/default comparisons address only that field's path. Unmapped controls show Scope unknown until an integration supplies metadata.

## Install

In Foundry's Install Module dialog, paste this manifest URL and click Install:

```text
https://github.com/webmaster94/improved-settings/releases/latest/download/module.json
```

On Forge, open the Bazaar, choose **Install from Manifest**, and paste the same URL. Restart the game server from My Foundry if Forge says the running game needs a restart. Enable **Improved Settings** in the world's Module Management and reload the world.

You can also extract the [release ZIP](https://github.com/webmaster94/improved-settings/releases/latest) so `Data/modules/improved-settings/module.json` exists. Restart Foundry if it was running when the module folder was added.

There are no runtime dependencies or changes to Foundry's installed files.

## How custom windows are discovered

The framework uses `game.settings.menus`, launcher-button events, application render hooks, and semantic form markup. It has no module-specific allowlist or selectors.

Before opening a window, it reads declared templates, localized descriptions referenced by the application class, and hidden setting definitions whose keys the menu references. This is a partial index, not a guarantee that every control in the window is known. It never constructs an application or calls its context-preparation methods just to search it.

Once a window opens, it learns actual labels, field names, choices, tabs, and sub-tabs from the rendered form. This also works with controls inserted later. Learned text lasts for the browser session; input values are not indexed or stored.

Windows generated entirely from runtime data, closures, or custom rendering systems may need to be opened before their controls can be found. Lazy tabs need to be visited if their controls are not present yet. Closed shadow DOM and canvas-drawn controls require an integration. Modules can provide index entries or describe custom controls through the [framework API](docs/framework.md).

Legacy ApplicationV1 forms receive row filtering and placement when their markup supports it. AppV2 forms are the primary target for tab and subtab navigation. Detached browser windows have separate coordinate spaces and are not docked together.

## Development and verification

```powershell
npm ci
npm test
npm run test:core
node tools/build.mjs
```

`test:core` reads the two installed Foundry source trees on this computer. It confirms that stock v13 and v14 match the middle of a word but require the query words in their original order. It does not redistribute Foundry code.

Inside a local test world, run this from the browser console for the live integration checks:

```js
await (await import("/modules/improved-settings/tests/live.mjs")).runLiveVerification();
await (await import("/modules/improved-settings/tests/live-modal.mjs")).runModalVerification();
await (await import("/modules/improved-settings/tests/live-workspace.mjs")).runWorkspaceVerification();
```

The test registers a temporary menu in browser memory, opens a synthetic AppV2 form, checks nested tabs and positioning, and removes the menu when finished. It does not save the synthetic form.

See [verification results](docs/verification.md) and [additional settings gaps](docs/settings-review.md).
