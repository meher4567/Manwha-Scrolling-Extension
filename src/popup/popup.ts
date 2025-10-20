import browser from 'webextension-polyfill';

document.addEventListener('DOMContentLoaded', async () => {
  // Get current settings
  const settings = await browser.storage.sync.get(['enabled', 'scrollSpeed', 'autoAdvanceChapter', 'waitForImages', 'emergencyStopOnShake', 'learningModeEnabled']);
  
  // Initialize UI elements
  const enableToggle = document.getElementById('enable-toggle') as HTMLInputElement;
  const speedSlider = document.getElementById('speed-slider') as HTMLInputElement;
  const speedValue = document.getElementById('speed-value') as HTMLSpanElement;
  const autoAdvanceToggle = document.getElementById('auto-advance-toggle') as HTMLInputElement;
  const waitImagesToggle = document.getElementById('wait-images-toggle') as HTMLInputElement;
  const emergencyStopToggle = document.getElementById('emergency-stop-toggle') as HTMLInputElement;
  const speedAdjustment = document.getElementById('speed-adjustment') as HTMLSpanElement;
  const startButton = document.getElementById('start-scroll') as HTMLButtonElement;

  // Set initial values
  enableToggle.checked = (settings as any).enabled ?? true;
  speedSlider.value = String((settings as any).scrollSpeed ?? 50);
  speedValue.textContent = speedSlider.value;
  autoAdvanceToggle.checked = (settings as any).autoAdvanceChapter ?? true;
  waitImagesToggle.checked = (settings as any).waitForImages ?? false;
  emergencyStopToggle.checked = (settings as any).emergencyStopOnShake ?? true;
  
  // Load dark mode setting
  const darkModeResult = await browser.storage.local.get('darkMode');
  const isDarkMode = darkModeResult.darkMode ?? false;
  if (isDarkMode) {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.getElementById('dark-mode-toggle')!.textContent = '☀️';
  }
  
  // Dark mode toggle
  document.getElementById('dark-mode-toggle')?.addEventListener('click', async () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    if (newTheme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      document.getElementById('dark-mode-toggle')!.textContent = '☀️';
      await browser.storage.local.set({ darkMode: true });
    } else {
      document.documentElement.removeAttribute('data-theme');
      document.getElementById('dark-mode-toggle')!.textContent = '🌙';
      await browser.storage.local.set({ darkMode: false });
    }
  });

  // Enable toggle handler
  enableToggle.addEventListener('change', async (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    await browser.storage.sync.set({ enabled });
    
    // Send message to content script
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab.id) {
      browser.tabs.sendMessage(tab.id, { action: 'toggleEnabled' });
    }
  });

  // Speed presets
  const presets = {
    slow: 150,
    normal: 250,
    fast: 400,
    turbo: 550
  };
  
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;
      const preset = target.dataset.preset as keyof typeof presets;
      const speed = presets[preset];
      
      speedSlider.value = String(speed);
      speedValue.textContent = String(speed);
      
      await browser.storage.sync.set({ scrollSpeed: speed });
      
      // Send update to content script
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab.id) {
        browser.tabs.sendMessage(tab.id, { 
          action: 'updateSettings', 
          settings: { scrollSpeed: speed } 
        });
      }
      
      // Highlight active preset
      document.querySelectorAll('.preset-btn').forEach(b => {
        (b as HTMLElement).style.background = 'white';
        (b as HTMLElement).style.color = '#333';
      });
      target.style.background = '#4A90E2';
      target.style.color = 'white';
    });
  });

  // Speed slider handler
  speedSlider.addEventListener('input', (e) => {
    const speed = (e.target as HTMLInputElement).value;
    speedValue.textContent = speed;
    
    // Reset preset button styles
    document.querySelectorAll('.preset-btn').forEach(b => {
      (b as HTMLElement).style.background = 'white';
      (b as HTMLElement).style.color = '#333';
    });
  });

  speedSlider.addEventListener('change', async (e) => {
    const scrollSpeed = parseInt((e.target as HTMLInputElement).value);
    await browser.storage.sync.set({ scrollSpeed });
    
    // Send update to content script
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab.id) {
      browser.tabs.sendMessage(tab.id, { 
        action: 'updateSettings', 
        settings: { scrollSpeed } 
      });
    }
  });

  // Auto-advance toggle handler
  autoAdvanceToggle.addEventListener('change', async (e) => {
    const autoAdvanceChapter = (e.target as HTMLInputElement).checked;
    await browser.storage.sync.set({ autoAdvanceChapter });
    
    // Send update to content script
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab.id) {
      browser.tabs.sendMessage(tab.id, { 
        action: 'updateSettings', 
        settings: { autoAdvanceChapter } 
      });
    }
  });

  // Wait for images toggle handler
  waitImagesToggle.addEventListener('change', async (e) => {
    const waitForImages = (e.target as HTMLInputElement).checked;
    await browser.storage.sync.set({ waitForImages });
    
    // Send update to content script
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab.id) {
      browser.tabs.sendMessage(tab.id, { 
        action: 'updateSettings', 
        settings: { waitForImages } 
      });
    }
  });

  // Emergency stop toggle handler
  emergencyStopToggle.addEventListener('change', async (e) => {
    const emergencyStopOnShake = (e.target as HTMLInputElement).checked;
    await browser.storage.sync.set({ emergencyStopOnShake });
    
    // Send update to content script
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab.id) {
      browser.tabs.sendMessage(tab.id, { 
        action: 'updateSettings', 
        settings: { emergencyStopOnShake } 
      });
    }
  });

  // Start button handler
  startButton.addEventListener('click', async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab.id) {
      browser.tabs.sendMessage(tab.id, { action: 'toggleScrolling' });
      window.close();
    }
  });

  // Export settings
  document.getElementById('export-btn')?.addEventListener('click', async () => {
    const allSettings = await browser.storage.sync.get(null);
    const statsData = await browser.storage.local.get('readingStats');
    
    const exportData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      settings: allSettings,
      stats: statsData.readingStats || {}
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smart-scroll-settings-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
  
  // Import settings
  document.getElementById('import-btn')?.addEventListener('click', () => {
    document.getElementById('import-file')?.click();
  });
  
  document.getElementById('import-file')?.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (data.settings) {
        await browser.storage.sync.set(data.settings);
      }
      if (data.stats) {
        await browser.storage.local.set({ readingStats: data.stats });
      }
      
      alert('✅ Settings imported successfully! Reload the extension.');
      window.location.reload();
    } catch (error) {
      alert('❌ Failed to import settings. Invalid file.');
    }
  });
  

  // Request current speed state from content script
  const requestSpeedUpdate = async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab.id) {
      try {
        const response: any = await browser.tabs.sendMessage(tab.id, { action: 'getSpeedState' });
        if (response && response.baseSpeed !== undefined) {
          updateSpeedDisplay(response.baseSpeed, response.currentSpeed);
        }
      } catch (e) {
        // Content script might not be loaded yet
      }
    }
  };

  // Helper to update speed display
  const updateSpeedDisplay = (baseSpeed: number, currentSpeed: number) => {
    const adjustment = Math.round(currentSpeed - baseSpeed);
    
    // Update base speed display
    speedValue.textContent = String(baseSpeed);
    
    // Show adjustment if different from base
    if (Math.abs(adjustment) > 5) {
      const sign = adjustment > 0 ? '+' : '';
      speedAdjustment.textContent = `(${sign}${adjustment})`;
      speedAdjustment.style.color = adjustment < 0 ? '#ff6b6b' : '#51cf66';
    } else {
      speedAdjustment.textContent = '';
    }
  };

  // Listen for dynamic speed updates from content script
  browser.runtime.onMessage.addListener((message: any) => {
    if (message.action === 'speedUpdate') {
      updateSpeedDisplay(message.baseSpeed, message.currentSpeed);
    }
  });

  // Request initial speed state
  requestSpeedUpdate();
  
  // Load and display stats
  const loadStats = async () => {
    try {
      const result = await browser.storage.local.get('readingStats');
      const stats: any = result.readingStats || { totalTimeMs: 0, totalDistance: 0, chaptersCompleted: 0, sessionsCount: 0 };
      
      const hours = Math.floor(stats.totalTimeMs / 3600000);
      const minutes = Math.floor((stats.totalTimeMs % 3600000) / 60000);
      const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
      
      document.getElementById('stat-time')!.textContent = timeStr;
      document.getElementById('stat-distance')!.textContent = `${Math.round(stats.totalDistance)}px`;
      document.getElementById('stat-chapters')!.textContent = String(stats.chaptersCompleted);
      document.getElementById('stat-sessions')!.textContent = String(stats.sessionsCount);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };
  
  loadStats();
  
  // Reset stats button
  document.getElementById('reset-stats')?.addEventListener('click', async () => {
    if (confirm('Reset all reading statistics?')) {
      await browser.storage.local.set({ 
        readingStats: { totalTimeMs: 0, totalDistance: 0, chaptersCompleted: 0, sessionsCount: 0 } 
      });
      loadStats();
    }
  });
  
  // Poll for updates every 3 seconds while popup is open
  const updateInterval = setInterval(() => {
    requestSpeedUpdate();
    loadStats();
  }, 3000);
  
  // Cleanup on popup close
  window.addEventListener('unload', () => {
    clearInterval(updateInterval);
  });
});
