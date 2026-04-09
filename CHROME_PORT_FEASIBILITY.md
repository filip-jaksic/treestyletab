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


---

## 6. The `browser.sessions` API (Tab and Window State Persistence)

TST heavily relies on Firefox's `browser.sessions.setTabValue`, `getTabValue`, `setWindowValue`, and `getWindowValue` APIs. These APIs allow extensions to store arbitrary data associated with a specific tab or window, and crucially, **this data persists and is automatically restored across browser restarts** when a user's session is restored.

*   **Current Usage in TST:**
    *   Tracking persistent unique IDs for tabs across sessions.
    *   Storing the tree structure (parent/child/ancestor relationships).
    *   Storing UI states (e.g., whether a subtree is collapsed or expanded).
    *   Caching sidebar states and subpanel heights.
*   **Chrome Equivalent:** None natively. Chrome's `chrome.sessions` API only supports retrieving recently closed tabs/windows and does not support storing custom key-value data on tabs.
*   **Impact:** Without a replacement, TST will lose the tree structure and all tab groupings when Chrome is restarted.

### Mitigation Strategies

To handle this in Chrome, we must implement our own state management. Here are the potential approaches:

#### 1. In-Memory Store (Hashmap in Service Worker)
For a Proof of Concept (POC), we can store the tab/window data in a simple JavaScript `Map` or Object within the Background Service Worker.
*   **Pros:** Extremely simple to implement. Fast synchronous access.
*   **Cons:** State is completely lost when the Service Worker terminates (which happens frequently in MV3) or when the browser restarts.
*   **Mitigation for SW Termination:** We can force the Service Worker to stay alive by maintaining a persistent connection (e.g., via `chrome.runtime.connect`) from the active `sidePanel`. As long as the TST sidebar is open, the in-memory state remains intact.

#### 2. `chrome.storage.session` API
Chrome 102+ introduced `chrome.storage.session`, which holds data in memory for the duration of the browser session.
*   **Pros:** Built-in API. Survives Service Worker restarts.
*   **Cons:** Data is cleared entirely when the browser is completely closed. Does not solve the "restoring tree on browser restart" problem. Maximum capacity is limited (10MB).

#### 3. `chrome.storage.local` with Manual Mapping
We can serialize the tab/window state and save it to persistent disk storage using `chrome.storage.local`. We would key the data by the Tab ID.
*   **Pros:** Data persists across browser restarts.
*   **Cons:** High complexity. Chrome assigns **new** Tab IDs when tabs are restored after a browser restart. We would need complex heuristics (matching URLs, titles, and order) to map the newly created tabs back to the saved state in `chrome.storage.local`. Garbage collection is required to clear out data for closed tabs.

#### 4. Offscreen Document
Manifest V3 allows extensions to create a hidden "Offscreen Document" to perform tasks the Service Worker cannot. We could hold the state in the Offscreen Document's DOM or variables.
*   **Pros:** Keeps state alive longer than a typical Service Worker lifecycle.
*   **Cons:** Overkill for simple key-value storage. Still loses data on browser restart, facing the same Tab ID mapping issues as approach #3.

#### 5. Injecting State into Page `sessionStorage`
We could use content scripts to inject the TST state directly into the `sessionStorage` of the webpage loaded in the tab.
*   **Pros:** `sessionStorage` is automatically restored by Chrome when a tab is restored after a browser restart, elegantly solving the Tab ID change problem.
*   **Cons:** Highly fragile. Requires content script injection on *every* page, which fails on restricted URLs (like `chrome://` pages or the Web Store). If a tab crashes or navigates cross-origin, the state might be lost or become complex to track.

### Recommendation for POC
For the initial POC, **Approach #1 (In-Memory Store with Keep-Alive)** combined with **Approach #2 (`chrome.storage.session`)** is recommended to mock the API structure quickly without worrying about complex cross-session restoration logic. Full persistence across restarts (Approach #3) should be deferred until the core sidebar functionality is proven in Chrome.

## 7. Conclusion & Level of Effort

Creating a **simplified proof-of-concept (POC)** that displays a tree of tabs in the Chrome Side Panel is highly feasible. It requires:
1. Updating `manifest.json`.
2. Mocking/stripping out Firefox-specific APIs (`tabHide`, `contextualIdentities`, `theme`).
3. Polyfilling the `window` object in the background scripts to satisfy the Service Worker.
