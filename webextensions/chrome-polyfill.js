if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
  window.browser = chrome;

  // Stub missing APIs
  if (!browser.tabs) browser.tabs = {};
  if (!browser.tabs.hide) browser.tabs.hide = async () => {};
  if (!browser.tabs.show) browser.tabs.show = async () => {};

  if (!browser.contextualIdentities) {
    browser.contextualIdentities = {
      query:     async () => [],
      onCreated: { addListener: () => {}, removeListener: () => {} },
      onRemoved: { addListener: () => {}, removeListener: () => {} },
      onUpdated: { addListener: () => {}, removeListener: () => {} }
    };
  }

  if (!browser.theme) {
    browser.theme = {
      getCurrent: async () => ({ colors: {} }),
      onUpdated:  { addListener: () => {}, removeListener: () => {} }
    };
  }

  if (browser.menus && !browser.menus.overrideContext) {
    browser.menus.overrideContext = () => {};
  }
  if (!browser.menus && browser.contextMenus) {
    browser.menus = browser.contextMenus;
    browser.menus.overrideContext = () => {};
  }

  if (!browser.sessions) browser.sessions = {};
  const _sessionStore = new Map();
  if (!browser.sessions.setTabValue) {
    browser.sessions.setTabValue = async (tabId, key, value) => {
      const k = `tab-${tabId}-${key}`;
      _sessionStore.set(k, value);
    };
  }
  if (!browser.sessions.getTabValue) {
    browser.sessions.getTabValue = async (tabId, key) => {
      const k = `tab-${tabId}-${key}`;
      return _sessionStore.get(k);
    };
  }
  if (!browser.sessions.removeTabValue) {
    browser.sessions.removeTabValue = async (tabId, key) => {
      const k = `tab-${tabId}-${key}`;
      _sessionStore.delete(k);
    };
  }

  if (!browser.sessions.setWindowValue) {
    browser.sessions.setWindowValue = async (windowId, key, value) => {
      const k = `win-${windowId}-${key}`;
      _sessionStore.set(k, value);
    };
  }
  if (!browser.sessions.getWindowValue) {
    browser.sessions.getWindowValue = async (windowId, key) => {
      const k = `win-${windowId}-${key}`;
      return _sessionStore.get(k);
    };
  }
  if (!browser.sessions.removeWindowValue) {
    browser.sessions.removeWindowValue = async (windowId, key) => {
      const k = `win-${windowId}-${key}`;
      _sessionStore.delete(k);
    };
  }
  if (!browser.sessions.getRecentlyClosed) {
    browser.sessions.getRecentlyClosed = async () => [];
    browser.sessions.MAX_SESSION_RESULTS = 25;
  }
  if (!browser.sessions.restore) {
    browser.sessions.restore = async () => {};
  }

  // Side Panel API
  if (!browser.sidebarAction && browser.sidePanel) {
    browser.sidebarAction = {
      setPanel: async (details) => {
        if (details.panel) {
          await browser.sidePanel.setOptions({ path: details.panel });
        }
      },
      setIcon: async () => {},
      toggle:  async () => {},
      open:    async () => {},
      close:   async () => {},
      isOpen:  async () => false
    };
  }
  else if (!browser.sidebarAction) {
    browser.sidebarAction = {
      setPanel: async () => {},
      setIcon:  async () => {},
      toggle:   async () => {},
      open:     async () => {},
      close:    async () => {},
      isOpen:   async () => false
    };
  }
}
