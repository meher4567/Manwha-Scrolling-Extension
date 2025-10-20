class SmartScroll {
  constructor() {
    this.animationId = null;
    this.isEnabled = false;
    this.lastScrollTime = 0;
    this.frameCount = 0;
    this.chapterEndHandled = false;
    this.bottomAtCount = 0;
    this.bottomAtThreshold = 3;
    this.debugMode = false;
    this.scrollStartTime = 0;
    this.initialScrollPosition = 0;
    this.countdownTimer = null;
    this.countdownNotification = null;
    this.countdownStarted = false;
    this.lastPageHeight = 0;
    this.pageHeightStableCount = 0;
    this.progressIndicator = null;
    this.speedOverlay = null;
    this.lastMouseX = 0;
    this.lastMouseY = 0;
    this.mouseMovements = [];
    this.lastMouseTime = 0;
    this.lastSpeedUpdateTime = 0;
    this.speedUpdateInterval = 3e3;
    this.textAnalysisCache = null;
    this.CACHE_TTL = 300;
    this.statsStartTime = 0;
    this.totalScrollDistance = 0;
    this.lastScrollPosition = 0;
    this.scrollContainer = this.findScrollContainer();
    this.settings = this.getDefaultSettings();
    this.scrollState = this.getDefaultScrollState();
    this.init();
  }
  getDefaultSettings() {
    return {
      enabled: true,
      scrollSpeed: 50,
      textDetection: true,
      autoAdjust: true,
      skipWhitespace: true,
      mode: "standard",
      sensitivity: 50,
      pauseOnHover: true,
      smoothness: 50,
      readingMode: "normal",
      autoPauseAtChapterEnd: true,
      autoAdvanceChapter: true,
      waitForImages: false,
      emergencyStopOnShake: true,
      learningModeEnabled: false
      // Deprecated - using look-ahead instead
    };
  }
  getSpeedMultiplierForMode() {
    switch (this.settings.readingMode) {
      case "focus":
        return 0.7;
      case "skim":
        return 1.5;
      case "binge":
        return 1.2;
      default:
        return 1;
    }
  }
  getDefaultScrollState() {
    return {
      isScrolling: false,
      currentSpeed: 0,
      targetSpeed: 50,
      position: window.scrollY,
      isPaused: false,
      mode: "standard"
    };
  }
  findScrollContainer() {
    const possibleContainers = [
      document.querySelector('[class*="reader"]'),
      document.querySelector('[class*="viewer"]'),
      document.querySelector('[class*="content"]'),
      document.querySelector("main"),
      document.body
    ];
    for (const container of possibleContainers) {
      if (container && container instanceof HTMLElement) {
        const style = window.getComputedStyle(container);
        if (style.overflowY === "scroll" || style.overflowY === "auto") {
          return container;
        }
      }
    }
    return document.documentElement;
  }
  async init() {
    try {
      await this.loadSettings();
      this.setupMessageListeners();
      this.setupObservers();
      this.setupEventListeners();
      this.createOverlay();
      this.updateBadge();
      await this.checkAutoStart();
      await this.checkFirstRun();
    } catch (error) {
      console.error("[SmartScroll] Initialization error:", error);
      this.settings = this.getDefaultSettings();
      this.isEnabled = true;
    }
  }
  async loadSettings() {
    try {
      const result = await browser.storage.sync.get(null);
      if (result) {
        this.settings = { ...this.settings, ...result };
        this.isEnabled = this.settings.enabled ?? true;
        this.debugMode = !!result.debugMode;
      }
    } catch (error) {
      console.error("[SmartScroll] Failed to load settings:", error);
      this.settings = this.getDefaultSettings();
    }
  }
  async checkAutoStart() {
    try {
      const result = await browser.storage.local.get("autoStartScroll");
      if (result.autoStartScroll) {
        await browser.storage.local.remove("autoStartScroll");
        setTimeout(() => {
          if (this.isEnabled) {
            this.startScrolling();
          }
        }, 2e3);
      }
    } catch (error) {
      console.error("[SmartScroll] Auto-start check failed:", error);
    }
  }
  setupMessageListeners() {
    browser.runtime.onMessage.addListener((message) => {
      switch (message.action) {
        case "toggleEnabled":
          this.toggleEnabled();
          break;
        case "updateSettings":
          this.updateSettings(message.settings);
          break;
        case "getState":
          return Promise.resolve(this.scrollState);
        case "getSpeedState":
          return Promise.resolve({
            baseSpeed: this.settings.scrollSpeed,
            currentSpeed: this.scrollState.targetSpeed
          });
        case "toggleScrolling":
          this.toggleScrolling();
          break;
      }
    });
  }
  setupObservers() {
    const observer = new MutationObserver((mutations) => {
      if (!mutations || mutations.length === 0)
        return;
      if (this.chapterEndHandled) {
        this.chapterEndHandled = false;
      }
      if (this.isEnabled && this.scrollState.isScrolling)
        ;
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: false,
      attributes: false
    });
  }
  setupEventListeners() {
    document.addEventListener("wheel", (e) => {
      if (!this.isEnabled)
        return;
      if (this.scrollState.isScrolling && e.ctrlKey) {
        e.preventDefault();
        const speedChange = e.deltaY > 0 ? -10 : 10;
        this.adjustSpeed(speedChange);
        this.showSpeedIndicator();
      }
    });
    document.addEventListener("keydown", (e) => {
      if (!this.isEnabled) {
        if (e.key === "?" || e.key.toLowerCase() === "h") {
          e.preventDefault();
          this.showHelpOverlay();
        }
        return;
      }
      if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        this.toggleScrolling();
        return;
      }
      if (e.key === "Escape") {
        const helpOverlay = document.getElementById("smart-scroll-help");
        if (helpOverlay) {
          helpOverlay.remove();
          return;
        }
        if (this.scrollState.isScrolling) {
          e.preventDefault();
          this.stopScrolling();
          this.showStatus("Scrolling stopped", "info");
        }
        return;
      }
      if (e.key === "?" || e.key.toLowerCase() === "h") {
        e.preventDefault();
        this.showHelpOverlay();
        return;
      }
      if (this.scrollState.isScrolling) {
        if (e.key === "[") {
          e.preventDefault();
          this.adjustSpeed(-10);
          this.showSpeedIndicator();
        } else if (e.key === "]") {
          e.preventDefault();
          this.adjustSpeed(10);
          this.showSpeedIndicator();
        } else if (e.key === "+" || e.key === "=") {
          this.adjustSpeed(10);
          this.showSpeedIndicator();
        } else if (e.key === "-" || e.key === "_") {
          this.adjustSpeed(-10);
          this.showSpeedIndicator();
        }
      }
      if (e.key.toLowerCase() === "f" && !e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        this.settings.scrollSpeed = Math.round(this.settings.scrollSpeed * 0.7);
        this.settings.scrollSpeed = Math.max(10, Math.min(600, this.settings.scrollSpeed));
        browser.storage.sync.set({ scrollSpeed: this.settings.scrollSpeed });
        this.showStatus(`🎯 Focus mode - Speed: ${this.settings.scrollSpeed}`, "info");
        if (this.scrollState.isScrolling) {
          this.scrollState.targetSpeed = this.settings.scrollSpeed;
          this.analyzeContent();
        }
        this.updateUI();
        this.sendSpeedUpdate();
      } else if (e.key.toLowerCase() === "s" && !e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        this.settings.scrollSpeed = Math.round(this.settings.scrollSpeed * 1.5);
        this.settings.scrollSpeed = Math.max(10, Math.min(600, this.settings.scrollSpeed));
        browser.storage.sync.set({ scrollSpeed: this.settings.scrollSpeed });
        this.showStatus(`⚡ Skim mode - Speed: ${this.settings.scrollSpeed}`, "info");
        if (this.scrollState.isScrolling) {
          this.scrollState.targetSpeed = this.settings.scrollSpeed;
          this.analyzeContent();
        }
        this.updateUI();
        this.sendSpeedUpdate();
      } else if (e.key.toLowerCase() === "b" && !e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        this.settings.scrollSpeed = Math.round(this.settings.scrollSpeed * 1.2);
        this.settings.scrollSpeed = Math.max(10, Math.min(600, this.settings.scrollSpeed));
        browser.storage.sync.set({ scrollSpeed: this.settings.scrollSpeed });
        this.showStatus(`📚 Binge mode - Speed: ${this.settings.scrollSpeed}`, "info");
        if (this.scrollState.isScrolling) {
          this.scrollState.targetSpeed = this.settings.scrollSpeed;
          this.analyzeContent();
        }
        this.updateUI();
        this.sendSpeedUpdate();
      } else if (e.key.toLowerCase() === "n" && !e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        this.settings.scrollSpeed = 150;
        browser.storage.sync.set({ scrollSpeed: this.settings.scrollSpeed });
        this.showStatus(`✨ Normal mode - Speed: ${this.settings.scrollSpeed}`, "info");
        if (this.scrollState.isScrolling) {
          this.scrollState.targetSpeed = this.settings.scrollSpeed;
          this.analyzeContent();
        }
        this.updateUI();
        this.sendSpeedUpdate();
      }
      if (this.scrollState.isScrolling) {
        if (e.key === "ArrowUp") {
          e.preventDefault();
          this.adjustSpeed(10);
          this.showSpeedIndicator();
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          this.adjustSpeed(-10);
          this.showSpeedIndicator();
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          this.navigateToNextChapter();
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          this.navigateToPreviousChapter();
        }
      }
    });
    document.addEventListener("mousemove", (e) => {
      if (!this.isEnabled)
        return;
      this.handleMouseMove(e);
    });
    document.addEventListener("mousemove", (e) => {
      if (!this.isEnabled)
        return;
      this.detectMouseShake(e);
    });
    let touchStartY = 0;
    document.addEventListener("touchstart", (e) => {
      if (!this.isEnabled)
        return;
      if (e.touches.length === 2) {
        touchStartY = e.touches[0].clientY;
      }
    });
    document.addEventListener("touchmove", (e) => {
      if (!this.isEnabled)
        return;
      if (e.touches.length === 2) {
        e.preventDefault();
        const deltaY = e.touches[0].clientY - touchStartY;
        this.adjustSpeed(deltaY * 0.1);
        touchStartY = e.touches[0].clientY;
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.scrollState.isScrolling) {
        this.pauseScrolling();
      }
    });
    document.addEventListener("keydown", async (e) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "d") {
        this.debugMode = !this.debugMode;
        await new Promise((resolve) => chrome.storage.sync.set({ debugMode: this.debugMode }, () => resolve()));
        this.showStatus(`Debug mode ${this.debugMode ? "ON" : "OFF"}`, "info");
      }
    });
  }
  async checkFirstRun() {
    try {
      const result = await browser.storage.local.get("firstRunComplete");
      if (!result.firstRunComplete) {
        setTimeout(() => this.showTutorial(), 2e3);
        await browser.storage.local.set({ firstRunComplete: true });
      }
    } catch (error) {
      console.error("[SmartScroll] First run check failed:", error);
    }
  }
  showTutorial() {
    const tutorial = document.createElement("div");
    tutorial.id = "smart-scroll-tutorial";
    tutorial.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px;
      border-radius: 16px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
      z-index: 9999999;
      max-width: 500px;
      text-align: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    tutorial.innerHTML = `
      <h1 style="margin: 0 0 20px 0; font-size: 32px;">🚀 Welcome to Smart Scroll!</h1>
      <p style="font-size: 16px; line-height: 1.6; margin: 0 0 24px 0; opacity: 0.95;">
        Intelligent auto-scrolling for manga & webtoons with predictive speed adjustment.
      </p>
      <div style="background: rgba(255,255,255,0.1); padding: 20px; border-radius: 8px; margin-bottom: 24px; text-align: left;">
        <div style="margin-bottom: 12px;">
          <strong>⏱️ Quick Start:</strong>
        </div>
        <div style="margin-left: 20px; opacity: 0.9;">
          • Press <kbd style="background: rgba(255,255,255,0.2); padding: 4px 8px; border-radius: 4px; font-family: monospace;">Space</kbd> to start scrolling<br>
          • Use <kbd style="background: rgba(255,255,255,0.2); padding: 4px 8px; border-radius: 4px; font-family: monospace;">↑↓</kbd> arrows to adjust speed<br>
          • Press <kbd style="background: rgba(255,255,255,0.2); padding: 4px 8px; border-radius: 4px; font-family: monospace;">?</kbd> or <kbd style="background: rgba(255,255,255,0.2); padding: 4px 8px; border-radius: 4px; font-family: monospace;">h</kbd> for all shortcuts<br>
          • Click extension icon for settings
        </div>
      </div>
      <div style="background: rgba(255,255,255,0.1); padding: 16px; border-radius: 8px; margin-bottom: 24px; font-size: 14px;">
        🎯 <strong>Pro Tip:</strong> Speed auto-adjusts based on text density. Set base speed high (300-400) and let Smart Scroll handle the rest!
      </div>
      <button onclick="this.parentElement.remove()" style="
        background: white;
        color: #667eea;
        border: none;
        padding: 12px 40px;
        border-radius: 8px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      ">Got it! Let's go ✨</button>
    `;
    document.body.appendChild(tutorial);
  }
  showHelpOverlay() {
    const existingHelp = document.getElementById("smart-scroll-help");
    if (existingHelp) {
      existingHelp.remove();
      return;
    }
    const help = document.createElement("div");
    help.id = "smart-scroll-help";
    help.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      color: #333;
      padding: 30px;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      z-index: 9999999;
      max-width: 600px;
      max-height: 80vh;
      overflow-y: auto;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    help.innerHTML = `
      <h2 style="margin: 0 0 20px 0; color: #4A90E2;">⌨️ Smart Scroll - Keyboard Shortcuts</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 2px solid #e5e7eb;">
            <th style="text-align: left; padding: 8px; font-weight: 600;">Key</th>
            <th style="text-align: left; padding: 8px; font-weight: 600;">Action</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 8px; font-family: monospace; background: #f9fafb;"><kbd style="background: #e5e7eb; padding: 2px 6px; border-radius: 3px;">Space</kbd></td>
            <td style="padding: 8px;">Start/Pause scrolling</td>
          </tr>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 8px; font-family: monospace; background: #f9fafb;"><kbd style="background: #e5e7eb; padding: 2px 6px; border-radius: 3px;">Escape</kbd></td>
            <td style="padding: 8px;">Stop scrolling</td>
          </tr>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 8px; font-family: monospace; background: #f9fafb;"><kbd style="background: #e5e7eb; padding: 2px 6px; border-radius: 3px;">↑</kbd> / <kbd style="background: #e5e7eb; padding: 2px 6px; border-radius: 3px;">↓</kbd></td>
            <td style="padding: 8px;">Adjust base speed (±10)</td>
          </tr>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 8px; font-family: monospace; background: #f9fafb;"><kbd style="background: #e5e7eb; padding: 2px 6px; border-radius: 3px;">→</kbd> / <kbd style="background: #e5e7eb; padding: 2px 6px; border-radius: 3px;">←</kbd></td>
            <td style="padding: 8px;">Next/Previous chapter</td>
          </tr>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 8px; font-family: monospace; background: #f9fafb;"><kbd style="background: #e5e7eb; padding: 2px 6px; border-radius: 3px;">[</kbd> / <kbd style="background: #e5e7eb; padding: 2px 6px; border-radius: 3px;">]</kbd></td>
            <td style="padding: 8px;">Fine speed control (±10)</td>
          </tr>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 8px; font-family: monospace; background: #f9fafb;"><kbd style="background: #e5e7eb; padding: 2px 6px; border-radius: 3px;">+</kbd> / <kbd style="background: #e5e7eb; padding: 2px 6px; border-radius: 3px;">-</kbd></td>
            <td style="padding: 8px;">Speed adjustment</td>
          </tr>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 8px; font-family: monospace; background: #f9fafb;"><kbd style="background: #e5e7eb; padding: 2px 6px; border-radius: 3px;">f</kbd></td>
            <td style="padding: 8px;">Focus mode (slower)</td>
          </tr>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 8px; font-family: monospace; background: #f9fafb;"><kbd style="background: #e5e7eb; padding: 2px 6px; border-radius: 3px;">s</kbd></td>
            <td style="padding: 8px;">Skim mode (faster)</td>
          </tr>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 8px; font-family: monospace; background: #f9fafb;"><kbd style="background: #e5e7eb; padding: 2px 6px; border-radius: 3px;">b</kbd></td>
            <td style="padding: 8px;">Binge mode (steady)</td>
          </tr>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 8px; font-family: monospace; background: #f9fafb;"><kbd style="background: #e5e7eb; padding: 2px 6px; border-radius: 3px;">n</kbd></td>
            <td style="padding: 8px;">Normal mode</td>
          </tr>
          <tr>
            <td style="padding: 8px; font-family: monospace; background: #f9fafb;"><kbd style="background: #e5e7eb; padding: 2px 6px; border-radius: 3px;">?</kbd> / <kbd style="background: #e5e7eb; padding: 2px 6px; border-radius: 3px;">h</kbd></td>
            <td style="padding: 8px;">Show this help</td>
          </tr>
        </tbody>
      </table>
      <div style="margin-top: 20px; text-align: center;">
        <button onclick="this.parentElement.parentElement.remove()" style="
          background: #4A90E2;
          color: white;
          border: none;
          padding: 10px 30px;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          font-weight: 600;
        ">Close</button>
        <p style="margin-top: 10px; font-size: 12px; color: #6b7280;">Press Escape to close</p>
      </div>
    `;
    document.body.appendChild(help);
  }
  showSpeedIndicator() {
    const existingIndicator = document.getElementById("smart-scroll-speed-indicator");
    if (existingIndicator)
      existingIndicator.remove();
    const indicator = document.createElement("div");
    indicator.id = "smart-scroll-speed-indicator";
    indicator.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 20px 40px;
    border-radius: 10px;
    font-size: 24px;
    z-index: 999999;
    pointer-events: none;
  `;
    indicator.innerHTML = `Speed: ${Math.round(this.settings.scrollSpeed)}`;
    document.body.appendChild(indicator);
    setTimeout(() => indicator.remove(), 1e3);
  }
  createOverlay() {
    const overlay = document.createElement("div");
    overlay.id = "smart-scroll-overlay";
    overlay.className = "smart-scroll-overlay";
    overlay.innerHTML = `
      <div class="smart-scroll-controls">
        <button id="smart-scroll-toggle" class="control-button">
          <span class="icon">▶</span>
        </button>
        <div class="speed-indicator">
          <span id="speed-value">50</span>
        </div>
      </div>
    `;
    if (!this.isEnabled) {
      overlay.style.display = "none";
    }
    document.body.appendChild(overlay);
    const toggleBtn = document.getElementById("smart-scroll-toggle");
    toggleBtn?.addEventListener("click", () => this.toggleScrolling());
  }
  toggleEnabled() {
    this.isEnabled = !this.isEnabled;
    this.settings.enabled = this.isEnabled;
    chrome.storage.sync.set({ enabled: this.isEnabled });
    if (!this.isEnabled && this.scrollState.isScrolling) {
      this.stopScrolling();
    }
    const overlay = document.getElementById("smart-scroll-overlay");
    if (overlay) {
      overlay.style.display = this.isEnabled ? "" : "none";
    }
    this.updateBadge();
    this.updateUI();
  }
  showStatus(message, type = "info") {
    const existingStatus = document.getElementById("smart-scroll-status");
    if (existingStatus)
      existingStatus.remove();
    const status = document.createElement("div");
    status.id = "smart-scroll-status";
    status.className = `smart-scroll-status ${type}`;
    status.textContent = message;
    status.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      background: ${type === "error" ? "#ef4444" : type === "warning" ? "#f59e0b" : "#3b82f6"};
      color: white;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 999999;
      pointer-events: none;
      animation: slideInFromRight 0.3s ease-out;
    `;
    if (!document.getElementById("smart-scroll-animations")) {
      const style = document.createElement("style");
      style.id = "smart-scroll-animations";
      style.textContent = `
        @keyframes slideInFromRight {
          from {
            opacity: 0;
            transform: translateX(100px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes slideOutToRight {
          from {
            opacity: 1;
            transform: translateX(0);
          }
          to {
            opacity: 0;
            transform: translateX(100px);
          }
        }
      `;
      document.head.appendChild(style);
    }
    document.body.appendChild(status);
    setTimeout(() => {
      status.style.animation = "slideOutToRight 0.3s ease-out";
      setTimeout(() => status.remove(), 300);
    }, 2700);
  }
  toggleScrolling() {
    if (!this.isEnabled)
      return;
    if (this.scrollState.isScrolling) {
      this.stopScrolling();
    } else {
      this.startScrolling();
    }
  }
  startScrolling() {
    if (this.scrollState.isScrolling)
      return;
    this.scrollState.isScrolling = true;
    this.scrollState.isPaused = false;
    this.scrollState.targetSpeed = this.settings.scrollSpeed;
    this.frameCount = 0;
    this.chapterEndHandled = false;
    this.countdownStarted = false;
    this.scrollStartTime = Date.now();
    this.initialScrollPosition = window.scrollY;
    this.statsStartTime = Date.now();
    this.lastScrollPosition = window.scrollY;
    this.showProgressIndicator();
    this.animate();
    this.updateUI();
  }
  stopScrolling() {
    this.scrollState.isScrolling = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    if (this.countdownNotification) {
      this.countdownNotification.remove();
      this.countdownNotification = null;
    }
    this.hideProgressIndicator();
    this.updateUI();
  }
  pauseScrolling() {
    this.scrollState.isPaused = true;
    this.scrollState.targetSpeed = 0;
  }
  resumeScrolling() {
    this.scrollState.isPaused = false;
    this.scrollState.targetSpeed = this.settings.scrollSpeed;
  }
  animate() {
    if (!this.scrollState.isScrolling)
      return;
    const now = performance.now();
    const deltaTime = now - this.lastScrollTime;
    this.lastScrollTime = now;
    const currentPageHeight = document.documentElement.scrollHeight;
    if (this.lastPageHeight !== currentPageHeight) {
      this.lastPageHeight = currentPageHeight;
      this.pageHeightStableCount = 0;
      this.scrollState.targetSpeed = this.settings.scrollSpeed * 0.3;
    } else {
      this.pageHeightStableCount++;
      if (this.pageHeightStableCount > 30) {
        this.scrollState.targetSpeed = this.settings.scrollSpeed;
      }
    }
    const speedDiff = this.scrollState.targetSpeed - this.scrollState.currentSpeed;
    const easingFactor = this.easeInOutCubic(0.15);
    this.scrollState.currentSpeed += speedDiff * easingFactor;
    const scrollAmount = this.scrollState.currentSpeed / 1e3 * deltaTime;
    window.scrollBy(0, scrollAmount);
    this.scrollState.position = window.scrollY;
    const currentPos = window.scrollY;
    this.totalScrollDistance += Math.abs(currentPos - this.lastScrollPosition);
    this.lastScrollPosition = currentPos;
    if (this.frameCount % 10 === 0) {
      this.updateProgressIndicator();
      this.updateUI();
    }
    if (this.isAtBottom()) {
      if (!this.chapterEndHandled) {
        this.stopScrolling();
        return;
      }
    }
    this.frameCount++;
    if (this.frameCount % 30 === 0) {
      this.checkForChapterEndWhileScrolling();
    }
    if (this.settings.autoAdjust && this.frameCount % 60 === 0) {
      this.analyzeContent();
    }
    this.animationId = requestAnimationFrame(() => this.animate());
  }
  isAtBottom() {
    const scrollHeight = document.documentElement.scrollHeight;
    const scrollTop = window.scrollY;
    const clientHeight = window.innerHeight;
    return scrollTop + clientHeight >= scrollHeight - 10;
  }
  getViewportTextDensity() {
    const viewportHeight = window.innerHeight;
    const samplePoints = 5;
    let totalWhitePixels = 0;
    for (let i = 0; i < samplePoints; i++) {
      const y = viewportHeight / samplePoints * i + 100;
      const element = document.elementFromPoint(window.innerWidth / 2, y);
      if (element && element.tagName === "IMG") {
        const rect = element.getBoundingClientRect();
        if (rect.width < window.innerWidth * 0.8) {
          totalWhitePixels += 1;
        }
      }
    }
    return totalWhitePixels / samplePoints;
  }
  easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  getZoomLevel() {
    const zoom = Math.round(window.outerWidth / window.innerWidth * 100) / 100 || 1;
    const pixelRatio = window.devicePixelRatio || 1;
    return Math.max(zoom, pixelRatio);
  }
  analyzeContent() {
    const viewportHeight = window.innerHeight;
    const viewportTop = window.scrollY;
    const viewportBottom = viewportTop + viewportHeight;
    const zoomLevel = this.getZoomLevel();
    const images = document.querySelectorAll("img");
    let textDensity = 0;
    let panelCount = 0;
    images.forEach((img, index) => {
      const rect = img.getBoundingClientRect();
      const imgTop = rect.top + window.scrollY;
      const imgBottom = imgTop + rect.height;
      if (imgBottom > viewportTop && imgTop < viewportBottom) {
        panelCount++;
        let panelTextDensity = 0;
        const normalizedHeight = rect.height / zoomLevel;
        if (normalizedHeight < 300) {
          panelTextDensity = 0.9;
        } else if (normalizedHeight < 600) {
          panelTextDensity = 0.7;
        } else {
          panelTextDensity = 0.3;
        }
        textDensity += panelTextDensity;
      }
    });
    if (panelCount > 0) {
      textDensity = textDensity / panelCount;
    }
    let hasLargeGap = false;
    const gapThreshold = 200 * zoomLevel;
    for (let i = 1; i < images.length; i++) {
      const prevRect = images[i - 1].getBoundingClientRect();
      const currRect = images[i].getBoundingClientRect();
      const gap = currRect.top - prevRect.bottom;
      if (gap > gapThreshold && currRect.top > viewportTop && prevRect.bottom < viewportBottom) {
        hasLargeGap = true;
        break;
      }
    }
    const analysis = {
      textDensity,
      whitespaceRatio: hasLargeGap ? 0.8 : 0.1,
      hasImages: true,
      panelBoundaries: [],
      contentType: textDensity > 0.6 ? "dialogue" : "action",
      averageTextSize: 16
    };
    this.adjustSpeedBasedOnContent(analysis);
  }
  adjustSpeedBasedOnContent(analysis) {
    if (!this.settings.autoAdjust) {
      return;
    }
    const baseSpeed = this.settings.scrollSpeed;
    const zoomLevel = this.getZoomLevel();
    const zoomAdjustedBase = baseSpeed * zoomLevel;
    let adjustedSpeed = zoomAdjustedBase;
    const viewportInfo = this.analyzeViewportAndNext();
    if (analysis.whitespaceRatio > 0.6) {
      adjustedSpeed = Math.min(600, zoomAdjustedBase * 3.5);
    } else if (viewportInfo.textInViewport) {
      const wordCount = viewportInfo.wordCount;
      let speedMultiplier;
      if (wordCount >= 30) {
        speedMultiplier = 0.12;
      } else if (wordCount >= 25) {
        speedMultiplier = 0.15;
      } else if (wordCount >= 20) {
        speedMultiplier = 0.2;
      } else if (wordCount >= 15) {
        speedMultiplier = 0.25;
      } else if (wordCount >= 10) {
        speedMultiplier = 0.32;
      } else if (wordCount >= 5) {
        speedMultiplier = 0.42;
      } else if (wordCount >= 3) {
        speedMultiplier = 0.55;
      } else {
        speedMultiplier = 0.65;
      }
      adjustedSpeed = zoomAdjustedBase * speedMultiplier;
      adjustedSpeed = Math.max(35, Math.min(350, adjustedSpeed));
    } else if (viewportInfo.nextTextDistance > 0 && viewportInfo.nextTextDistance < 500) {
      const distance = viewportInfo.nextTextDistance;
      if (distance < 80) {
        adjustedSpeed = zoomAdjustedBase * 0.5;
      } else if (distance < 150) {
        const ratio = (distance - 80) / 70;
        adjustedSpeed = zoomAdjustedBase * (0.5 + ratio * 0.4);
      } else if (distance < 250) {
        const ratio = (distance - 150) / 100;
        adjustedSpeed = zoomAdjustedBase * (0.9 + ratio * 0.7);
      } else {
        const ratio = (distance - 250) / 250;
        adjustedSpeed = zoomAdjustedBase * (1.6 + ratio * 1.2);
      }
      adjustedSpeed = Math.min(600, adjustedSpeed);
    } else if (viewportInfo.nextTextDistance >= 500) {
      const distance = viewportInfo.nextTextDistance;
      if (distance > 1e3) {
        adjustedSpeed = Math.min(600, zoomAdjustedBase * 5);
      } else if (distance > 700) {
        adjustedSpeed = Math.min(600, zoomAdjustedBase * 4.2);
      } else {
        adjustedSpeed = Math.min(600, zoomAdjustedBase * 3.5);
      }
    } else {
      adjustedSpeed = Math.min(600, zoomAdjustedBase * 4.5);
    }
    const modeMultiplier = this.getSpeedMultiplierForMode();
    adjustedSpeed = adjustedSpeed * modeMultiplier;
    this.scrollState.targetSpeed = adjustedSpeed;
    this.sendSpeedUpdate();
  }
  adjustSpeed(delta) {
    this.settings.scrollSpeed = Math.max(10, Math.min(600, this.settings.scrollSpeed + delta));
    this.scrollState.targetSpeed = this.settings.scrollSpeed;
    browser.storage.sync.set({ scrollSpeed: this.settings.scrollSpeed });
    this.updateUI();
    this.sendSpeedUpdate();
  }
  async saveReadingStats() {
    if (this.statsStartTime === 0)
      return;
    const sessionDuration = Date.now() - this.statsStartTime;
    const distanceScrolled = this.totalScrollDistance;
    try {
      const result = await browser.storage.local.get("readingStats");
      const stats = result.readingStats || {
        totalTimeMs: 0,
        totalDistance: 0,
        chaptersCompleted: 0,
        sessionsCount: 0
      };
      stats.totalTimeMs += sessionDuration;
      stats.totalDistance += distanceScrolled;
      stats.sessionsCount += 1;
      if (this.chapterEndHandled) {
        stats.chaptersCompleted += 1;
      }
      await browser.storage.local.set({ readingStats: stats });
      const minutes = Math.floor(sessionDuration / 6e4);
      const seconds = Math.floor(sessionDuration % 6e4 / 1e3);
      const distance = Math.round(distanceScrolled);
      if (minutes > 0 || seconds > 10) {
        this.showStatus(
          `📊 Session: ${minutes}m ${seconds}s | ${distance}px scrolled`,
          "info"
        );
      }
    } catch (error) {
      console.error("[SmartScroll] Failed to save stats:", error);
    }
    this.statsStartTime = 0;
    this.totalScrollDistance = 0;
  }
  sendSpeedUpdate() {
    const now = Date.now();
    if (now - this.lastSpeedUpdateTime < this.speedUpdateInterval) {
      return;
    }
    this.lastSpeedUpdateTime = now;
    browser.runtime.sendMessage({
      action: "speedUpdate",
      baseSpeed: this.settings.scrollSpeed,
      currentSpeed: this.scrollState.targetSpeed
    }).catch(() => {
    });
  }
  detectMouseShake(e) {
    if (!this.scrollState.isScrolling || !this.settings.emergencyStopOnShake)
      return;
    const now = Date.now();
    const timeDiff = now - this.lastMouseTime;
    if (timeDiff > 50) {
      const deltaX = Math.abs(e.clientX - this.lastMouseX);
      const deltaY = Math.abs(e.clientY - this.lastMouseY);
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      this.mouseMovements.push(distance);
      if (this.mouseMovements.length > 10) {
        this.mouseMovements.shift();
      }
      if (this.mouseMovements.length >= 5) {
        const avgMovement = this.mouseMovements.reduce((a, b) => a + b, 0) / this.mouseMovements.length;
        if (avgMovement > 100) {
          console.log("🚨 Emergency stop - Mouse shake detected");
          this.stopScrolling();
          this.showStatus("🚨 Emergency Stop!", "warning");
          this.mouseMovements = [];
        }
      }
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.lastMouseTime = now;
    }
  }
  handleMouseMove(e) {
    if (!this.scrollState.isScrolling || !this.settings.pauseOnHover)
      return;
    const rect = document.elementFromPoint(e.clientX, e.clientY)?.getBoundingClientRect();
    if (rect) {
      if (this.scrollState.targetSpeed > 0) {
        this.pauseScrolling();
      }
      clearTimeout(window.scrollResumeTimeout);
      window.scrollResumeTimeout = setTimeout(() => {
        if (this.scrollState.isScrolling && this.scrollState.isPaused) {
          this.resumeScrolling();
        }
      }, 1e3);
    }
  }
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    browser.storage.sync.set(this.settings);
  }
  updateBadge() {
    browser.runtime.sendMessage({
      action: "updateBadge",
      enabled: this.isEnabled
    });
  }
  checkForChapterEndWhileScrolling() {
    if (this.chapterEndHandled) {
      return;
    }
    const waitTime = this.settings.waitForImages ? 15e3 : 8e3;
    const elapsedTime = Date.now() - this.scrollStartTime;
    if (elapsedTime < waitTime) {
      return;
    }
    const scrollPercent = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight) * 100;
    if (scrollPercent < 90) {
      return;
    }
    if (this.countdownStarted) {
      return;
    }
    if (scrollPercent >= 99.5) {
      console.log("🛡️ Reached 100% - triggering notification (no comments found)");
      this.countdownStarted = true;
      this.stopScrolling();
      this.startCountdownToNextChapter();
      return;
    }
    const commentElement = this.findAnyCommentSection();
    if (commentElement) {
      const rect = commentElement.getBoundingClientRect();
      const commentTopPosition = rect.top + window.scrollY;
      const currentScrollPosition = window.scrollY;
      if (currentScrollPosition >= commentTopPosition) {
        console.log("✅ Reached comment section - triggering notification");
        this.countdownStarted = true;
        this.stopScrolling();
        this.startCountdownToNextChapter();
        return;
      }
    }
  }
  checkForEndImages() {
    const images = document.querySelectorAll("img");
    const endPatterns = [
      "end",
      "chapter",
      "fin",
      "complete",
      "continued",
      "next",
      "prev",
      "credit",
      "translator",
      "scan",
      "comment",
      "discord",
      "patreon",
      "donate"
    ];
    console.log(`🖼️ [END IMAGES] Checking ${images.length} images...`);
    const currentScrollY = window.scrollY;
    const viewportHeight = window.innerHeight;
    for (let img of images) {
      const rect = img.getBoundingClientRect();
      const absoluteTop = rect.top + currentScrollY;
      if (absoluteTop > currentScrollY && rect.top < viewportHeight + 500) {
        const src = img.src?.toLowerCase() || "";
        const alt = img.alt?.toLowerCase() || "";
        if (endPatterns.some((pattern) => src.includes(pattern) || alt.includes(pattern))) {
          console.log("✅ [END IMAGES] Pattern found at Y=" + Math.round(absoluteTop) + ":", src || alt);
          return true;
        }
      }
    }
    console.log("❌ [END IMAGES] No patterns found");
    return false;
  }
  checkForNavigationElements() {
    const navPatterns = [
      "prev",
      "previous",
      "next",
      "chapter",
      "이전",
      "다음",
      // Korean
      "前",
      "次",
      // Japanese/Chinese
      "anterior",
      "siguiente",
      // Spanish
      "précédent",
      "suivant"
      // French
    ];
    const elements = document.querySelectorAll("a, button, div[onclick], span[onclick]");
    let navCount = 0;
    const foundNav = [];
    console.log(`🔗 [NAVIGATION] Checking ${elements.length} clickable elements...`);
    const currentScrollY = window.scrollY;
    const viewportHeight = window.innerHeight;
    for (let el of elements) {
      const text = el.textContent?.toLowerCase() || "";
      const rect = el.getBoundingClientRect();
      const absoluteTop = rect.top + currentScrollY;
      if (absoluteTop > currentScrollY && rect.top < viewportHeight + 500) {
        if (navPatterns.some((pattern) => text.includes(pattern))) {
          navCount++;
          foundNav.push(text.trim().substring(0, 30));
        }
      }
    }
    if (navCount >= 2) {
      console.log(`✅ [NAVIGATION] Found ${navCount} elements at Y > ${Math.round(currentScrollY)}:`, foundNav.slice(0, 5));
      return true;
    }
    console.log(`❌ [NAVIGATION] Only ${navCount} elements found`);
    return false;
  }
  findAnyCommentSection() {
    const commentPatterns = [
      "comment",
      "comments",
      "commenting",
      // English singular/plural
      "disqus",
      "discuss",
      "discussion",
      "discussions",
      "reply",
      "replies",
      "response",
      "responses",
      "feedback",
      "review",
      "reviews",
      "댓글",
      // Korean
      "コメント",
      // Japanese
      "评论",
      // Chinese
      "comentario",
      "comentarios",
      "comentários"
      // Spanish/Portuguese
    ];
    const elements = document.querySelectorAll("div, section, iframe");
    for (let el of elements) {
      const id = el.id?.toLowerCase() || "";
      const className = el.className?.toLowerCase() || "";
      if (commentPatterns.some((pattern) => id.includes(pattern) || className.includes(pattern))) {
        return el;
      }
    }
    const disqus = document.querySelector('#disqus_thread, iframe[src*="disqus"]');
    if (disqus) {
      return disqus;
    }
    return null;
  }
  findCommentSection() {
    const commentPatterns = [
      "comment",
      "disqus",
      "discuss",
      "reply",
      "댓글",
      // Korean
      "コメント",
      // Japanese
      "评论",
      // Chinese
      "comentario"
      // Spanish/Portuguese
    ];
    console.log("💬 [COMMENTS] Checking for comment section...");
    const currentScrollY = window.scrollY;
    const viewportHeight = window.innerHeight;
    const elements = document.querySelectorAll("div, section, iframe");
    for (let el of elements) {
      const id = el.id?.toLowerCase() || "";
      const className = el.className?.toLowerCase() || "";
      const rect = el.getBoundingClientRect();
      const absoluteTop = rect.top + currentScrollY;
      if (absoluteTop > currentScrollY && rect.top < viewportHeight + 1e3) {
        if (commentPatterns.some((pattern) => id.includes(pattern) || className.includes(pattern))) {
          console.log("✅ [COMMENTS] Found at Y=" + Math.round(absoluteTop) + ":", id || className);
          return el;
        }
      }
    }
    const disqus = document.querySelector('#disqus_thread, iframe[src*="disqus"]');
    if (disqus) {
      const rect = disqus.getBoundingClientRect();
      const absoluteTop = rect.top + currentScrollY;
      if (absoluteTop > currentScrollY && rect.top < viewportHeight + 1e3) {
        console.log("✅ [COMMENTS] Disqus at Y=" + Math.round(absoluteTop));
        return disqus;
      }
    }
    console.log("❌ [COMMENTS] No comment section found");
    return null;
  }
  findCommentSectionAbove() {
    const commentPatterns = [
      "comment",
      "disqus",
      "discuss",
      "reply",
      "댓글",
      // Korean
      "コメント",
      // Japanese
      "评论",
      // Chinese
      "comentario"
      // Spanish/Portuguese
    ];
    console.log("🔺 [COMMENTS ABOVE] Checking above current position...");
    const currentScrollY = window.scrollY;
    const elements = document.querySelectorAll("div, section, iframe");
    for (let el of elements) {
      const id = el.id?.toLowerCase() || "";
      const className = el.className?.toLowerCase() || "";
      const rect = el.getBoundingClientRect();
      const absoluteTop = rect.top + currentScrollY;
      if (absoluteTop < currentScrollY && absoluteTop > currentScrollY - 2e3) {
        if (commentPatterns.some((pattern) => id.includes(pattern) || className.includes(pattern))) {
          console.log("✅ [COMMENTS ABOVE] Found at Y=" + Math.round(absoluteTop) + ":", id || className);
          return el;
        }
      }
    }
    const disqus = document.querySelector('#disqus_thread, iframe[src*="disqus"]');
    if (disqus) {
      const rect = disqus.getBoundingClientRect();
      const absoluteTop = rect.top + currentScrollY;
      if (absoluteTop < currentScrollY && absoluteTop > currentScrollY - 2e3) {
        console.log("✅ [COMMENTS ABOVE] Disqus at Y=" + Math.round(absoluteTop));
        return disqus;
      }
    }
    console.log("❌ [COMMENTS ABOVE] Not found");
    return null;
  }
  checkForCommentSection() {
    return this.findCommentSection() !== null;
  }
  checkForRelatedSeries() {
    const relatedPatterns = [
      "related",
      "recommend",
      "similar",
      "more series",
      "other work",
      "you may like",
      "check out",
      "관련",
      "추천",
      // Korean
      "関連",
      "おすすめ",
      // Japanese
      "相关",
      "推荐"
      // Chinese
    ];
    console.log("📚 [RELATED SERIES] Checking...");
    const currentScrollY = window.scrollY;
    const viewportHeight = window.innerHeight;
    const headings = document.querySelectorAll("h1, h2, h3, h4, div");
    for (let el of headings) {
      const text = el.textContent?.toLowerCase() || "";
      const rect = el.getBoundingClientRect();
      const absoluteTop = rect.top + currentScrollY;
      if (absoluteTop > currentScrollY && rect.top < viewportHeight + 500) {
        if (relatedPatterns.some((pattern) => text.includes(pattern))) {
          console.log("✅ [RELATED SERIES] Found at Y=" + Math.round(absoluteTop) + ":", text.trim().substring(0, 50));
          return true;
        }
      }
    }
    console.log("❌ [RELATED SERIES] Not found");
    return false;
  }
  findNextNavElement() {
    const selectors = [
      'a[rel="next"]',
      "a.next-chapter",
      "a.next",
      "button.next",
      'a[aria-label*="next"]',
      'a[title*="next"]'
    ];
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el) {
          const href = el.href || "";
          if (!href.includes("facebook") && !href.includes("twitter") && !href.includes("discord")) {
            console.log("✅ Next chapter found via selector:", sel);
            return el;
          }
        }
      } catch (e) {
      }
    }
    const anchors = Array.from(document.querySelectorAll("a, button"));
    const blockedDomains = ["facebook.com", "twitter.com", "discord.com", "patreon.com", "t.me"];
    const blockedWords = ["share", "tweet", "like"];
    const prevWords = ["prev", "previous", "back", "이전", "上", "前", "anterior", "précédent"];
    for (const a of anchors) {
      const text = (a.textContent || "").toLowerCase().trim();
      const href = (a.href || "").toLowerCase();
      if (blockedDomains.some((d) => href.includes(d)))
        continue;
      if (blockedWords.some((w) => text.includes(w)))
        continue;
      if (prevWords.some((w) => text.includes(w)))
        continue;
      if (text.includes("next chapter") || text.includes("nextchapter")) {
        console.log('✅ Next chapter found (Priority 1): "next chapter" text');
        return a;
      }
    }
    for (const a of anchors) {
      const text = (a.textContent || "").toLowerCase().trim();
      const href = (a.href || "").toLowerCase();
      if (blockedDomains.some((d) => href.includes(d)))
        continue;
      if (blockedWords.some((w) => text.includes(w)))
        continue;
      if (prevWords.some((w) => text.includes(w)))
        continue;
      if ((text === "next" || text === "다음" || text === "次" || text.includes("next")) && (href.includes("chapter") || href.includes("episode") || href.includes("ch-") || href.match(/\/\d+\//) || href.includes("/next"))) {
        console.log("✅ Next chapter found (Priority 2): next + chapter URL");
        return a;
      }
    }
    for (const a of anchors) {
      const text = (a.textContent || "").toLowerCase().trim();
      const href = (a.href || "").toLowerCase();
      if (blockedDomains.some((d) => href.includes(d)))
        continue;
      if (blockedWords.some((w) => text.includes(w)))
        continue;
      if (prevWords.some((w) => text.includes(w)))
        continue;
      if (text === "next" || text === "다음" || text === "次" || text === "siguiente" || text === "seguinte") {
        console.log("✅ Next chapter found (Priority 3): generic next");
        return a;
      }
    }
    console.log("❌ ERROR: No next chapter link found on page");
    return null;
  }
  findPrevNavElement() {
    const selectors = [
      'a[rel="prev"]',
      "a.prev",
      "a.previous",
      'a[aria-label*="prev"]',
      'a[aria-label*="previous"]',
      'a[title*="prev"]',
      'a[title*="previous"]',
      "button.prev",
      "button.previous"
    ];
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el)
          return el;
      } catch (e) {
      }
    }
    const anchors = Array.from(document.querySelectorAll("a, button"));
    const prevWords = ["prev", "previous", "back", "이전", "上", "前", "anterior", "précédent"];
    const nextWords = ["next", "다음", "次"];
    for (const a of anchors) {
      const text = (a.textContent || "").toLowerCase().trim();
      const href = a.href || "";
      if (nextWords.some((w) => text.includes(w) || href.includes(w)))
        continue;
      if (prevWords.some((w) => text.includes(w) || href.toLowerCase().includes(w)))
        return a;
    }
    return null;
  }
  startCountdownToNextChapter() {
    if (this.countdownTimer) {
      return;
    }
    const nextChapterExists = this.findNextNavElement() !== null;
    let secondsLeft = 5;
    this.showCountdownNotification(secondsLeft, nextChapterExists);
    this.countdownTimer = window.setInterval(() => {
      secondsLeft--;
      if (secondsLeft <= 0) {
        this.cancelCountdown();
        if (nextChapterExists && this.settings.autoAdvanceChapter) {
          this.handleChapterEnd();
        } else if (nextChapterExists && !this.settings.autoAdvanceChapter) {
          console.log("⏸️ Auto-advance disabled - stopping at chapter end");
          this.stopScrolling();
          this.showStatus("Chapter complete - Auto-advance disabled", "info");
        } else {
          console.log("🏁 This is the last chapter");
          this.stopScrolling();
          this.showStatus("🏁 Last chapter - Happy reading!", "info");
        }
      } else {
        this.updateCountdownNotification(secondsLeft);
      }
    }, 1e3);
  }
  showCountdownNotification(seconds, hasNextChapter) {
    if (this.countdownNotification) {
      this.countdownNotification.remove();
    }
    const notification = document.createElement("div");
    notification.id = "smart-scroll-countdown";
    notification.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.9);
    color: white;
    padding: 30px 40px;
    border-radius: 15px;
    font-size: 18px;
    z-index: 999999;
    text-align: center;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
  `;
    let message;
    if (!hasNextChapter) {
      message = `🏁 Last Chapter Completed`;
    } else if (this.settings.autoAdvanceChapter) {
      message = `Going to next chapter in <span id="countdown-seconds">${seconds}</span>s`;
    } else {
      message = `Chapter Completed`;
    }
    notification.innerHTML = `
    <div style="margin-bottom: 20px; font-size: 24px; font-weight: bold;">
      ${message}
    </div>
    <button id="countdown-cancel" style="
      padding: 10px 30px;
      font-size: 16px;
      background: #ef4444;
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: bold;
    ">Cancel</button>
  `;
    document.body.appendChild(notification);
    this.countdownNotification = notification;
    const cancelBtn = document.getElementById("countdown-cancel");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => this.cancelCountdown());
    }
  }
  updateCountdownNotification(seconds) {
    const secondsSpan = document.getElementById("countdown-seconds");
    if (secondsSpan) {
      secondsSpan.textContent = seconds.toString();
    }
  }
  cancelCountdown() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    if (this.countdownNotification) {
      this.countdownNotification.remove();
      this.countdownNotification = null;
    }
    if (!this.chapterEndHandled) {
      this.stopScrolling();
      this.showResumeButton();
    }
  }
  showResumeButton() {
    const resumeBtn = document.createElement("div");
    resumeBtn.id = "smart-scroll-resume";
    resumeBtn.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #10b981;
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 16px;
    font-weight: bold;
    cursor: pointer;
    z-index: 999999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    transition: transform 0.2s;
  `;
    resumeBtn.textContent = "▶ Resume Scrolling";
    resumeBtn.addEventListener("mouseenter", () => {
      resumeBtn.style.transform = "scale(1.05)";
    });
    resumeBtn.addEventListener("mouseleave", () => {
      resumeBtn.style.transform = "scale(1)";
    });
    resumeBtn.addEventListener("click", () => {
      resumeBtn.remove();
      this.startScrolling();
    });
    document.body.appendChild(resumeBtn);
    setTimeout(() => {
      if (resumeBtn.parentElement) {
        resumeBtn.remove();
      }
    }, 1e4);
  }
  handleChapterEnd() {
    if (this.chapterEndHandled) {
      return;
    }
    this.chapterEndHandled = true;
    const next = this.findNextNavElement();
    if (next) {
      browser.storage.local.set({ autoStartScroll: true });
      if (next.tagName === "A" && next.href) {
        window.location.href = next.href;
        return;
      } else {
        try {
          next.click();
          return;
        } catch (e) {
          console.log("❌ ERROR: Failed to navigate to next chapter");
        }
      }
    }
    console.log("🏁 This is the last chapter");
    this.stopScrolling();
    this.showStatus("🏁 Last chapter - Happy reading!", "info");
  }
  navigateToNextChapter() {
    this.showStatus("Navigating to next chapter...", "info");
    const next = this.findNextNavElement();
    if (next) {
      if (next.tagName === "A" && next.href) {
        window.location.href = next.href;
      } else {
        try {
          next.click();
        } catch (e) {
          this.showStatus("Could not navigate to next chapter", "error");
        }
      }
    } else {
      this.showStatus("No next chapter found", "warning");
    }
  }
  navigateToPreviousChapter() {
    this.showStatus("Navigating to previous chapter...", "info");
    const prev = this.findPrevNavElement();
    if (prev) {
      if (prev.tagName === "A" && prev.href) {
        window.location.href = prev.href;
      } else {
        try {
          prev.click();
        } catch (e) {
          this.showStatus("Could not navigate to previous chapter", "error");
        }
      }
    } else {
      this.showStatus("No previous chapter found", "warning");
    }
  }
  showChapterEndNotification() {
  }
  showProgressIndicator() {
    if (this.progressIndicator)
      return;
    if (!this.isEnabled)
      return;
    const indicator = document.createElement("div");
    indicator.id = "smart-scroll-progress";
    indicator.style.cssText = `
      position: fixed;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.7);
      color: white;
      padding: 8px 20px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: bold;
      z-index: 999998;
      pointer-events: none;
    `;
    indicator.textContent = "0%";
    document.body.appendChild(indicator);
    this.progressIndicator = indicator;
  }
  updateProgressIndicator() {
    if (!this.progressIndicator)
      return;
    const commentSection = this.findAnyCommentSection();
    let chapterEndY = document.documentElement.scrollHeight;
    if (commentSection) {
      const rect = commentSection.getBoundingClientRect();
      chapterEndY = rect.top + window.scrollY;
    }
    const currentScrollY = window.scrollY;
    const scrollableChapterHeight = chapterEndY - window.innerHeight;
    const scrollPercent = Math.min(100, Math.max(0, currentScrollY / scrollableChapterHeight * 100));
    this.progressIndicator.textContent = `${Math.round(scrollPercent)}%`;
  }
  hideProgressIndicator() {
    if (this.progressIndicator) {
      this.progressIndicator.remove();
      this.progressIndicator = null;
    }
  }
  updateUI() {
    const overlay = document.getElementById("smart-scroll-overlay");
    const toggleBtn = document.getElementById("smart-scroll-toggle");
    const speedValue = document.getElementById("speed-value");
    if (overlay) {
      overlay.style.display = this.isEnabled ? "" : "none";
      overlay.classList.toggle("enabled", this.isEnabled);
      overlay.classList.toggle("scrolling", this.scrollState.isScrolling);
    }
    if (toggleBtn) {
      const icon = toggleBtn.querySelector(".icon");
      if (icon) {
        icon.textContent = this.scrollState.isScrolling ? "⏸" : "▶";
      }
    }
    if (speedValue) {
      const baseSpeed = this.settings.scrollSpeed;
      const currentSpeed = Math.round(this.scrollState.targetSpeed);
      const diff = currentSpeed - baseSpeed;
      if (diff !== 0) {
        const sign = diff > 0 ? "+" : "";
        speedValue.textContent = `${baseSpeed} (${sign}${diff})`;
      } else {
        speedValue.textContent = baseSpeed.toString();
      }
    }
    this.sendSpeedUpdate();
  }
  // ========== SMART VIEWPORT & NEXT-TEXTBOX ANALYSIS ==========
  analyzeViewportAndNext() {
    const now = Date.now();
    if (this.textAnalysisCache && now - this.textAnalysisCache.timestamp < this.CACHE_TTL) {
      return this.textAnalysisCache.result;
    }
    try {
      const viewportTop = window.scrollY;
      const viewportBottom = viewportTop + window.innerHeight;
      const centerX = window.innerWidth / 2;
      let textInViewport = false;
      let textAmount = 0;
      let totalWords = 0;
      let largestTextBox = 0;
      const seenElements = /* @__PURE__ */ new Set();
      for (let i = 0; i < 15; i++) {
        const checkY = viewportTop + window.innerHeight / 15 * i;
        const screenY = checkY - viewportTop;
        if (screenY >= 0 && screenY <= window.innerHeight) {
          const xPositions = [centerX * 0.3, centerX, centerX * 1.7];
          for (const xPos of xPositions) {
            const elements = document.elementsFromPoint(xPos, screenY);
            elements.forEach((el) => {
              if (seenElements.has(el))
                return;
              seenElements.add(el);
              const textData = this.analyzeTextElement(el, viewportTop, viewportBottom);
              if (textData.hasText) {
                textInViewport = true;
                textAmount += textData.textLength;
                totalWords += textData.wordCount;
                if (textData.height > largestTextBox) {
                  largestTextBox = textData.height;
                }
              }
            });
          }
        }
      }
      let nextTextDistance = 9999;
      const lookAheadMax = 1e3;
      const checkDistances = [
        ...Array.from({ length: 10 }, (_, i) => 50 + i * 50),
        // 50-500px: every 50px
        ...Array.from({ length: 5 }, (_, i) => 550 + i * 100)
        // 550-1000px: every 100px
      ];
      for (const distance of checkDistances) {
        const checkY = viewportBottom + distance;
        const xPositions = [centerX * 0.5, centerX, centerX * 1.5];
        for (const xPos of xPositions) {
          const elements = document.elementsFromPoint(xPos, checkY % window.innerHeight);
          for (const el of elements) {
            const textData = this.analyzeTextElement(el, checkY, checkY + 200);
            if (textData.hasText && textData.wordCount >= 3) {
              nextTextDistance = distance;
              break;
            }
          }
          if (nextTextDistance < 9999)
            break;
        }
        if (nextTextDistance < 9999)
          break;
      }
      const result = {
        textInViewport,
        textAmount,
        wordCount: totalWords,
        textBoxHeight: largestTextBox,
        nextTextDistance: nextTextDistance < 9999 ? nextTextDistance : 0
      };
      this.textAnalysisCache = {
        timestamp: Date.now(),
        result
      };
      return result;
    } catch (error) {
      console.error("[SmartScroll] Text analysis error:", error);
      return {
        textInViewport: false,
        textAmount: 0,
        wordCount: 0,
        textBoxHeight: 0,
        nextTextDistance: 0
      };
    }
  }
  analyzeTextElement(element, rangeTop, rangeBottom) {
    try {
      const tag = element.tagName.toLowerCase();
      const className = element.className?.toString().toLowerCase() || "";
      const id = element.id?.toLowerCase() || "";
      if (["img", "video", "canvas", "svg", "script", "style", "noscript"].includes(tag)) {
        return { hasText: false, textLength: 0, wordCount: 0, height: 0 };
      }
      const rect = element.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) {
        return { hasText: false, textLength: 0, wordCount: 0, height: 0 };
      }
      const text = element.textContent?.trim() || "";
      const textKeywords = ["text", "dialogue", "speech", "bubble", "caption", "subtitle", "paragraph", "content", "comment", "message"];
      const hasTextKeyword = textKeywords.some(
        (keyword) => className.includes(keyword) || id.includes(keyword)
      );
      const hasTextContent = text.length > 20;
      const textTags = ["p", "span", "div", "label", "a", "strong", "em", "b", "i"];
      const hasTextChildren = textTags.some((t) => element.querySelector(t) !== null);
      const score = (hasTextKeyword ? 1 : 0) + (hasTextContent ? 1 : 0) + (hasTextChildren ? 1 : 0);
      if (score < 2) {
        return { hasText: false, textLength: 0, wordCount: 0, height: 0 };
      }
      const elementTop = rect.top + window.scrollY;
      const elementBottom = elementTop + rect.height;
      if (elementBottom < rangeTop || elementTop > rangeBottom) {
        return { hasText: false, textLength: 0, wordCount: 0, height: 0 };
      }
      const words = text.split(/\s+/).filter((w) => w.length > 0);
      return {
        hasText: true,
        textLength: text.length,
        wordCount: words.length,
        height: rect.height
      };
    } catch (error) {
      return { hasText: false, textLength: 0, wordCount: 0, height: 0 };
    }
  }
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => new SmartScroll());
} else {
  new SmartScroll();
}
