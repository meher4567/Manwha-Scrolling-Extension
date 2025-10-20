// Import polyfill for cross-browser compatibility
// @ts-ignore - importScripts is available in service worker context
importScripts('browser-polyfill.js');

// @ts-ignore - browser is defined by polyfill
declare const browser: typeof import('webextension-polyfill').default;

console.log('Smart Scroll Extension - Service Worker Started');

// Extension installation or update
browser.runtime.onInstalled.addListener((details: any) => {
  console.log('Extension installed:', details);
  
  // Set default settings on first install
  if (details.reason === 'install') {
    browser.storage.sync.set({
      enabled: true,
      scrollSpeed: 50,
      textDetection: true,
      autoAdjust: true,
      skipWhitespace: true,
      mode: 'standard'
    });
  }
});

// Handle messages from content scripts
browser.runtime.onMessage.addListener((request: any, sender: any) => {
  console.log('Message received:', request);
  
  switch (request.action) {
    case 'getSettings':
      return browser.storage.sync.get(null);
      
    case 'updateBadge':
      browser.action.setBadgeText({
        text: request.enabled ? 'ON' : 'OFF',
        tabId: sender.tab?.id
      });
      browser.action.setBadgeBackgroundColor({
        color: request.enabled ? '#22C55E' : '#EF4444'
      });
      break;
      
    case 'logEvent':
      console.log('Event from content:', request.data);
      break;
  }
});

// Handle extension icon click
browser.action.onClicked.addListener((tab: any) => {
  browser.tabs.sendMessage(tab.id!, { action: 'toggleEnabled' });
});
