# Chrome Porting Context

## Goal
Adapt the Firefox extension "Tree Style Tab" (TST) to work in Google Chrome.

## Current Progress
We have performed an initial exploration and technical feasibility analysis. The extension relies heavily on Firefox-specific WebExtension APIs, meaning a true 1:1 port is impossible without degrading some functionality.

We have begun the iterative porting process by creating polyfills and modifying the manifest to get the extension to a point where Chrome will load it.

### What has been done:
1. **Manifest V3 Conversion (`manifest.json`):**
   - Migrated the extension to Manifest V3 (required for Chrome's `sidePanel` API).
   - Replaced `"sidebar_action"` with `"side_panel"` and `"default_panel"` with `"default_path"`.
   - Replaced `"browser_action"` with `"action"`.
   - Converted the background page `background.html` to a Service Worker (`background/background.js`).
   - Removed Firefox-specific permissions that Chrome rejects: `"contextualIdentities"`, `"menus.overrideContext"`, `"theme"`, and `"tabHide"`.

2. **Chrome Polyfill (`chrome-polyfill.js`):**
   - Created a polyfill that globally maps `window.browser = chrome`.
   - Stubbed `browser.tabs.hide` and `browser.tabs.show` (Chrome does not support tab hiding, so the top bar will always be visible).
   - Stubbed `browser.contextualIdentities` (Chrome lacks Containers).
   - Stubbed `browser.theme` and `browser.menus.overrideContext`.
   - Created an in-memory `Map` to stub `browser.sessions.setTabValue`, `getTabValue`, `setWindowValue`, and `getWindowValue`. **Note:** This means tree relationships will currently be lost on a full browser restart in Chrome until a robust `chrome.storage.local` persistence layer is built.
   - Mapped `browser.sidebarAction.setPanel` to `browser.sidePanel.setOptions`.

3. **Injected Polyfill:**
   - Modified `background.js`, `sidebar.js`, and `options/init.js` to unconditionally `import '/chrome-polyfill.js';` at the top of the file so the `browser` alias and stubs are loaded before the rest of the extension logic executes.

4. **Codebase Adjustments:**
   - Updated `common.js` to redefine `isFirefox` to check for the absence of `chrome` (since TST hardcoded `isFirefox = true`).
   - Cleaned up permissions requests in `permissions.js` to not ask for `TAB_HIDE`.

## Next Steps / Remaining Challenges
To continue porting in a new LLM session, focus on the following:

1. **Service Worker Migration (Manifest V3):** TST extensively uses ES Modules and `window` objects in its background scripts (since it originally used a background HTML page). Moving to a Manifest V3 Service Worker in Chrome will likely cause exceptions due to the lack of `window`, `document`, and synchronous local storage APIs. This is the biggest hurdle to getting the background script to run cleanly.
2. **Session Persistence Rewrite:** The in-memory session stub in `chrome-polyfill.js` is a temporary hack. TST relies on `browser.sessions` to keep tab hierarchies alive across restarts. A robust `chrome.storage.local` map tracking Tab IDs to their metadata needs to be written.
3. **Menu API Conversion:** TST creates extensive context menus using `browser.menus`. Chrome uses `chrome.contextMenus`. The polyfill currently maps them, but deep testing is needed to ensure all menu creation events execute correctly in Chrome.
4. **Iterative Loading:** Install the built extension locally in a Chrome browser instance (`chrome://extensions/` -> Load unpacked) and monitor the Service Worker console for exceptions. Iteratively patch the source files where errors occur.
