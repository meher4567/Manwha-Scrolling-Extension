// browser polyfill is loaded via content_scripts in manifest
// @ts-ignore - browser is defined globally by polyfill
declare const browser: typeof import('webextension-polyfill').default;

import { SmartScrollSettings, ScrollState, ContentAnalysis } from '../types';
  
class SmartScroll {
  private settings: SmartScrollSettings;
  private scrollState: ScrollState;
  private animationId: number | null = null;
  private isEnabled: boolean = false;
  private lastScrollTime: number = 0;
  private scrollContainer: HTMLElement;
  private frameCount: number = 0;
  private chapterEndHandled: boolean = false;
  private bottomAtCount: number = 0;
  private bottomAtThreshold: number = 3;
  private debugMode: boolean = false;
  private scrollStartTime: number = 0;
  private initialScrollPosition: number = 0;
  private countdownTimer: number | null = null;
  private countdownNotification: HTMLElement | null = null;
  private countdownStarted: boolean = false;
  private lastPageHeight: number = 0;
  private pageHeightStableCount: number = 0;
  private progressIndicator: HTMLElement | null = null;
  private speedOverlay: HTMLElement | null = null;
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;
  private mouseMovements: number[] = [];
  private lastMouseTime: number = 0;
  private lastSpeedUpdateTime: number = 0;
  private speedUpdateInterval: number = 3000; // 3 seconds
  private textAnalysisCache: { timestamp: number; result: any } | null = null;
  private CACHE_TTL: number = 300; // 300ms cache
  private statsStartTime: number = 0;
  private totalScrollDistance: number = 0;
  private lastScrollPosition: number = 0;

  constructor() {
    this.scrollContainer = this.findScrollContainer();
    this.settings = this.getDefaultSettings();
    this.scrollState = this.getDefaultScrollState();
    this.init();
  }

  private getDefaultSettings(): SmartScrollSettings {
    return {
      enabled: true,
      scrollSpeed: 50,
      textDetection: true,
      autoAdjust: true,
      skipWhitespace: true,
      mode: 'standard',
      sensitivity: 50,
      pauseOnHover: true,
      smoothness: 50,
      readingMode: 'normal',
      autoPauseAtChapterEnd: true,
      autoAdvanceChapter: true,
      waitForImages: false,
      emergencyStopOnShake: true,
      learningModeEnabled: false  // Deprecated - using look-ahead instead
    };
  }

  private getSpeedMultiplierForMode(): number {
  switch (this.settings.readingMode) {
    case 'focus':
      return 0.7; // 30% slower overall
    case 'skim':
      return 1.5; // 50% faster overall
    case 'binge':
      return 1.2; // 20% faster, less variation
    default:
      return 1.0;
  }
}

  private getDefaultScrollState(): ScrollState {
    return {
      isScrolling: false,
      currentSpeed: 0,
      targetSpeed: 50,
      position: window.scrollY,
      isPaused: false,
      mode: 'standard'
    };
  }

  private findScrollContainer(): HTMLElement {
    // Try to find the main scrollable container
    // Some sites use body, others use a specific div
    const possibleContainers = [
      document.querySelector('[class*="reader"]'),
      document.querySelector('[class*="viewer"]'),
      document.querySelector('[class*="content"]'),
      document.querySelector('main'),
      document.body
    ];

    for (const container of possibleContainers) {
      if (container && container instanceof HTMLElement) {
        const style = window.getComputedStyle(container);
        if (style.overflowY === 'scroll' || style.overflowY === 'auto') {
          return container;
        }
      }
    }

    return document.documentElement;
  }

  private async init() {
    try {
      // Load settings from storage
      await this.loadSettings();

      // Set up message listeners
      this.setupMessageListeners();

      // Set up DOM observers
      this.setupObservers();

      // Set up event listeners
      this.setupEventListeners();

      // Initialize UI overlay
      this.createOverlay();

      // Update badge
      this.updateBadge();

      // Check if we should auto-start scrolling (from previous chapter navigation)
      await this.checkAutoStart();
      
      // Check if first run
      await this.checkFirstRun();
    } catch (error) {
      console.error('[SmartScroll] Initialization error:', error);
      // Fallback to default settings
      this.settings = this.getDefaultSettings();
      this.isEnabled = true;
    }
  }

  private async loadSettings() {
    try {
      const result = await browser.storage.sync.get(null);
      if (result) {
        this.settings = { ...this.settings, ...result };
        this.isEnabled = this.settings.enabled ?? true;
        this.debugMode = !!result.debugMode;
      }
    } catch (error) {
      console.error('[SmartScroll] Failed to load settings:', error);
      // Use default settings on error
      this.settings = this.getDefaultSettings();
    }
  }

  private async checkAutoStart() {
    try {
      const result = await browser.storage.local.get('autoStartScroll');
      if (result.autoStartScroll) {
        await browser.storage.local.remove('autoStartScroll');
        setTimeout(() => {
          if (this.isEnabled) {
            this.startScrolling();
          }
        }, 2000);
      }
    } catch (error) {
      console.error('[SmartScroll] Auto-start check failed:', error);
      // Continue without auto-start
    }
  }

  private setupMessageListeners() {
    browser.runtime.onMessage.addListener((message: any) => {
      switch (message.action) {
        case 'toggleEnabled':
          this.toggleEnabled();
          break;
        case 'updateSettings':
          this.updateSettings(message.settings);
          break;
        case 'getState':
          return Promise.resolve(this.scrollState);
        case 'getSpeedState':
          return Promise.resolve({
            baseSpeed: this.settings.scrollSpeed,
            currentSpeed: this.scrollState.targetSpeed
          });
        case 'toggleScrolling':
          this.toggleScrolling();
          break;
      }
    });
  }

