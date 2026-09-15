# Improved Settings 0.2.0

Search custom windows, jump to matching tabs, and review changes without losing track of hidden edits.

- Matching setting previews with tab paths and direct navigation.
- Coverage split into observed controls, descriptions only, and undiscovered windows.
- Edit indicators on rows, categories, and tabs, plus Show edits.
- Different-from-default filter, current/default details, and confirmed per-setting or selected-module reset previews.
- Scope and reload labels, including a summary after reload-requiring settings are saved.
- Search all modules recovery that preserves the settings query.
- Show surrounding settings in linked windows.
- Favorites and Copy location without copied setting values.
- Generic metadata adapters for custom controls, defaults, and save behavior. No module-specific detection rules.

Verified with 18 automated tests and 40 live checks on local Foundry v13.351 and Forge v14.364. Resets cover supported controls in Game Settings and open custom windows. Unknown defaults, unopened custom controls, and unsupported inputs are excluded; custom save behavior is marked unconfirmed when its owner supplies no reliable metadata.
