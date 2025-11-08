// Optimized MV3 background bootstrap using unified agent core
// This replaces the heavy bundled background.iife.js (1.8MB → ~10KB)
// Excludes DOM/Puppeteer utilities unusable in service worker context

import { bootstrapAgent } from "./agent_unified/bootstrap.js";

// Bootstrap unified agent on load
let agentReady = false;
let agentContext;

(async () => {
  try {
    agentContext = await bootstrapAgent();
    agentReady = true;
    console.log("[background] Unified agent ready");
  } catch (error) {
    console.error("[background] Failed to bootstrap agent:", error);
  }
})();

// Extension action click handler
if (typeof chrome !== "undefined" && chrome.action) {
  chrome.action.onClicked.addListener(async () => {
    console.log("[action-click] Extension icon clicked");
    
    // Open side panel if available
    try {
      if (chrome.sidePanel && typeof chrome.sidePanel.open === "function") {
        const win = await chrome.windows.getCurrent();
        await chrome.sidePanel.open({ windowId: win.id });
        console.log("[action-click] Side panel opened");
      } else {
        // Fallback: open in new tab
        const url = chrome.runtime.getURL("side-panel/index.html");
        await chrome.tabs.create({ url });
        console.log("[action-click] Opened in new tab");
      }
    } catch (error) {
      console.error("[action-click] Failed to open UI:", error);
    }
    
    // Seed initialization goal if agent is idle
    if (agentReady && agentContext) {
      try {
        const snapshot = agentContext.state.getSnapshot();
        if (!snapshot.currentGoal && snapshot.goalQueue.length === 0) {
          await agentContext.state.enqueueGoal({
            title: "Assistant initialization",
            prompt: "Initialize assistant environment and render UI.",
            channel: "action-click",
          });
          console.log("[action-click] Seeded initialization goal");
        }
      } catch (error) {
        console.error("[action-click] Failed to seed goal:", error);
      }
    }
  });
}

// Install handler
chrome.runtime.onInstalled.addListener((details) => {
  console.log("[install] Extension installed/updated", { reason: details.reason });
  
  if (details.reason === "install") {
    // First install
    chrome.tabs.create({ url: chrome.runtime.getURL("options/index.html") });
  }
});

// Keep service worker alive
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Ping handler to keep worker active
  if (message.type === "ping") {
    sendResponse({ ok: true, timestamp: Date.now() });
    return true;
  }
  
  // Other messages are handled by unified agent
  return false;
});

console.log("[background] Optimized background script loaded");
