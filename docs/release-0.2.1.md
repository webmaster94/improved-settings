# Improved Settings 0.2.1

- Replace Setting actions with inline star, native passport/book copy, and reset icons. Favorites use an outline star when off and a colored solid star when on.
- Move Favorites above Core in the module sidebar and remove Favorites from the Show menu.
- Put search and Show on one evenly divided row with spacing, and increase the default window width to 1040 pixels.
- Show scope, user/GM access, reload requirements, and edit/default status as compact icon chips below each setting.
- Fix missing metadata for fully qualified nested settings. Core User Interface controls now inherit browser scope without needing a reload flag. Defaults and saved-value checks address the individual field.

Validated with 19 automated tests, 24 workspace checks, and the search, docking, and DialogV2 checks. The core UI badge reproduction now passes on v13.351 and Forge v14.364. Unmapped custom fields display Scope unknown; providers can supply their metadata through the existing generic API.
