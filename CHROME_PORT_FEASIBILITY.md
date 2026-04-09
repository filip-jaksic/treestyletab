# Technical Feasibility Report: Porting Tree Style Tab to Google Chrome (Manifest V3)

## 1. Executive Summary

Porting "Tree Style Tab" (TST) from Firefox (Manifest V2) to Google Chrome (Manifest V3) is technically feasible but requires a significant rewrite of core functionality. TST was originally built around Firefox-specific capabilities that either do not exist in Chrome or are handled entirely differently under Manifest V3.

To achieve a functioning port, one will need to:
1. Migrate the underlying architecture to Manifest V3 (Service Workers instead of Background Pages).
2. Adapt to Chrome's `sidePanel` API instead of Firefox's `sidebarAction`.
3. Stub out or completely rewrite functionality relying on Firefox-exclusive APIs (e.g., `tabHide`, `contextualIdentities`).
4. Abstract the `browser.*` Promise-based namespace to work with Chrome's API structure.

A "proof-of-concept" port that creates a basic sidebar with a visual list of tabs is manageable. However, achieving full feature parity with the Firefox version is impossible due to Chromium's API limitations.

---

## 2. Manifest V3 Migration Hurdles

Chrome no longer accepts new Manifest V2 extensions; a port must target Manifest V3.

*   **Service Workers vs Background Pages:** TST uses a background page (`background.html`) and heavily relies on DOM APIs in its background scripts. Chrome MV3 requires a Background Service Worker (`background.js`), which **has no access to the DOM (`window`, `document`)**.
    *   *Required Effort:* Moderate to High. All references to `window.*` (e.g., `window.setTimeout`, `window.addEventListener('DOMContentLoaded')`, `window.matchMedia`) in the `webextensions/background/` directory must be removed, polyfilled, or replaced with `globalThis` or Service Worker equivalents. The modular structure of assigning objects to `window` for cross-script access will need to be refactored using ES Modules.
*   **Permissions Changes:**
    *   `browser_action` must be renamed to `action`.
    *   `sidebar_action` must be replaced with `side_panel`.
    *   `menus` must be renamed to `contextMenus`.
*   **The `browser.*` Namespace:** TST uses the native `browser.*` namespace which returns Promises (a standard in Firefox). Chrome natively uses `chrome.*` and has historically relied on callbacks, though MV3 does support Promises for most APIs.
    *   *Required Effort:* Low. A global alias (`globalThis.browser = chrome;`) or utilizing the `webextension-polyfill` library will resolve most namespace discrepancies.

---

## 3. Firefox-Specific APIs Missing in Chrome

TST utilizes several powerful Firefox-exclusive features to manage tabs. These features must be disabled or entirely re-architected for Chrome:

*   **`browser.tabs.hide` (and `tabHide` permission):** TST uses this API to physically hide tabs from the native horizontal tab bar, encouraging users to rely solely on the TST sidebar.
    *   *Chrome Equivalent:* None. Chrome does not allow extensions to hide tabs from the native tab strip.
    *   *Impact:* Users will always see the native horizontal tab bar alongside the TST sidebar.
*   **`browser.contextualIdentities` (Container Tabs):** TST integrates deeply with Firefox's Multi-Account Containers to group tabs by identity.
    *   *Chrome Equivalent:* None. Chrome handles profiles differently and does not expose a programmatic container API to extensions.
    *   *Impact:* Container/Identity support must be completely stripped from the Chrome port.
*   **`browser.tabGroups`:** Firefox has native tab groups, and TST integrates with them. Chrome has its own `chrome.tabGroups` API, but the implementation and properties differ significantly.
    *   *Required Effort:* High. The tab group logic must be rewritten to interface with `chrome.tabGroups`.
*   **`browser.theme`:** TST dynamically colors its sidebar to match the user's Firefox theme.
    *   *Chrome Equivalent:* Chrome extensions cannot query the active browser theme colors in the same programmatic way.
    *   *Impact:* Theme matching will likely need to be simplified to a basic `prefers-color-scheme: dark` media query or rely on user-selected settings.
*   **`browser.runtime.getBrowserInfo()`:** Used for platform-specific bug workarounds. Does not exist in Chrome.

---

## 4. Sidebar Architecture (`sidePanel` API)

Firefox uses `browser.sidebarAction`. Chrome recently introduced the `chrome.sidePanel` API, making this port possible. However, there are behavioral differences:

*   **Programmatic Toggling:** Firefox allows extensions to easily toggle the sidebar open/closed via `browser.sidebarAction.toggle()`. Chrome restricts programmatic opening of the side panel to direct user interactions (like an action click via `sidePanel.setPanelBehavior`) and does not currently have a reliable programmatic `.close()` or `.toggle()` API without complex workarounds.
*   *Required Effort:* Moderate. TST's sidebar management commands must be mapped to `chrome.sidePanel.setOptions({ path: '...' })` and user-action behaviors.

---

## 5. Tree Logic and `openerTabId`

TST constructs its tree hierarchy by tracking which tab opened which. It relies heavily on the `openerTabId` property of the `tabs.Tab` object.

*   **Compatibility:** Chrome *does* support `openerTabId`.
*   **The Catch:** TST intentionally manipulates and rewrites the `openerTabId` of tabs to force tree restructurings and manage internal state. While Chrome supports reading `openerTabId`, manipulating it via `chrome.tabs.update()` to establish artificial hierarchies might behave differently or encounter stricter validations in Chromium.
*   *Required Effort:* Moderate. Testing is required to ensure Chrome respects the mutated `openerTabId` values TST uses to maintain the visual tree.

---

## 6. Conclusion & Level of Effort

Creating a **simplified proof-of-concept (POC)** that displays a tree of tabs in the Chrome Side Panel is highly feasible. It requires:
1. Updating `manifest.json`.
2. Mocking/stripping out Firefox-specific APIs (`tabHide`, `contextualIdentities`, `theme`).
3. Polyfilling the `window` object in the background scripts to satisfy the Service Worker.
