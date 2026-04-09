# Technical Feasibility Report: Porting Tree Style Tab (TST) to Chrome

This document outlines the technical feasibility, required changes, potential issues, and proposed mitigations for adapting the Firefox extension "Tree Style Tab" to Google Chrome.

## 1. Sidebar API vs. sidePanel API

### Differences
- **Firefox (`browser.sidebarAction`):** Provides a permanently visible sidebar docked to the left or right of the browser viewport. The extension can dynamically set the sidebar panel (`setPanel()`), update its icon, toggle its visibility (`toggle()`), and retrieve its state (`isOpen()`).
- **Chrome (`chrome.sidePanel`):** Recently introduced, it serves a similar UI function but has different methods (e.g., `setOptions({ path: '...' })` instead of `setPanel()`). Also, unlike Firefox, Chrome users have global side panel control.

### Impact & Mitigations
- The `browser.sidebarAction` API calls throughout the background scripts (`webextensions/background/background.js`, `handle-misc.js`) will need to be conditionally swapped or aliased to use `chrome.sidePanel`.
- The `manifest.json` will need to replace `"sidebar_action"` with `"side_panel"` and specify `{"default_path": "/sidebar/sidebar.html"}`.

## 2. Contextual Identities (Containers)

### Impact
- Firefox supports "Containers" out-of-the-box (`browser.contextualIdentities`). The TST codebase heavily relies on this to color-code tabs, show identity icons, and handle drag-and-drop into container tabs.
- Chrome has no equivalent API.

### Mitigations
- Remove `"contextualIdentities"` from `manifest.json` permissions.
- Provide a stub for `browser.contextualIdentities` that mimics the expected interface but acts as a no-op (or strips out the logic entirely in modules like `common/contextual-identities.js`).
- The UI (e.g., "New Tab with Container" menu) will be disabled or removed.

## 3. Tab Hiding (`browser.tabs.hide`)

### Exploration
- TST does not hide tabs *by default* to prevent users from losing standard tab features, but it has optional settings or works alongside other tools to hide the horizontal tab bar when the sidebar is used.
- Specifically, the codebase uses `browser.tabs.hide()` in testing and in options like `options/init.js` to hide tabs programmatically.

### Impact & Mitigations
- Chrome explicitly declines to implement `chrome.tabs.hide`.
- Thus, in Chrome, the top native horizontal tab bar will **always be visible**. TST will function as a "secondary" tab manager on the side.
- To port the codebase, we must remove `"tabHide"` from the `optional_permissions` in `manifest.json` and ensure calls to `browser.tabs.hide` and `browser.tabs.show` are wrapped in `try/catch` or safely stubbed to prevent runtime errors.

## 4. Browser Sessions API

### Exploration
- **What it is used for:** TST uses `browser.sessions.setTabValue()` and `browser.sessions.getWindowValue()` (and their `get` counterparts) extensively. It uses this to attach metadata directly to a tab's session state.
- For example, TST attaches a `Constants.kPERSISTENT_ID`, structural data (`kPERSISTENT_INSERT_BEFORE`), and collapsed/expanded states directly to the tab object via the sessions API (`common/unique-id.js`, `common/TreeItem.js`). This ensures that if a tab is closed and restored, or the browser is restarted, the tree relationship is perfectly preserved without needing a complex background database.

### Impact & Mitigations
- Chrome's `chrome.sessions` API only allows retrieving recently closed tabs/windows and restoring them. It **does not** provide `setTabValue` or `getWindowValue`.
- **Alternative:** To make it work in Chrome, we would have to build a completely custom `chrome.storage.local`-based lookup table mapping tab IDs to this metadata, and manually manage lifecycle events (e.g., cleaning up the storage when tabs are permanently closed).
- **Compromise for the port:** We can create an in-memory polyfill that mimics `setTabValue`/`getTabValue`, which will work while the browser is running but will lose the deep structural relationship data when tabs are restored after a full browser restart.

## 5. Browser Theme API

### Impact & Mitigations
- `browser.theme.getCurrent()` and `onUpdated` allow TST to seamlessly match Firefox themes.
- Chrome does not support this API.
- We will stub `browser.theme.getCurrent` to return a default light/dark theme object and remove the permission.

## 6. Menus overrideContext

### Impact & Mitigations
- TST overrides the context menu in the sidebar (`browser.menus.overrideContext`) to display native "Bookmark" or "Tab" context menus.
- Chrome's `chrome.contextMenus` API lacks `overrideContext`.
- We will remove `"menus.overrideContext"` from `manifest.json` and stub the call to prevent errors.

## Conclusion

Porting TST to Chrome is technically feasible to get a running sidebar that displays tabs hierarchically, but the experience will be different from Firefox:
- The top tab bar cannot be hidden.
- Container functionality will be disabled.
- Native context menus for tabs won't trigger from the sidebar.
- Session persistence for the tree structure will require major architectural changes or will be degraded to in-memory state.

If these compromises are acceptable, the port can proceed by polyfilling `browser.*` to `chrome.*` and creating safe stubs for the missing APIs.
