# Comprehensive Analysis: `browser.sessions` API in Tree Style Tab (TST)

## 1. Introduction

Tree Style Tab (TST) relies heavily on Firefox-specific state persistence mechanisms to maintain the structure and UI state of the tab tree. Central to this architecture is the `browser.sessions` API suite, specifically methods like `setTabValue`, `getTabValue`, `setWindowValue`, `getWindowValue`, `removeTabValue`, and `removeWindowValue`.

These APIs allow extensions to associate custom, arbitrary data with specific tabs or windows. Crucially, in Firefox, **this data is automatically persisted across browser restarts and session restorations.**

Chrome's Manifest V3 (MV3) lacks a direct equivalent for these methods. `chrome.sessions` exists but is primarily for querying recently closed tabs/windows; it does not provide arbitrary key-value storage tied to the tab lifecycle.

This document details exactly how these APIs are used within the TST codebase and explores comprehensive mitigation strategies required for the Chrome MV3 port.

---

## 2. In-Depth Analysis of Codebase Usage

A search across the `webextensions/` directory reveals extensive use of the `browser.sessions` API. The usage can be categorized into four main domains:

### A. Unique Identification & Tracking (`webextensions/common/unique-id.js`)
*   **The Problem:** Browsers (both Chrome and Firefox) assign new numeric Tab IDs when a browser restarts and restores previous sessions. If TST only relied on native Tab IDs, it would lose track of which tab was which after a restart.
*   **Usage:** TST uses `browser.sessions.setTabValue(tab.id, Constants.kPERSISTENT_ID, ...)` to store a generated unique string ID for every tab. It similarly uses `setWindowValue` to track window IDs.
*   **Impact of Loss:** TST would be unable to correlate a restored tab with its historical position in the tree or its saved configuration.

### B. Tree Structure Integrity (`webextensions/background/tree-structure.js`)
*   **The Problem:** The core feature of TST is the hierarchy (parents, children, siblings).
*   **Usage:** TST caches the structural relationships of tabs directly onto the tabs and windows themselves. For example, it stores `kPERSISTENT_ANCESTORS`, `kPERSISTENT_CHILDREN`, `kPERSISTENT_INSERT_BEFORE`, and `kPERSISTENT_INSERT_AFTER` using `setTabValue`. It also stores the entire window's tree structure snapshot using `setWindowValue(win.id, Constants.kWINDOW_STATE_TREE_STRUCTURE)`.
*   **Impact of Loss:** When the browser restarts, TST would see a flat list of restored tabs and would be completely unable to reconstruct the parent-child tree hierarchy.

### C. UI & Visual State (`webextensions/common/TreeItem.js`, `sidebar/`, `background/tree.js`)
*   **The Problem:** Users expect their visual preferences (like which branches are collapsed) to remain consistent across sessions.
*   **Usage:**
    *   **Collapsed States:** TST stores `kPERSISTENT_SUBTREE_COLLAPSED` via `setTabValue`.
    *   **Sidebar State:** `setWindowValue` is heavily used to cache the dirty state of the sidebar (`kWINDOW_STATE_CACHED_SIDEBAR_TABS_DIRTY`) and specific scroll positions (`kWINDOW_STATE_SCROLL_POSITION`).
    *   **Subpanel Dimensions:** `sidebar/subpanel.js` uses `setWindowValue` to store the heights and active provider IDs of the bottom subpanels (`kWINDOW_STATE_SUBPANEL_HEIGHT`).
*   **Impact of Loss:** Restoring a session would result in all trees being fully expanded, scroll positions lost, and subpanels resetting to default heights.

### D. Background Caching & Performance (`webextensions/background/background.js`, `background-cache.js`)
*   **The Problem:** Rebuilding the tree frequently is expensive.
*   **Usage:** TST uses `getWindowValue` and `getTabValue` to retrieve cached tab representations (`kWINDOW_STATE_CACHED_TABS`).
*   **Impact of Loss:** Minor performance degradation on startup as the extension would have to recalculate the state from scratch.

---

## 3. Comprehensive Mitigation Strategies

Because Chrome does not offer persistent, tab-tied key-value storage, we must engineer a custom state management system.

The core challenge in Chrome is **Tab ID Volatility**. When Chrome restarts and restores tabs, it assigns entirely new Tab IDs. Without `getTabValue`, we cannot immediately link the new `Tab(id: 456)` to the old `Tab(id: 123)` from the previous session.

Here is an in-depth exploration of possible mitigations:

### Strategy 1: In-Memory Store with Keep-Alive (Ideal for POC)

For the initial Proof-of-Concept (POC), the goal is simply to make the tree function within a single browsing session.

*   **Implementation:**
    *   Create a global `Map<TabId, Object>` and `Map<WindowId, Object>` inside the Background Service Worker to mimic the `sessions` API.
    *   Override the `browser.sessions.*` calls to read/write to these maps.
    *   **Crucial Step:** Service Workers in MV3 terminate after ~30 seconds of inactivity. To prevent data loss while the browser is open, the `sidePanel` must open a long-lived connection (`chrome.runtime.connect`) to the Service Worker. As long as the side panel is open, the SW stays alive, and the memory maps persist.
