# Settings review

## What stock search does

Both installed versions use a literal, case-insensitive regular expression without word boundaries. The query and candidate text have diacritics removed. The CategoryBrowser search checks labels, hints, and marked searchable text for each visible settings entry.

The installed-code regression confirms:

| Query for “Automatic Token Rotation” | v13.351 | v14.360 |
| --- | --- | --- |
| `tation` | Matches | Matches |
| `token rotation` | Matches | Matches |
| `rotation automatic` | Does not match | Does not match |

Custom settings menus are registered separately from their contents. The standard menu definition describes its button and application class, but does not require a list of its inner controls. That is the main discovery gap.

Primary API references: [SearchFilter v14](https://foundryvtt.com/api/v14/classes/foundry.applications.ux.SearchFilter.html), [ClientSettings v13](https://foundryvtt.com/api/v13/classes/foundry.helpers.ClientSettings.html), and [SettingsConfig v14](https://foundryvtt.com/api/classes/foundry.applications.settings.SettingsConfig.html). Implementation details above were checked against both locally installed source trees.

## Gaps addressed in 0.2.0

1. **Who a setting affects.** A consistent badge could distinguish this browser, this user, and the whole world. The setting registry already carries this information for registered settings; arbitrary object fields need metadata from their owner.
2. **Changed values.** A “different from default” filter would help diagnose a world with many modules. Unsaved edits need a separate indicator so a search cannot make them easy to forget.
3. **Reset scope.** The main Reset Defaults button applies broadly. A per-setting or per-module reset, with a concrete preview of affected values, would be easier to trust during troubleshooting.
4. **Reload requirements.** A visible reload badge and a summary of pending reloads would explain why a saved change has not taken effect.
5. **Shareable setting locations.** Copying a package ID, setting key, and tab path would make support instructions precise without sharing the user's values.
6. **A standard menu-search contract.** Module authors could expose labels, keys, hints, tab paths, and row selectors directly. This would eliminate guesswork for runtime-generated forms. Improved Settings' index-provider API is a starting point.

Version 0.2.0 implements these proposals through a shared control model, plus result paths with direct navigation, observed/description/unknown coverage, targeted empty-result recovery, surrounding settings, and browser-local favorites. See the README for behavior and limits. Custom forms still need metadata to establish reliable defaults and save state; detection alone cannot infer those facts.
