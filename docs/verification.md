# Verification

Verified on September 15, 2026.

| Environment | Result |
| --- | --- |
| Local Foundry v13.351, `FoundryVTT_Next`, test world | 15 framework checks and 4 native-dialog checks passed |
| Local Foundry v14.360, `FoundryVTT_Test`, test world | 15 framework checks and 4 native-dialog checks passed |
| Forge v14.364, Tyranny of Thay | 15 framework checks and 4 native-dialog checks passed using a temporary browser preview |
| Forge v14.364, installed release 0.1.0 | All 19 live checks passed again from the installed package after server restart and world enablement |
| Automated DOM, search, index, and geometry tests | 8 tests passed |
| Installed core search baseline | 6 checks passed across v13 and v14 |

## Live checks

The synthetic AppV2 test has two parent tabs and two nested subtabs. It verifies category filtering, detection of an unknown menu class, learning its launcher, highlighting multiple tabs and subtabs, navigating the highlighted subtab, filtering rows, preserving unsaved input, right-side docking, scaled-window positioning, switching to the left, live query updates, an empty-result message, clearing filters, and cleanup after the settings parent closes.

The initial Forge run used a temporary menu under the core namespace during browser-preview testing. The module-filter assertion allows other installed category titles containing “core.” Temporary menu registrations and the synthetic form were removed afterward.

The native-dialog checks confirm that a linked DialogV2 form opens without blocking the parent window, that the main search accepts focus, that the form filters live, and that the dialog's action callback still runs exactly once. The final Forge console check returned no captured warnings or errors from the verification period.

## Actual custom windows

- Core User Interface on v13: `font` highlights its launcher and leaves Font Size visible. Changing the main search to `opacity` updates the open window to Inactive Opacity. Clearing restores the controls. Moving Game Settings switches docking sides.
- A multi-tab custom configuration window on local v14 and Forge: `concentration` highlights Workflow and Concentration and retains matching rows across both tabs. Choosing Concentration exposes its matching controls. A follow-up query narrows the same open window to Temporary HP Concentration Check.
- The Forge discovery pass found searchable descriptions in 76 of 85 registered custom windows before opening them. This measures descriptor coverage, not complete control coverage. Some remaining launchers are action-only; others construct their form dynamically.

## Installation state

The module folder lives under the requested `FoundryVTT_Test/Development/staging` directory. Both local data directories have a junction to it at `Data/modules/improved-settings`, and both test worlds have the module enabled.

Local servers started for these checks listen on `127.0.0.1:30001` for v13 and `localhost:30000` for v14. Existing test servers on ports 30003 and 30004 were left running.

The initial Forge verification used a temporary browser preview. Version 0.1.0 was subsequently published to [GitHub](https://github.com/webmaster94/improved-settings/releases/tag/v0.1.0) and installed through Forge Bazaar's **Install From Manifest** using the public release manifest. Forge reported `Installed Improved Settings 0.1.0`. The Tyranny of Thay server was restarted to make the package available.

The manifest and ZIP were downloaded anonymously from GitHub. The downloaded archive matched the local release artifact and contained the matching manifest at `improved-settings/module.json`. Release ZIP SHA256: `6E6A8F551DE5AEF320A559E63A3037C5378F2CB2912994542B3C48B858172658`.

After enabling the package through Module Management and reloading, the world reported module version `0.1.0`, `active: true`, saved module enablement `true`, and API version `0.1.0`. No temporary preview global was present. Foundry loaded `modules/improved-settings/scripts/main.js` from the Forge game server.

All 15 framework checks and 4 native-dialog checks passed again using test files imported from the installed package. Results are in [forge-release-results.json](forge-release-results.json). A subsequent real-window check found the Workflow Settings launcher for `concentration`, highlighted Workflow and Concentration, reported eight matches, and docked the child 12 pixels to the right of Game Settings. The captured console contained no errors during these checks; an unrelated Item Piles Tour deprecation warning appeared.

## Remaining compatibility limits

No test establishes universal compatibility with every third-party renderer. Runtime-only and lazy-tab controls need observation or an index provider. Standard DialogV2 settings forms open without browser-modal restrictions; a custom dialog that replaces Foundry's display lifecycle may need an integration. Detached windows are not docked across separate browser coordinate spaces.

Some action-only menus declare nonexistent blank templates. The index records those failures in diagnostics and continues indexing other menus.