  private setupObservers() {
    // Observe DOM changes for dynamic content loading
    const observer = new MutationObserver((mutations) => {
      if (!mutations || mutations.length === 0) return;

      // If we've recently handled a chapter end, a DOM change usually means new content loaded -> allow future detections
      if (this.chapterEndHandled) {
        this.chapterEndHandled = false;
      }

      // Light content check on DOM changes while scrolling
      if (this.isEnabled && this.scrollState.isScrolling) {
        // Optionally trigger a quick analysis
        // this.analyzeContent();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: false,
      attributes: false
    });
  }

  private setupEventListeners() {
   // Mouse wheel speed control
document.addEventListener('wheel', (e) => {
  if (!this.isEnabled) return; // Disabled
  if (this.scrollState.isScrolling && e.ctrlKey) {
    e.preventDefault();
    const speedChange = e.deltaY > 0 ? -10 : 10;
    this.adjustSpeed(speedChange);
    this.showSpeedIndicator();
  }
});

// Keyboard speed control and shortcuts
document.addEventListener('keydown', (e) => {
  // If Smart Scroll is disabled, ignore all shortcuts except help
  if (!this.isEnabled) {
    // Only allow help overlay when disabled
    if (e.key === '?' || e.key.toLowerCase() === 'h') {
      e.preventDefault();
      this.showHelpOverlay();
    }
    return;
  }
  
  // Space bar - pause/resume (works whether scrolling or not)
  if (e.key === ' ' || e.key === 'Spacebar') {
    e.preventDefault();
    this.toggleScrolling();
    return;
  }
  
  // Escape - stop scrolling completely OR close help
  if (e.key === 'Escape') {
    const helpOverlay = document.getElementById('smart-scroll-help');
    if (helpOverlay) {
      helpOverlay.remove();
      return;
    }
    if (this.scrollState.isScrolling) {
      e.preventDefault();
      this.stopScrolling();
      this.showStatus('Scrolling stopped', 'info');
    }
    return;
  }
  
  // Help overlay - ? or h
  if (e.key === '?' || e.key.toLowerCase() === 'h') {
    e.preventDefault();
    this.showHelpOverlay();
    return;
  }
  
  if (this.scrollState.isScrolling) {
    // [ and ] for speed control
    if (e.key === '[') {
      e.preventDefault();
      this.adjustSpeed(-10);
      this.showSpeedIndicator();
    } else if (e.key === ']') {
      e.preventDefault();
      this.adjustSpeed(10);
      this.showSpeedIndicator();
    } else if (e.key === '+' || e.key === '=') {
      this.adjustSpeed(10);
      this.showSpeedIndicator();
    } else if (e.key === '-' || e.key === '_') {
      this.adjustSpeed(-10);
      this.showSpeedIndicator();
    }
  }
  
  // Reading mode shortcuts - directly adjust base speed
  if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.shiftKey) {
    e.preventDefault();
    // Focus mode: reduce base speed by 30%
    this.settings.scrollSpeed = Math.round(this.settings.scrollSpeed * 0.7);
    this.settings.scrollSpeed = Math.max(10, Math.min(600, this.settings.scrollSpeed));
    browser.storage.sync.set({ scrollSpeed: this.settings.scrollSpeed });
    this.showStatus(`🎯 Focus mode - Speed: ${this.settings.scrollSpeed}`, 'info');
    if (this.scrollState.isScrolling) {
      this.scrollState.targetSpeed = this.settings.scrollSpeed;
      this.analyzeContent();
    }
    this.updateUI();
    this.sendSpeedUpdate();
  } else if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.shiftKey) {
    e.preventDefault();
    // Skim mode: increase base speed by 50%
    this.settings.scrollSpeed = Math.round(this.settings.scrollSpeed * 1.5);
    this.settings.scrollSpeed = Math.max(10, Math.min(600, this.settings.scrollSpeed));
    browser.storage.sync.set({ scrollSpeed: this.settings.scrollSpeed });
    this.showStatus(`⚡ Skim mode - Speed: ${this.settings.scrollSpeed}`, 'info');
    if (this.scrollState.isScrolling) {
      this.scrollState.targetSpeed = this.settings.scrollSpeed;
      this.analyzeContent();
    }
    this.updateUI();
    this.sendSpeedUpdate();
  } else if (e.key.toLowerCase() === 'b' && !e.ctrlKey && !e.shiftKey) {
    e.preventDefault();
    // Binge mode: increase base speed by 20%
    this.settings.scrollSpeed = Math.round(this.settings.scrollSpeed * 1.2);
    this.settings.scrollSpeed = Math.max(10, Math.min(600, this.settings.scrollSpeed));
    browser.storage.sync.set({ scrollSpeed: this.settings.scrollSpeed });
    this.showStatus(`📚 Binge mode - Speed: ${this.settings.scrollSpeed}`, 'info');
    if (this.scrollState.isScrolling) {
      this.scrollState.targetSpeed = this.settings.scrollSpeed;
      this.analyzeContent();
    }
    this.updateUI();
    this.sendSpeedUpdate();
  } else if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.shiftKey) {
    e.preventDefault();
    // Normal mode: reset to default middle speed
    this.settings.scrollSpeed = 150;
    browser.storage.sync.set({ scrollSpeed: this.settings.scrollSpeed });
    this.showStatus(`✨ Normal mode - Speed: ${this.settings.scrollSpeed}`, 'info');
    if (this.scrollState.isScrolling) {
      this.scrollState.targetSpeed = this.settings.scrollSpeed;
      this.analyzeContent();
    }
    this.updateUI();
    this.sendSpeedUpdate();
  }
  
  if (this.scrollState.isScrolling) {
    if (e.key === 'ArrowUp') {
      // Increase speed - for ML learning
      e.preventDefault();
      this.adjustSpeed(10);
      this.showSpeedIndicator();
    } else if (e.key === 'ArrowDown') {
      // Decrease speed - for ML learning
      e.preventDefault();
      this.adjustSpeed(-10);
      this.showSpeedIndicator();
    } else if (e.key === 'ArrowRight') {
      // Navigate to next chapter
      e.preventDefault();
      this.navigateToNextChapter();
    } else if (e.key === 'ArrowLeft') {
      // Navigate to previous chapter
      e.preventDefault();
      this.navigateToPreviousChapter();
    }
  }
});

    // Mouse events (only when enabled)
    document.addEventListener('mousemove', (e) => {
      if (!this.isEnabled) return;
      this.handleMouseMove(e);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.isEnabled) return;
      this.detectMouseShake(e);
    });

    // Touch events for mobile
    let touchStartY = 0;
    document.addEventListener('touchstart', (e) => {
      if (!this.isEnabled) return;
      if (e.touches.length === 2) {
        touchStartY = e.touches[0].clientY;
      }
    });

    document.addEventListener('touchmove', (e) => {
      if (!this.isEnabled) return;
      if (e.touches.length === 2) {
        e.preventDefault();
        const deltaY = e.touches[0].clientY - touchStartY;
        this.adjustSpeed(deltaY * 0.1);
        touchStartY = e.touches[0].clientY;
      }
    });

    // Visibility change
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.scrollState.isScrolling) {
        this.pauseScrolling();
      }
    });

    // Debug toggle: Ctrl+Shift+D to toggle debugMode
    document.addEventListener('keydown', async (e) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        this.debugMode = !this.debugMode;
        await new Promise<void>(resolve => chrome.storage.sync.set({ debugMode: this.debugMode }, () => resolve()));
        this.showStatus(`Debug mode ${this.debugMode ? 'ON' : 'OFF'}`, 'info');
      }
    });
  }

  private async checkFirstRun() {
    try {
      const result = await browser.storage.local.get('firstRunComplete');
      if (!result.firstRunComplete) {
        // Show tutorial after a short delay
        setTimeout(() => this.showTutorial(), 2000);
        await browser.storage.local.set({ firstRunComplete: true });
      }
    } catch (error) {
      console.error('[SmartScroll] First run check failed:', error);
    }
  }
  
  private showTutorial() {
    const tutorial = document.createElement('div');
    tutorial.id = 'smart-scroll-tutorial';
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
  
  private showHelpOverlay() {
    // Remove existing help if present
    const existingHelp = document.getElementById('smart-scroll-help');
    if (existingHelp) {
      existingHelp.remove();
      return;
    }
    
    const help = document.createElement('div');
    help.id = 'smart-scroll-help';
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
  
  private showSpeedIndicator() {
  // Remove existing indicator
  const existingIndicator = document.getElementById('smart-scroll-speed-indicator');
  if (existingIndicator) existingIndicator.remove();

  // Create speed indicator
  const indicator = document.createElement('div');
  indicator.id = 'smart-scroll-speed-indicator';
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

  // Auto remove after 1 second
  setTimeout(() => indicator.remove(), 1000);
}

  private createOverlay() {
    // Create a floating control overlay
    const overlay = document.createElement('div');
    overlay.id = 'smart-scroll-overlay';
    overlay.className = 'smart-scroll-overlay';
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

    // Hide overlay by default if not enabled
    if (!this.isEnabled) {
      overlay.style.display = 'none';
    }

    document.body.appendChild(overlay);

    // Add event listeners to controls
    const toggleBtn = document.getElementById('smart-scroll-toggle');
    toggleBtn?.addEventListener('click', () => this.toggleScrolling());
  }

  private toggleEnabled() {
    this.isEnabled = !this.isEnabled;
    this.settings.enabled = this.isEnabled;
    chrome.storage.sync.set({ enabled: this.isEnabled });
    
    if (!this.isEnabled && this.scrollState.isScrolling) {
      this.stopScrolling();
    }
    
    // Show/hide overlay based on enabled state
    const overlay = document.getElementById('smart-scroll-overlay');
    if (overlay) {
      overlay.style.display = this.isEnabled ? '' : 'none';
    }
    
    this.updateBadge();
    this.updateUI();
  }

  private showStatus(message: string, type: 'info' | 'error' | 'warning' = 'info') {
    // Remove existing status
    const existingStatus = document.getElementById('smart-scroll-status');
    if (existingStatus) existingStatus.remove();

    // Create status element
    const status = document.createElement('div');
    status.id = 'smart-scroll-status';
    status.className = `smart-scroll-status ${type}`;
    status.textContent = message;
    status.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      background: ${type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#3b82f6'};
      color: white;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 999999;
      pointer-events: none;
      animation: slideInFromRight 0.3s ease-out;
    `;
    
    // Add animation keyframes
    if (!document.getElementById('smart-scroll-animations')) {
      const style = document.createElement('style');
      style.id = 'smart-scroll-animations';
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

    // Fade out and remove after 3 seconds
    setTimeout(() => {
      status.style.animation = 'slideOutToRight 0.3s ease-out';
      setTimeout(() => status.remove(), 300);
    }, 2700);
  }

  private toggleScrolling() {
    if (!this.isEnabled) return;

    if (this.scrollState.isScrolling) {
      this.stopScrolling();
    } else {
      this.startScrolling();
    }
  }

  private startScrolling() {
    if (this.scrollState.isScrolling) return;

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

  private stopScrolling() {
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
    
    // Stats removed
    
    this.hideProgressIndicator();
    this.updateUI();
  }

  private pauseScrolling() {
    this.scrollState.isPaused = true;
    this.scrollState.targetSpeed = 0;
  }

  private resumeScrolling() {
    this.scrollState.isPaused = false;
    this.scrollState.targetSpeed = this.settings.scrollSpeed;
  }

  private animate() {
  if (!this.scrollState.isScrolling) return;

  const now = performance.now();
  const deltaTime = now - this.lastScrollTime;
  this.lastScrollTime = now;

  // Check if page height is changing (images loading)
  const currentPageHeight = document.documentElement.scrollHeight;
  if (this.lastPageHeight !== currentPageHeight) {
    // Page height changed - images are loading
    this.lastPageHeight = currentPageHeight;
    this.pageHeightStableCount = 0;
    // Slow down scrolling temporarily
    this.scrollState.targetSpeed = this.settings.scrollSpeed * 0.3;
  } else {
    // Page height stable
    this.pageHeightStableCount++;
    // After 30 frames (~0.5s) of stability, resume normal speed
    if (this.pageHeightStableCount > 30) {
      this.scrollState.targetSpeed = this.settings.scrollSpeed;
    }
  }

  // Smooth speed transitions with easing
  const speedDiff = this.scrollState.targetSpeed - this.scrollState.currentSpeed;
  const easingFactor = this.easeInOutCubic(0.15);
  this.scrollState.currentSpeed += speedDiff * easingFactor;

  // Calculate scroll amount
  const scrollAmount = (this.scrollState.currentSpeed / 1000) * deltaTime;

  // Perform the scroll
  window.scrollBy(0, scrollAmount);
  this.scrollState.position = window.scrollY;
  
  // Track stats
  const currentPos = window.scrollY;
  this.totalScrollDistance += Math.abs(currentPos - this.lastScrollPosition);
  this.lastScrollPosition = currentPos;
  
  // Update progress indicator and speed UI
  if (this.frameCount % 10 === 0) {
    this.updateProgressIndicator();
    this.updateUI(); // Update speed display with +/- indicator
  }
  

  // Check if we've reached the bottom
  if (this.isAtBottom()) {
    // We're at the bottom — stop scrolling
    if (!this.chapterEndHandled) {
      this.stopScrolling();
      return;
    }
  }

  // Check for chapter end every 30 frames (about 0.5 seconds at 60fps)
  this.frameCount++;
  if (this.frameCount % 30 === 0) {
    this.checkForChapterEndWhileScrolling();
  }
  
  // Simple content analysis for speed adjustment every 60 frames
  if (this.settings.autoAdjust && this.frameCount % 60 === 0) {
    this.analyzeContent();
  }

  // Continue animation
  this.animationId = requestAnimationFrame(() => this.animate());
}

  private isAtBottom(): boolean {
    const scrollHeight = document.documentElement.scrollHeight;
    const scrollTop = window.scrollY;
    const clientHeight = window.innerHeight;
    return scrollTop + clientHeight >= scrollHeight - 10;
  }

  private getViewportTextDensity(): number {
  // This method uses a sliding window approach
  const viewportHeight = window.innerHeight;
  const samplePoints = 5; // Check 5 points in viewport
  let totalWhitePixels = 0;
  let totalPixels = 0;
  
  // Sample at different heights in viewport
  for (let i = 0; i < samplePoints; i++) {
    const y = (viewportHeight / samplePoints) * i + 100;
    const element = document.elementFromPoint(window.innerWidth / 2, y);
    
    if (element && element.tagName === 'IMG') {
      // Simple check: smaller images usually have more text
      const rect = element.getBoundingClientRect();
      if (rect.width < window.innerWidth * 0.8) {
        totalWhitePixels += 1; // Likely has text bubbles
      }
    }
  }
  
  return totalWhitePixels / samplePoints;
}

  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  private getZoomLevel(): number {
  // Multiple methods to detect zoom level
  const zoom = Math.round((window.outerWidth / window.innerWidth) * 100) / 100 || 1;
  
  // Alternative method using devicePixelRatio
  const pixelRatio = window.devicePixelRatio || 1;
  
  // Use the more reliable value
  return Math.max(zoom, pixelRatio);
}

private analyzeContent() {
  // Get viewport dimensions and zoom level
  const viewportHeight = window.innerHeight;
  const viewportTop = window.scrollY;
  const viewportBottom = viewportTop + viewportHeight;
  const zoomLevel = this.getZoomLevel();
  
  // Find all images in viewport (manhwa panels)
  const images = document.querySelectorAll('img');
  let textDensity = 0;
  let panelCount = 0;
  
  images.forEach((img, index) => {
    const rect = img.getBoundingClientRect();
    const imgTop = rect.top + window.scrollY;
    const imgBottom = imgTop + rect.height;
    
    // Check if image is in viewport
    if (imgBottom > viewportTop && imgTop < viewportBottom) {
      panelCount++;
      let panelTextDensity = 0;
      
      // Normalize height for zoom level
      const normalizedHeight = rect.height / zoomLevel;
      
      // Use normalized height for detection
      if (normalizedHeight < 300) {
        panelTextDensity = 0.9; // Small panel = lots of text
      } else if (normalizedHeight < 600) {
        panelTextDensity = 0.7; // Dialogue panel
      } else {
        panelTextDensity = 0.3; // Large panel = action scene
      }
      
      textDensity += panelTextDensity;
    }
  });
  
  // Normalize text density
  if (panelCount > 0) {
    textDensity = textDensity / panelCount;
  }
  
  // Check for chapter breaks (adjust threshold for zoom)
  let hasLargeGap = false;
  let gapSize = 0;
  const gapThreshold = 200 * zoomLevel;
  
  for (let i = 1; i < images.length; i++) {
    const prevRect = images[i-1].getBoundingClientRect();
    const currRect = images[i].getBoundingClientRect();
    const gap = currRect.top - prevRect.bottom;
    
    if (gap > gapThreshold && currRect.top > viewportTop && prevRect.bottom < viewportBottom) {
      hasLargeGap = true;
      gapSize = gap;
      break;
    }
  }
  
  const analysis: ContentAnalysis = {
    textDensity: textDensity,
    whitespaceRatio: hasLargeGap ? 0.8 : 0.1,
    hasImages: true,
    panelBoundaries: [],
    contentType: textDensity > 0.6 ? 'dialogue' : 'action',
    averageTextSize: 16
  };
  
  this.adjustSpeedBasedOnContent(analysis);
}


private adjustSpeedBasedOnContent(analysis: ContentAnalysis) {
  if (!this.settings.autoAdjust) {
    return;
  }

  const baseSpeed = this.settings.scrollSpeed;
  const zoomLevel = this.getZoomLevel();
  const zoomAdjustedBase = baseSpeed * zoomLevel;
  
  let adjustedSpeed = zoomAdjustedBase;
  let reason = '';

  // SMART PER-TEXTBOX APPROACH: Analyze viewport and next text
  const viewportInfo = this.analyzeViewportAndNext();
  
  // Priority 1: Chapter breaks - always max speed
  if (analysis.whitespaceRatio > 0.6) {
    adjustedSpeed = Math.min(600, zoomAdjustedBase * 3.5);
    reason = '⏩ Chapter break';
  }
  // Priority 2: READING TEXT NOW - tiered by word count with smoother scaling
  else if (viewportInfo.textInViewport) {
    const wordCount = viewportInfo.wordCount;
    let speedMultiplier: number;
    
    // REFINED WORD COUNT TIERS - smoother progression
    if (wordCount >= 30) {
      speedMultiplier = 0.12;
    } else if (wordCount >= 25) {
      speedMultiplier = 0.15;
    } else if (wordCount >= 20) {
      speedMultiplier = 0.20;
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
  }
  // Priority 3: APPROACHING NEXT TEXT - refined deceleration curve
  else if (viewportInfo.nextTextDistance > 0 && viewportInfo.nextTextDistance < 500) {
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
  }
  // Priority 4: FAR FROM NEXT TEXT - accelerate with distance scaling
  else if (viewportInfo.nextTextDistance >= 500) {
    const distance = viewportInfo.nextTextDistance;
    
    if (distance > 1000) {
      adjustedSpeed = Math.min(600, zoomAdjustedBase * 5.0);
    } else if (distance > 700) {
      adjustedSpeed = Math.min(600, zoomAdjustedBase * 4.2);
    } else {
      adjustedSpeed = Math.min(600, zoomAdjustedBase * 3.5);
    }
  }
  // Priority 5: No text detected - cruise at high speed
  else {
    adjustedSpeed = Math.min(600, zoomAdjustedBase * 4.5);
  }

  // Apply reading mode multiplier
  const modeMultiplier = this.getSpeedMultiplierForMode();
  adjustedSpeed = adjustedSpeed * modeMultiplier;

  // Smooth transition to new speed
  this.scrollState.targetSpeed = adjustedSpeed;
  
  // Send speed update to popup for UI display
  this.sendSpeedUpdate();
}

  private adjustSpeed(delta: number) {
    // Adjust BASE speed, not current speed
    this.settings.scrollSpeed = Math.max(10, Math.min(600, this.settings.scrollSpeed + delta));
    // Reset target speed to new base (dynamic adjustment will recalculate)
    this.scrollState.targetSpeed = this.settings.scrollSpeed;
    browser.storage.sync.set({ scrollSpeed: this.settings.scrollSpeed });
    this.updateUI();
    this.sendSpeedUpdate();
  }
  
  private async saveReadingStats() {
    if (this.statsStartTime === 0) return;
    
    const sessionDuration = Date.now() - this.statsStartTime;
    const distanceScrolled = this.totalScrollDistance;
    
    try {
      const result = await browser.storage.local.get('readingStats');
      const stats = result.readingStats || {
        totalTimeMs: 0,
        totalDistance: 0,
        chaptersCompleted: 0,
        sessionsCount: 0
      };
      
      stats.totalTimeMs += sessionDuration;
      stats.totalDistance += distanceScrolled;
      stats.sessionsCount += 1;
      
      // Check if reached end for chapter count
      if (this.chapterEndHandled) {
        stats.chaptersCompleted += 1;
      }
      
      await browser.storage.local.set({ readingStats: stats });
      
      // Show summary
      const minutes = Math.floor(sessionDuration / 60000);
      const seconds = Math.floor((sessionDuration % 60000) / 1000);
      const distance = Math.round(distanceScrolled);
      
      if (minutes > 0 || seconds > 10) {
        this.showStatus(
          `📊 Session: ${minutes}m ${seconds}s | ${distance}px scrolled`,
          'info'
        );
      }
    } catch (error) {
      console.error('[SmartScroll] Failed to save stats:', error);
    }
    
    // Reset for next session
    this.statsStartTime = 0;
    this.totalScrollDistance = 0;
  }
  
  private sendSpeedUpdate() {
    // Throttle updates to every 3 seconds
    const now = Date.now();
    if (now - this.lastSpeedUpdateTime < this.speedUpdateInterval) {
      return; // Skip update
    }
    
    this.lastSpeedUpdateTime = now;
    browser.runtime.sendMessage({
      action: 'speedUpdate',
      baseSpeed: this.settings.scrollSpeed,
      currentSpeed: this.scrollState.targetSpeed
    }).catch(() => {});
  }

  private detectMouseShake(e: MouseEvent) {
    if (!this.scrollState.isScrolling || !this.settings.emergencyStopOnShake) return;
    
    const now = Date.now();
    const timeDiff = now - this.lastMouseTime;
    
    if (timeDiff > 50) { // Only check every 50ms
      const deltaX = Math.abs(e.clientX - this.lastMouseX);
      const deltaY = Math.abs(e.clientY - this.lastMouseY);
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      
      // Track recent movements
      this.mouseMovements.push(distance);
      if (this.mouseMovements.length > 10) {
        this.mouseMovements.shift();
      }
      
      // Detect shake: multiple large movements in short time
      if (this.mouseMovements.length >= 5) {
        const avgMovement = this.mouseMovements.reduce((a, b) => a + b, 0) / this.mouseMovements.length;
        
        // If average movement is very high (vigorous shaking)
        if (avgMovement > 100) {
          console.log('🚨 Emergency stop - Mouse shake detected');
          this.stopScrolling();
          this.showStatus('🚨 Emergency Stop!', 'warning');
          this.mouseMovements = []; // Reset
        }
      }
      
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.lastMouseTime = now;
    }
  }

  private handleMouseMove(e: MouseEvent) {
    if (!this.scrollState.isScrolling || !this.settings.pauseOnHover) return;

    const rect = document.elementFromPoint(e.clientX, e.clientY)?.getBoundingClientRect();
    if (rect) {
      // Pause if hovering over content
      if (this.scrollState.targetSpeed > 0) {
        this.pauseScrolling();
      }
      
      // Resume after delay
      clearTimeout((window as any).scrollResumeTimeout);
      (window as any).scrollResumeTimeout = setTimeout(() => {
        if (this.scrollState.isScrolling && this.scrollState.isPaused) {
          this.resumeScrolling();
        }
      }, 1000);
    }
  }

    private updateSettings(newSettings: Partial<SmartScrollSettings>) {
    this.settings = { ...this.settings, ...newSettings };
    browser.storage.sync.set(this.settings as any);
  }

  private updateBadge() {
    browser.runtime.sendMessage({
      action: 'updateBadge',
      enabled: this.isEnabled
    });
  }



private checkForChapterEndWhileScrolling() {
  // Don't check if already handled
  if (this.chapterEndHandled) {
    return;
  }
  
  // Wait for images to load (8s default, 15s if waitForImages enabled)
  const waitTime = this.settings.waitForImages ? 15000 : 8000;
  const elapsedTime = Date.now() - this.scrollStartTime;
  if (elapsedTime < waitTime) {
    return;
  }
  
  // Calculate scroll percentage
  const scrollPercent = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
  
  // Only start checking after 90% (to catch comments early)
  if (scrollPercent < 90) {
    return;
  }
  
  // Don't check again if countdown already started
  if (this.countdownStarted) {
    return;
  }
  
  // Fallback: If we're at 100% (bottom), trigger notification regardless
  if (scrollPercent >= 99.5) {
    console.log('🛡️ Reached 100% - triggering notification (no comments found)');
    this.countdownStarted = true;
    this.stopScrolling();
    this.startCountdownToNextChapter();
    return;
  }
  
  // Find any comment section on the page
  const commentElement = this.findAnyCommentSection();
  
  if (commentElement) {
    // Get absolute position of comment section
    const rect = commentElement.getBoundingClientRect();
    const commentTopPosition = rect.top + window.scrollY;
    const currentScrollPosition = window.scrollY;
    
    // If we've reached or passed the comment position, start countdown
    if (currentScrollPosition >= commentTopPosition) {
      console.log('✅ Reached comment section - triggering notification');
      this.countdownStarted = true;
      // Stop scrolling immediately for smooth transition
      this.stopScrolling();
      this.startCountdownToNextChapter();
      return;
    }
  }
}

private checkForEndImages(): boolean {
  // Check images for common end patterns
  const images = document.querySelectorAll('img');
  const endPatterns = [
    'end', 'chapter', 'fin', 'complete', 'continued',
    'next', 'prev', 'credit', 'translator', 'scan',
    'comment', 'discord', 'patreon', 'donate'
  ];
  
  console.log(`🖼️ [END IMAGES] Checking ${images.length} images...`);
  
  const currentScrollY = window.scrollY;
  const viewportHeight = window.innerHeight;
  
  for (let img of images) {
    const rect = img.getBoundingClientRect();
    const absoluteTop = rect.top + currentScrollY;
    
    // Only check images that are BELOW current scroll position and within detection range
    if (absoluteTop > currentScrollY && rect.top < viewportHeight + 500) {
      const src = img.src?.toLowerCase() || '';
      const alt = img.alt?.toLowerCase() || '';
      
      if (endPatterns.some(pattern => src.includes(pattern) || alt.includes(pattern))) {
        console.log('✅ [END IMAGES] Pattern found at Y=' + Math.round(absoluteTop) + ':', src || alt);
        return true;
      }
    }
  }
  
  console.log('❌ [END IMAGES] No patterns found');
  return false;
}

private checkForNavigationElements(): boolean {
  // Look for navigation buttons/links
  const navPatterns = [
    'prev', 'previous', 'next', 'chapter',
    '이전', '다음', // Korean
    '前', '次', // Japanese/Chinese
    'anterior', 'siguiente', // Spanish
    'précédent', 'suivant' // French
  ];
  
  // Check all clickable elements
  const elements = document.querySelectorAll('a, button, div[onclick], span[onclick]');
  let navCount = 0;
  const foundNav: string[] = [];
  
  console.log(`🔗 [NAVIGATION] Checking ${elements.length} clickable elements...`);
  
  const currentScrollY = window.scrollY;
  const viewportHeight = window.innerHeight;
  
  for (let el of elements) {
    const text = el.textContent?.toLowerCase() || '';
    const rect = el.getBoundingClientRect();
    const absoluteTop = rect.top + currentScrollY;
    
    // Only check elements BELOW current scroll position and within detection range
    if (absoluteTop > currentScrollY && rect.top < viewportHeight + 500) {
      if (navPatterns.some(pattern => text.includes(pattern))) {
        navCount++;
        foundNav.push(text.trim().substring(0, 30));
      }
    }
  }
  
  // If we find navigation elements, likely at chapter end
  if (navCount >= 2) {
    console.log(`✅ [NAVIGATION] Found ${navCount} elements at Y > ${Math.round(currentScrollY)}:`, foundNav.slice(0, 5));
    return true;
  }
  
  console.log(`❌ [NAVIGATION] Only ${navCount} elements found`);
  return false;
}

private findAnyCommentSection(): Element | null {
  // Look for ANY comment section on the page
  const commentPatterns = [
    'comment', 'comments', 'commenting', // English singular/plural
    'disqus', 'discuss', 'discussion', 'discussions',
    'reply', 'replies', 'response', 'responses',
    'feedback', 'review', 'reviews',
    '댓글', // Korean
    'コメント', // Japanese
    '评论', // Chinese
    'comentario', 'comentarios', 'comentários' // Spanish/Portuguese
  ];
  
  // Check for common comment section elements
  const elements = document.querySelectorAll('div, section, iframe');
  
  for (let el of elements) {
    const id = el.id?.toLowerCase() || '';
    const className = el.className?.toLowerCase() || '';
    
    // Check if this element contains comment patterns
    if (commentPatterns.some(pattern => id.includes(pattern) || className.includes(pattern))) {
      return el;
    }
  }
  
  // Check for Disqus specifically
  const disqus = document.querySelector('#disqus_thread, iframe[src*="disqus"]');
  if (disqus) {
    return disqus;
  }
  
  return null;
}

private findCommentSection(): Element | null {
  // Look for comment indicators (searches forward/below)
  const commentPatterns = [
    'comment', 'disqus', 'discuss', 'reply',
    '댓글', // Korean
    'コメント', // Japanese
    '评论', // Chinese
    'comentario' // Spanish/Portuguese
  ];
  
  console.log('💬 [COMMENTS] Checking for comment section...');
  
  const currentScrollY = window.scrollY;
  const viewportHeight = window.innerHeight;
  
  // Check for common comment section elements
  const elements = document.querySelectorAll('div, section, iframe');
  
  for (let el of elements) {
    const id = el.id?.toLowerCase() || '';
    const className = el.className?.toLowerCase() || '';
    const rect = el.getBoundingClientRect();
    const absoluteTop = rect.top + currentScrollY;
    
    // Only check elements BELOW current scroll position and within detection range
    if (absoluteTop > currentScrollY && rect.top < viewportHeight + 1000) {
      if (commentPatterns.some(pattern => id.includes(pattern) || className.includes(pattern))) {
        console.log('✅ [COMMENTS] Found at Y=' + Math.round(absoluteTop) + ':', id || className);
        return el;
      }
    }
  }
  
  // Check for Disqus specifically
  const disqus = document.querySelector('#disqus_thread, iframe[src*="disqus"]');
  if (disqus) {
    const rect = disqus.getBoundingClientRect();
    const absoluteTop = rect.top + currentScrollY;
    
    // Only if below current position
    if (absoluteTop > currentScrollY && rect.top < viewportHeight + 1000) {
      console.log('✅ [COMMENTS] Disqus at Y=' + Math.round(absoluteTop));
      return disqus;
    }
  }
  
  console.log('❌ [COMMENTS] No comment section found');
  return null;
}

private findCommentSectionAbove(): Element | null {
  // Look for comment sections ABOVE current position (maybe we scrolled past them)
  const commentPatterns = [
    'comment', 'disqus', 'discuss', 'reply',
    '댓글', // Korean
    'コメント', // Japanese
    '评论', // Chinese
    'comentario' // Spanish/Portuguese
  ];
  
  console.log('🔺 [COMMENTS ABOVE] Checking above current position...');
  
  const currentScrollY = window.scrollY;
  const viewportHeight = window.innerHeight;
  
  // Check for common comment section elements
  const elements = document.querySelectorAll('div, section, iframe');
  
  for (let el of elements) {
    const id = el.id?.toLowerCase() || '';
    const className = el.className?.toLowerCase() || '';
    const rect = el.getBoundingClientRect();
    const absoluteTop = rect.top + currentScrollY;
    
    // Check elements that are ABOVE current scroll (within reasonable range)
    if (absoluteTop < currentScrollY && absoluteTop > currentScrollY - 2000) {
      if (commentPatterns.some(pattern => id.includes(pattern) || className.includes(pattern))) {
        console.log('✅ [COMMENTS ABOVE] Found at Y=' + Math.round(absoluteTop) + ':', id || className);
        return el;
      }
    }
  }
  
  // Check for Disqus specifically
  const disqus = document.querySelector('#disqus_thread, iframe[src*="disqus"]');
  if (disqus) {
    const rect = disqus.getBoundingClientRect();
    const absoluteTop = rect.top + currentScrollY;
    
    // Check if above current position
    if (absoluteTop < currentScrollY && absoluteTop > currentScrollY - 2000) {
      console.log('✅ [COMMENTS ABOVE] Disqus at Y=' + Math.round(absoluteTop));
      return disqus;
    }
  }
  
  console.log('❌ [COMMENTS ABOVE] Not found');
  return null;
}

private checkForCommentSection(): boolean {
  return this.findCommentSection() !== null;
}

private checkForRelatedSeries(): boolean {
  // Look for related/recommended series sections
  const relatedPatterns = [
    'related', 'recommend', 'similar', 'more series',
    'other work', 'you may like', 'check out',
    '관련', '추천', // Korean
    '関連', 'おすすめ', // Japanese
    '相关', '推荐' // Chinese
  ];
  
  console.log('📚 [RELATED SERIES] Checking...');
  
  const currentScrollY = window.scrollY;
  const viewportHeight = window.innerHeight;
  const headings = document.querySelectorAll('h1, h2, h3, h4, div');
  
  for (let el of headings) {
    const text = el.textContent?.toLowerCase() || '';
    const rect = el.getBoundingClientRect();
    const absoluteTop = rect.top + currentScrollY;
    
    // Only check elements BELOW current scroll position and within detection range
    if (absoluteTop > currentScrollY && rect.top < viewportHeight + 500) {
      if (relatedPatterns.some(pattern => text.includes(pattern))) {
        console.log('✅ [RELATED SERIES] Found at Y=' + Math.round(absoluteTop) + ':', text.trim().substring(0, 50));
        return true;
      }
    }
  }
  
  console.log('❌ [RELATED SERIES] Not found');
  return false;
}


private findNextNavElement(): Element | null {
  // Common patterns for next chapter links/buttons (prioritized)
  const selectors = [
    'a[rel="next"]',
    'a.next-chapter',
    'a.next',
    'button.next',
    'a[aria-label*="next"]',
    'a[title*="next"]'
  ];

  // Try query selectors first
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el) {
        const href = (el as HTMLAnchorElement).href || '';
        // Skip if it's a social media link
        if (!href.includes('facebook') && !href.includes('twitter') && !href.includes('discord')) {
          console.log('✅ Next chapter found via selector:', sel);
          return el;
        }
      }
    } catch (e) {
      // ignore invalid selectors
    }
  }

  // Fallback: look through anchor text for next-like words
  const anchors = Array.from(document.querySelectorAll('a, button'));
  const blockedDomains = ['facebook.com', 'twitter.com', 'discord.com', 'patreon.com', 't.me'];
  const blockedWords = ['share', 'tweet', 'like'];
  const prevWords = ['prev', 'previous', 'back', '이전', '上', '前', 'anterior', 'précédent'];
  
  // Priority 1: Look for "next chapter" specifically
  for (const a of anchors) {
    const text = (a.textContent || '').toLowerCase().trim();
    const href = ((a as HTMLAnchorElement).href || '').toLowerCase();
    
    // Skip external social domains
    if (blockedDomains.some(d => href.includes(d))) continue;
    if (blockedWords.some(w => text.includes(w))) continue;
    if (prevWords.some(w => text.includes(w))) continue;
    
    if (text.includes('next chapter') || text.includes('nextchapter')) {
      console.log('✅ Next chapter found (Priority 1): "next chapter" text');
      return a;
    }
  }
  
  // Priority 2: Look for just "next" but check href contains chapter/episode patterns
  for (const a of anchors) {
    const text = (a.textContent || '').toLowerCase().trim();
    const href = ((a as HTMLAnchorElement).href || '').toLowerCase();
    
    if (blockedDomains.some(d => href.includes(d))) continue;
    if (blockedWords.some(w => text.includes(w))) continue;
    if (prevWords.some(w => text.includes(w))) continue;
    
    // Check if text is "next" and href looks like chapter navigation
    if ((text === 'next' || text === '다음' || text === '次' || text.includes('next')) &&
        (href.includes('chapter') || href.includes('episode') || href.includes('ch-') || 
         href.match(/\/\d+\//) || href.includes('/next'))) {
      console.log('✅ Next chapter found (Priority 2): next + chapter URL');
      return a;
    }
  }
  
  // Priority 3: Any "next" that's not blocked
  for (const a of anchors) {
    const text = (a.textContent || '').toLowerCase().trim();
    const href = ((a as HTMLAnchorElement).href || '').toLowerCase();
    
    if (blockedDomains.some(d => href.includes(d))) continue;
    if (blockedWords.some(w => text.includes(w))) continue;
    if (prevWords.some(w => text.includes(w))) continue;
    
    if (text === 'next' || text === '다음' || text === '次' || text === 'siguiente' || text === 'seguinte') {
      console.log('✅ Next chapter found (Priority 3): generic next');
      return a;
    }
  }

  console.log('❌ ERROR: No next chapter link found on page');
  return null;
}

private findPrevNavElement(): Element | null {
  // Common patterns for previous chapter links/buttons
  const selectors = [
    'a[rel="prev"]',
    'a.prev',
    'a.previous',
    'a[aria-label*="prev"]',
    'a[aria-label*="previous"]',
    'a[title*="prev"]',
    'a[title*="previous"]',
    'button.prev',
    'button.previous'
  ];

  // Try query selectors first
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el) return el;
    } catch (e) {
      // ignore invalid selectors
    }
  }

  // Fallback: look through anchor text for prev-like words
  const anchors = Array.from(document.querySelectorAll('a, button'));
  const prevWords = ['prev', 'previous', 'back', '이전', '上', '前', 'anterior', 'précédent'];
  const nextWords = ['next', '다음', '次']; // Avoid next links

  for (const a of anchors) {
    const text = (a.textContent || '').toLowerCase().trim();
    const href = (a as HTMLAnchorElement).href || '';
    // Avoid next links
    if (nextWords.some(w => text.includes(w) || href.includes(w))) continue;

    if (prevWords.some(w => text.includes(w) || href.toLowerCase().includes(w))) return a;
  }

  return null;
}


private startCountdownToNextChapter() {
  // If already counting down, ignore
  if (this.countdownTimer) {
    return;
  }
  
  // Check if next chapter exists BEFORE showing countdown
  const nextChapterExists = this.findNextNavElement() !== null;
  
  let secondsLeft = 5;
  this.showCountdownNotification(secondsLeft, nextChapterExists);
  
  // Update countdown every second
  this.countdownTimer = window.setInterval(() => {
    secondsLeft--;
    
    if (secondsLeft <= 0) {
      // Countdown finished
      this.cancelCountdown();
      if (nextChapterExists && this.settings.autoAdvanceChapter) {
        // Auto-advance is enabled, go to next chapter
        this.handleChapterEnd();
      } else if (nextChapterExists && !this.settings.autoAdvanceChapter) {
        // Auto-advance disabled, just stop
        console.log('⏸️ Auto-advance disabled - stopping at chapter end');
        this.stopScrolling();
        this.showStatus('Chapter complete - Auto-advance disabled', 'info');
      } else {
        // Last chapter - just stop
        console.log('🏁 This is the last chapter');
        this.stopScrolling();
        this.showStatus('🏁 Last chapter - Happy reading!', 'info');
      }
    } else {
      // Update notification
      this.updateCountdownNotification(secondsLeft);
    }
  }, 1000);
}

private showCountdownNotification(seconds: number, hasNextChapter: boolean) {
  // Remove any existing notification
  if (this.countdownNotification) {
    this.countdownNotification.remove();
  }
  
  // Create countdown notification
  const notification = document.createElement('div');
  notification.id = 'smart-scroll-countdown';
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
  
  // Different message based on whether next chapter exists and auto-advance setting
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
  
  // Add cancel button listener
  const cancelBtn = document.getElementById('countdown-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => this.cancelCountdown());
  }
}

private updateCountdownNotification(seconds: number) {
  const secondsSpan = document.getElementById('countdown-seconds');
  if (secondsSpan) {
    secondsSpan.textContent = seconds.toString();
  }
}

private cancelCountdown() {
  // Clear timer
  if (this.countdownTimer) {
    clearInterval(this.countdownTimer);
    this.countdownTimer = null;
  }
  
  // Remove notification
  if (this.countdownNotification) {
    this.countdownNotification.remove();
    this.countdownNotification = null;
  }
  
  // Stop scrolling if cancelled by user and show Resume button
  if (!this.chapterEndHandled) {
    this.stopScrolling();
    this.showResumeButton();
  }
}

private showResumeButton() {
  const resumeBtn = document.createElement('div');
  resumeBtn.id = 'smart-scroll-resume';
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
  resumeBtn.textContent = '▶ Resume Scrolling';
  
  resumeBtn.addEventListener('mouseenter', () => {
    resumeBtn.style.transform = 'scale(1.05)';
  });
  
  resumeBtn.addEventListener('mouseleave', () => {
    resumeBtn.style.transform = 'scale(1)';
  });
  
  resumeBtn.addEventListener('click', () => {
    resumeBtn.remove();
    this.startScrolling();
  });
  
  document.body.appendChild(resumeBtn);
  
  // Auto-remove after 10 seconds
  setTimeout(() => {
    if (resumeBtn.parentElement) {
      resumeBtn.remove();
    }
  }, 10000);
}

private handleChapterEnd() {
  // If we've already handled chapter end recently, ignore
  if (this.chapterEndHandled) {
    return;
  }

  this.chapterEndHandled = true;

  const next = this.findNextNavElement();
  if (next) {
    // Set auto-start flag before navigating
    browser.storage.local.set({ autoStartScroll: true });
    
    if (next.tagName === 'A' && (next as HTMLAnchorElement).href) {
      window.location.href = (next as HTMLAnchorElement).href;
      return;
    } else {
      try {
        (next as HTMLElement).click();
        return;
      } catch (e) {
        console.log('❌ ERROR: Failed to navigate to next chapter');
      }
    }
  }

  // No next chapter found - this is the last chapter
  console.log('🏁 This is the last chapter');
  this.stopScrolling();
  this.showStatus('🏁 Last chapter - Happy reading!', 'info');
}

private navigateToNextChapter() {
  this.showStatus('Navigating to next chapter...', 'info');
  const next = this.findNextNavElement();
  
  if (next) {
    if (next.tagName === 'A' && (next as HTMLAnchorElement).href) {
      window.location.href = (next as HTMLAnchorElement).href;
    } else {
      try {
        (next as HTMLElement).click();
      } catch (e) {
        this.showStatus('Could not navigate to next chapter', 'error');
      }
    }
  } else {
    this.showStatus('No next chapter found', 'warning');
  }
}

private navigateToPreviousChapter() {
  this.showStatus('Navigating to previous chapter...', 'info');
  const prev = this.findPrevNavElement();
  
  if (prev) {
    if (prev.tagName === 'A' && (prev as HTMLAnchorElement).href) {
      window.location.href = (prev as HTMLAnchorElement).href;
    } else {
      try {
        (prev as HTMLElement).click();
      } catch (e) {
        this.showStatus('Could not navigate to previous chapter', 'error');
      }
    }
  } else {
    this.showStatus('No previous chapter found', 'warning');
  }
}

private showChapterEndNotification() {
  // Deprecated: notifications with options replaced by auto-advance
  // Left in place in case future UI is desired.
}


  private showProgressIndicator() {
    if (this.progressIndicator) return;
    if (!this.isEnabled) return; // Don't show if disabled
    
    const indicator = document.createElement('div');
    indicator.id = 'smart-scroll-progress';
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
    indicator.textContent = '0%';
    document.body.appendChild(indicator);
    this.progressIndicator = indicator;
  }
  
  
  private updateProgressIndicator() {
    if (!this.progressIndicator) return;
    
    // Find comment section to use as chapter end boundary
    const commentSection = this.findAnyCommentSection();
    let chapterEndY = document.documentElement.scrollHeight;
    
    if (commentSection) {
      const rect = commentSection.getBoundingClientRect();
      chapterEndY = rect.top + window.scrollY;
    }
    
    // Calculate progress only within chapter content (before comments)
    const currentScrollY = window.scrollY;
    const scrollableChapterHeight = chapterEndY - window.innerHeight;
    const scrollPercent = Math.min(100, Math.max(0, (currentScrollY / scrollableChapterHeight) * 100));
    
    this.progressIndicator.textContent = `${Math.round(scrollPercent)}%`;
  }
  
  private hideProgressIndicator() {
    if (this.progressIndicator) {
      this.progressIndicator.remove();
      this.progressIndicator = null;
    }
  }

  private updateUI() {
    const overlay = document.getElementById('smart-scroll-overlay');
    const toggleBtn = document.getElementById('smart-scroll-toggle');
    const speedValue = document.getElementById('speed-value');

    if (overlay) {
      overlay.style.display = this.isEnabled ? '' : 'none';
      overlay.classList.toggle('enabled', this.isEnabled);
      overlay.classList.toggle('scrolling', this.scrollState.isScrolling);
    }

    if (toggleBtn) {
      const icon = toggleBtn.querySelector('.icon');
      if (icon) {
        icon.textContent = this.scrollState.isScrolling ? '⏸' : '▶';
      }
    }

    if (speedValue) {
      const baseSpeed = this.settings.scrollSpeed;
      const currentSpeed = Math.round(this.scrollState.targetSpeed);
      const diff = currentSpeed - baseSpeed;
      
      if (diff !== 0) {
        const sign = diff > 0 ? '+' : '';
        speedValue.textContent = `${baseSpeed} (${sign}${diff})`;
      } else {
        speedValue.textContent = baseSpeed.toString();
      }
    }
    
    // Send speed update to popup
    this.sendSpeedUpdate();
  }

  // ========== SMART VIEWPORT & NEXT-TEXTBOX ANALYSIS ==========
  
  private analyzeViewportAndNext(): {
    textInViewport: boolean;
    textAmount: number;
    wordCount: number;
    textBoxHeight: number;
    nextTextDistance: number;
  } {
    // Check cache first for performance
    const now = Date.now();
    if (this.textAnalysisCache && now - this.textAnalysisCache.timestamp < this.CACHE_TTL) {
      return this.textAnalysisCache.result;
    }
    
    try {
    const viewportTop = window.scrollY;
    const viewportBottom = viewportTop + window.innerHeight;
    const centerX = window.innerWidth / 2;
    
    // 1. CHECK CURRENT VIEWPORT for text (focus on center where text usually is)
    let textInViewport = false;
    let textAmount = 0;
    let totalWords = 0;
    let largestTextBox = 0;
    const seenElements = new Set<Element>(); // Avoid counting same element multiple times
    
    // Sample 15 points vertically in viewport for better detection
    for (let i = 0; i < 15; i++) {
      const checkY = viewportTop + (window.innerHeight / 15) * i;
      const screenY = checkY - viewportTop;
      
      if (screenY >= 0 && screenY <= window.innerHeight) {
        // Check multiple horizontal positions (left, center, right) for better coverage
        const xPositions = [centerX * 0.3, centerX, centerX * 1.7];
        
        for (const xPos of xPositions) {
          const elements = document.elementsFromPoint(xPos, screenY);
          
          elements.forEach(el => {
            if (seenElements.has(el)) return; // Skip duplicates
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
    
    // 2. FIND NEXT TEXT BOX (look ahead 50-1000px for better prediction)
    let nextTextDistance = 9999;
    const lookAheadMax = 1000;
    
    // Check multiple positions ahead with finer granularity near viewport
    const checkDistances = [
      ...Array.from({length: 10}, (_, i) => 50 + i * 50),  // 50-500px: every 50px
      ...Array.from({length: 5}, (_, i) => 550 + i * 100)  // 550-1000px: every 100px
    ];
    
    for (const distance of checkDistances) {
      const checkY = viewportBottom + distance;
      const xPositions = [centerX * 0.5, centerX, centerX * 1.5];
      
      for (const xPos of xPositions) {
        const elements = document.elementsFromPoint(xPos, checkY % window.innerHeight);
        
        for (const el of elements) {
          const textData = this.analyzeTextElement(el, checkY, checkY + 200);
          if (textData.hasText && textData.wordCount >= 3) { // Must have at least 3 words
            nextTextDistance = distance;
            break;
          }
        }
        
        if (nextTextDistance < 9999) break;
      }
      
      if (nextTextDistance < 9999) break;
    }
    
    const result = {
      textInViewport,
      textAmount,
      wordCount: totalWords,
      textBoxHeight: largestTextBox,
      nextTextDistance: nextTextDistance < 9999 ? nextTextDistance : 0
    };
    
    // Cache the result
    this.textAnalysisCache = {
      timestamp: Date.now(),
      result
    };
    
    return result;
    } catch (error) {
      console.error('[SmartScroll] Text analysis error:', error);
      // Return safe defaults on error
      return {
        textInViewport: false,
        textAmount: 0,
        wordCount: 0,
        textBoxHeight: 0,
        nextTextDistance: 0
      };
    }
  }
  
  private analyzeTextElement(element: Element, rangeTop: number, rangeBottom: number): {
    hasText: boolean;
    textLength: number;
    wordCount: number;
    height: number;
  } {
    try {
    const tag = element.tagName.toLowerCase();
    const className = element.className?.toString().toLowerCase() || '';
    const id = element.id?.toLowerCase() || '';
    
    // Skip non-text elements
    if (['img', 'video', 'canvas', 'svg', 'script', 'style', 'noscript'].includes(tag)) {
      return { hasText: false, textLength: 0, wordCount: 0, height: 0 };
    }
    
    const rect = element.getBoundingClientRect();
    
    // Skip very small or invisible elements
    if (rect.width < 10 || rect.height < 10) {
      return { hasText: false, textLength: 0, wordCount: 0, height: 0 };
    }
    
    const text = element.textContent?.trim() || '';
    
    // METHOD 1: Check for text-related keywords in class/id
    const textKeywords = ['text', 'dialogue', 'speech', 'bubble', 'caption', 'subtitle', 'paragraph', 'content', 'comment', 'message'];
    const hasTextKeyword = textKeywords.some(keyword => 
      className.includes(keyword) || id.includes(keyword)
    );
    
    // METHOD 2: Check actual text content (at least 20 chars = ~4-5 words minimum)
    const hasTextContent = text.length > 20;
    
    // METHOD 3: Check if element has common text tags as children
    const textTags = ['p', 'span', 'div', 'label', 'a', 'strong', 'em', 'b', 'i'];
    const hasTextChildren = textTags.some(t => element.querySelector(t) !== null);
    
    // Must pass at least 2 of 3 methods
    const score = (hasTextKeyword ? 1 : 0) + (hasTextContent ? 1 : 0) + (hasTextChildren ? 1 : 0);
    if (score < 2) {
      return { hasText: false, textLength: 0, wordCount: 0, height: 0 };
    }
    
    // Check if element is in range
    const elementTop = rect.top + window.scrollY;
    const elementBottom = elementTop + rect.height;
    
    if (elementBottom < rangeTop || elementTop > rangeBottom) {
      return { hasText: false, textLength: 0, wordCount: 0, height: 0 };
    }
    
    // Calculate word count (split by whitespace)
    const words = text.split(/\s+/).filter(w => w.length > 0);
    
    return {
      hasText: true,
      textLength: text.length,
      wordCount: words.length,
      height: rect.height
    };
    } catch (error) {
      // Silently return no text on element analysis error
      return { hasText: false, textLength: 0, wordCount: 0, height: 0 };
    }
  }
}

// Initialize Smart Scroll when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new SmartScroll());
} else {
  new SmartScroll();
}