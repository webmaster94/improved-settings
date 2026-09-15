# Improved Settings 0.1.0

Initial release for Foundry VTT v13 and v14.

- Separate module and setting searches, with literal matching inside words and query words in any order.
- Generic discovery of custom settings windows, with launcher and tab highlights and live filtering of matching controls.
- Child settings windows open beside Game Settings and choose the side with available space.
- Standard DialogV2 settings forms keep the main search accessible.

The framework uses registered menus, application hooks, and semantic form markup without module-specific selectors. Runtime-generated controls may need to be opened before their text is searchable. See the README for discovery limits and integration APIs.

Validated with automated unit tests and live integration checks on Foundry v13.351, v14.360, and Forge v14.364.

## Install

Paste this URL into Foundry's Install Module dialog or Forge Bazaar's Install from Manifest dialog, then enable Improved Settings in the world:

https://github.com/webmaster94/improved-settings/releases/latest/download/module.json