*   **Pros:**
    *   Extremely simple and fast to implement.
    *   Fully synchronous read/write access (unlike `chrome.storage`), minimizing refactoring of TST's heavily synchronous logic.
*   **Cons:**
    *   **Fatal Flaw:** Data is completely destroyed if the Service Worker manages to die, or when the browser restarts.
*   **Verdict:** Perfect for the initial POC to prove UI/DOM porting viability, but unacceptable for a production release.

### Strategy 2: Offscreen Document State Holder

MV3 introduced Offscreen Documents to handle tasks Service Workers cannot (like DOM access or audio).

*   **Implementation:**
    *   Open an Offscreen Document when the extension loads.
    *   Store the Tab/Window state maps inside the Offscreen Document's global `window` object.
    *   The Service Worker messages the Offscreen Document to read/write state.
*   **Pros:**
    *   Offscreen Documents have a longer, more predictable lifecycle than Service Workers.
*   **Cons:**
    *   Requires asynchronous messaging for every state read/write, heavily impacting TST's performance.
    *   Like Strategy 1, it completely loses data on browser restart.
*   **Verdict:** Inferior to Strategy 1 + Keep-Alive. It adds complexity without solving the cross-session persistence issue.

### Strategy 3: `chrome.storage.session` API

Introduced in Chrome 102, this API stores data in memory.

*   **Implementation:** Replace `browser.sessions` calls with `chrome.storage.session.get/set`.
*   **Pros:**
    *   Survives Service Worker terminations automatically.
    *   Built-in, native API.
*   **Cons:**
    *   Data is wiped on browser restart.
    *   Limited to 10MB of data.
    *   Asynchronous access.
*   **Verdict:** A cleaner alternative to Strategy 1 for in-session persistence, but still fails the core requirement of surviving browser restarts.

### Strategy 4: `chrome.storage.local` with Heuristic Mapping (The Production Requirement)

To achieve true parity with Firefox, state *must* survive browser restarts. This is the most complex approach.

*   **Implementation:**
    *   Serialize the entire tree state and save it to `chrome.storage.local` constantly.
    *   **The Hard Part (Restoration):** When Chrome restarts, it fires `chrome.tabs.onCreated` for the restored tabs, but assigns them new IDs.
    *   We must implement a heuristic matching algorithm. When the extension boots, it loads the "old" state from `chrome.storage.local`. As new tabs are created during session restore, the algorithm attempts to match them to the old state by comparing `url`, `title`, `index`, and `windowId`.
    *   Once matched, the new Tab ID is mapped to the old persistent tree node.
*   **Pros:**
    *   The *only* strategy that allows the tree structure to survive browser restarts in Chrome without injecting scripts.
*   **Cons:**
    *   Extremely complex and fragile. Heuristics are prone to race conditions (e.g., if a user has two identical "New Tab" pages, they might get swapped).
    *   Requires a robust garbage collection mechanism. If a user closes a tab while the extension is disabled, the old state remains in `storage.local` indefinitely.
*   **Verdict:** Mandatory for a full release, but significantly too complex for a POC.

### Strategy 5: Injecting State into Page `sessionStorage`

A novel approach to bypass the "Tab ID change" problem on restart.

*   **Implementation:**
    *   Use Content Scripts (`chrome.scripting.executeScript`) to inject the `browser.sessions` data directly into the `window.sessionStorage` of the webpage loaded in that specific tab.
    *   Chrome automatically saves and restores a page's `sessionStorage` when the browser restarts and the tab is restored.
    *   When the tab boots up after a restart, the Content Script reads the old state from `sessionStorage` and messages it back to the Service Worker, effectively saying "I am the newly restored tab, and here is my old TST tree data."
*   **Pros:**
    *   Elegantly solves the Tab ID mapping issue. Chrome handles the cross-session mapping for us.
*   **Cons:**
    *   **Highly Fragile.** Content scripts cannot run on restricted URLs (`chrome://`, `edge://`, Chrome Web Store). Tabs on these URLs would lose their state completely.
    *   Data might be lost if a tab undergoes cross-origin navigations depending on how strictly Chrome isolates `sessionStorage`.
*   **Verdict:** Creative, but too unreliable due to restricted URL limitations.

---

## 4. Conclusion and Recommended Action Plan

The absence of `browser.sessions.setTabValue` is the most significant architectural hurdle in porting TST to Chrome, arguably more challenging than adapting to the `sidePanel` API.

**For the Proof-of-Concept:**
Implement **Strategy 1 (In-Memory Map)** combined with a Keep-Alive mechanism tied to the Side Panel. This will allow developers to quickly port the UI and tree manipulation logic without getting bogged down in complex asynchronous storage refactoring.

**For the Final Port:**
Implement **Strategy 4 (`chrome.storage.local` with Heuristic Mapping)**. It is the only viable path to providing a robust, restart-resilient tree experience, despite the significant engineering complexity involved in matching restored tabs to their historical data.
