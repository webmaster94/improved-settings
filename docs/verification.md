# Verification

Verified on September 15, 2026.

## Version 0.2.3

- Removed idle search instructions and the coverage panel. Match counts and recovery actions remain available during searches.
- Moved actions beside the original setting label and added light dividers between rows. Visual review covered Automated Animations and core User Interface fieldsets, including narrow label columns.
- All 21 automated tests pass. The new label test verifies that action buttons do not toggle the checkbox, the native label still does, search still reads the label, and detach restores the original form.
- Local v13.351 passes all 45 live checks with API version 0.2.3. Forge v14.364 passed the 26 workspace checks before release.
- The public manifest and archive report 0.2.3. The downloaded ZIP matches the local artifact, SHA256 `CA494CA87B3C16B55D61352359A9C86D5D86798280B79EF1D70C9A0CB4F51DE0`.
- Forge Bazaar reported `Installed Improved Settings 0.2.3` using the versioned manifest. The stable latest manifest also returns 0.2.3.
- After restart, the installed module and API both report 0.2.3, active and saved enablement are true, and no preview global exists. All 45 live checks pass from the installed package. No console errors were captured during those checks. [Recorded results](forge-release-0.2.3-results.json).
- Final installed visual review confirmed actions beside Automated Animations setting names, chips below, and the row dividers.

## Version 0.2.2

- Final follow-up for custom integrations that supply world scope: use the GM access chip unless the integration explicitly overrides access. 20 automated tests pass, including this metadata case.
- Rechecked the final v13.351 package: API 0.2.2 and all 24 workspace checks passed. The 19 search/docking/modal checks passed for the unchanged 0.2.1 behavior below.
- Downloaded the public 0.2.2 manifest and ZIP and verified the archive matches the local artifact. SHA256 `F7239DE9B5706906947522AA04B58AA2382FD787E52E402059F720FB5A4FCB77`.
- Forge reported `Installed Improved Settings 0.2.2` using the versioned manifest. The stable latest manifest subsequently returned 0.2.2 as well.
- After restarting Tyranny of Thay, module and API versions were both 0.2.2, saved enablement and active state were true, and no preview global was present. All 43 live checks passed from the installed package. [Recorded results](forge-release-0.2.2-results.json).
- Final visual and DOM checks confirmed the 1040-pixel window, equal search/Show row, sidebar Favorites, inline icons, and scope chips for all seven core UI controls. No console errors were captured during the installed-release checks.

## Version 0.2.1

- The original core UI reproduction found seven controls with empty scope badges. Fully qualified nested field mapping now supplies browser scope for all seven on v13.351 and Forge v14.364, independently of reload metadata.
- 19 automated tests pass, including a regression that compares and resets a nested field without changing or exposing sibling values.
- Local v13 passes 24 workspace checks and 19 search/docking/DialogV2 checks. The workspace checks include sidebar Favorites, equal search/Show widths, and inline star/copy controls.
- The docking fixture explicitly reserves space for its child window; the wider default no longer accidentally removes the test's claimed available space on a 1280-pixel viewport.
- Visual review on Forge checked the chip footer, native copy icon, outline star, sidebar placement, and shared search row.

## Version 0.2.0

- Local v13.351 and Forge v14.364 each passed 40 live checks with the final candidate: 15 search/placement checks, 4 DialogV2 checks, and 21 workspace checks.
- 18 automated tests passed. New coverage includes typed defaults, edited fields hidden by search, saved-value confirmation, reset previews and cancellation, controls changed or disabled during a preview, replaced controls, captured input events, favorite privacy, metadata adapters, and surrounding mode.
- The new live fixture verifies path previews, direct parent/subtab navigation, scope/reload labels, dirty summaries and tabs, Show edits, favorites, surrounding context, changed filtering, per-setting and module resets, empty-result recovery, and coverage categories. It stages synthetic values without persisting them.
- A separate synthetic `clientSettingChanged` event verified the saved-reload summary on Forge without changing a stored setting.
- Warm searches in the Forge list of 659 tracked controls measured 93, 84, and 83 ms after caching row descriptions and control mappings. These are browser measurements from one session, not a cross-device benchmark.
- Local v14.360 was verified for the earlier release below; the 0.2.0 v14 checks use Forge v14.364.
- Published [0.2.0](https://github.com/webmaster94/improved-settings/releases/tag/v0.2.0), downloaded its manifest and archive anonymously, and verified both manifests report 0.2.0. The public ZIP matched the local artifact, SHA256 `AE1D588D649C1D477EC8EF6A5309C81C6EC4C154C50B6C5F0B86D106EC9AECC5`.
- Forge Bazaar's Install From Manifest reported `Installed Improved Settings 0.2.0` using the stable public manifest URL. The Tyranny of Thay server was then restarted.
- After restart, Forge reported installed version and API version `0.2.0`, active and saved enablement both `true`, and no temporary preview. All 40 checks passed again from the installed test files. [Recorded results](forge-release-0.2.0-results.json).
- The final core User Interface check kept Font Size visible for `font`, hid empty section boxes, and docked the child on the left of Game Settings. The captured console contained no errors during installed-release verification.

## Earlier releases

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
