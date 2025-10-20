# Changelog

## Version 0.2.0 - Final Release

### ✨ Features
- **Predictive Speed Adjustment**: Automatically adjusts speed based on text density and upcoming content
- **Reading Mode Shortcuts**: f/b/s/n keys for Focus/Binge/Skim/Normal modes
- **Cross-Browser Support**: Single build works on both Chrome and Firefox
- **Smart Chapter Detection**: Automatically detects chapter ends via comment sections
- **Auto-Advance**: Seamlessly navigates to next chapter with 5-second countdown
- **Progress Indicator**: Shows scroll progress percentage at top center
- **Speed Display**: Shows current speed with dynamic +/- adjustment indicator
- **Emergency Stop**: Shake mouse vigorously to stop scrolling
- **Dark Mode**: Toggle between light and dark themes
- **Speed Presets**: Quick buttons for Slow/Normal/Fast/Turbo speeds

### ⌨️ Keyboard Shortcuts
- **Space**: Start/pause scrolling
- **Escape**: Stop scrolling
- **↑/↓**: Adjust speed (±10)
- **[/]**: Fine speed control (±10)
- **f**: Focus mode (30% slower)
- **s**: Skim mode (50% faster)
- **b**: Binge mode (20% faster)
- **n**: Normal mode (reset to 150)
- **→/←**: Next/previous chapter
- **? or h**: Show help overlay

### 🎯 Smart Features
- **Text Detection**: Multi-point viewport sampling for accurate text detection
- **Look-Ahead Analysis**: Scans 50-1000px ahead to find next text section
- **Zoom Compensation**: Adjusts speed calculations for browser zoom levels
- **Image Loading Detection**: Slows down temporarily while images load
- **Word Count-Based Speed**: 8-tier speed multiplier system (0.12x - 0.65x)
- **Distance-Based Deceleration**: Smooth braking curve when approaching text

### 🔧 Settings
- Scroll speed (10-600 px/s)
- Auto-advance to next chapter
- Wait longer for images (slow sites)
- Emergency stop on mouse shake
- Dark mode preference

### 🐛 Bug Fixes
- Fixed: Reading mode shortcuts now properly change base speed
- Fixed: Extension completely disabled when turned off (no shortcuts, no UI)
- Fixed: Speed overlay removed (now uses main speed indicator)
- Fixed: Chapter break notifications removed (silent operation)
- Fixed: All text density and distance warnings removed
- Fixed: UI hidden on all sites when extension is disabled

### 🎨 UI Improvements
- Removed Settings button (unused feature)
- Cleaner popup design
- Speed indicator shows base speed with +/- dynamic adjustment
- Progress bar at top center during scrolling
- Pause/play button with integrated speed display
- Speed presets for quick access

### 🧹 Cleanup
- Removed reading statistics features
- Removed import/export settings functionality
- Removed separate speed overlay
- Removed all notification spam
- Simplified codebase for maintainability

---

## Installation

### Chrome/Edge
```
chrome://extensions/
→ Load unpacked
→ Select 'dist' folder
```

### Firefox
```
about:debugging#/runtime/this-firefox
→ Load Temporary Add-on
→ Select 'dist/manifest.json'
```

---

**Built with TypeScript + Vite**
