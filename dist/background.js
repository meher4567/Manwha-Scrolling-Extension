importScripts("browser-polyfill.js");
console.log("Smart Scroll Extension - Service Worker Started");
browser.runtime.onInstalled.addListener((details) => {
  console.log("Extension installed:", details);
  if (details.reason === "install") {
    browser.storage.sync.set({
      enabled: true,
      scrollSpeed: 50,
      textDetection: true,
      autoAdjust: true,
      skipWhitespace: true,
      mode: "standard"
    });
  }
});
browser.runtime.onMessage.addListener((request, sender) => {
  console.log("Message received:", request);
  switch (request.action) {
    case "getSettings":
      return browser.storage.sync.get(null);
    case "updateBadge":
      browser.action.setBadgeText({
        text: request.enabled ? "ON" : "OFF",
        tabId: sender.tab?.id
      });
      browser.action.setBadgeBackgroundColor({
        color: request.enabled ? "#22C55E" : "#EF4444"
      });
      break;
    case "logEvent":
      console.log("Event from content:", request.data);
      break;
  }
});
browser.action.onClicked.addListener((tab) => {
  browser.tabs.sendMessage(tab.id, { action: "toggleEnabled" });
});
