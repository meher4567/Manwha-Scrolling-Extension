# Smart Scroll

An intelligent auto-scrolling browser extension for manga, webtoons, and long-form visual content with predictive speed adjustment.

## ✨ Features

- **🎯 Predictive Speed Control**: Automatically adjusts scrolling speed based on text density and upcoming content
- **⌨️ Keyboard Shortcuts**: Full keyboard control for speed, navigation, and reading modes
- **🔄 Auto Chapter Navigation**: Seamlessly advances to the next chapter when finished
- **📊 Progress Tracking**: Real-time progress indicator during scrolling
- **🌙 Dark Mode**: Built-in dark mode for comfortable reading
- **🚨 Emergency Stop**: Shake your mouse to stop scrolling instantly
- **📱 Cross-Browser**: Works on both Chrome and Firefox

## 🚀 Installation

### Chrome/Edge
1. Download or clone this repository
2. Open `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the `dist` folder

### Firefox
1. Download or clone this repository
2. Open `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on"
4. Select the `manifest.json` file in the `dist` folder

## 🎮 Usage

### Basic Controls
- **Space**: Start/pause scrolling
- **Escape**: Stop scrolling completely
- **↑/↓**: Adjust base speed (±10)
- **[/]**: Fine speed control (±10)
- **+/-**: Speed adjustment

### Reading Modes
- **f**: Focus mode (30% slower)
- **s**: Skim mode (50% faster)
- **b**: Binge mode (20% faster)
- **n**: Normal mode (reset to 150 px/s)

### Chapter Navigation
- **→**: Next chapter
- **←**: Previous chapter

### Help
- **? or h**: Show keyboard shortcuts overlay

## ⚙️ Settings

Access settings through the extension popup:

- **Scroll Speed**: Base scrolling speed (10-600 px/s)
- **Speed Presets**: Quick access to Slow/Normal/Fast/Turbo speeds
- **Auto-advance**: Automatically go to next chapter when finished
- **Wait for Images**: Extra time for slow-loading sites
- **Emergency Stop**: Enable mouse shake detection

## 🛠️ Development

### Prerequisites
- Node.js 16+
- npm or yarn

### Setup
```bash
# Install dependencies
npm install

# Build for production
npm run build
```

### Project Structure
```
smart-scroll/
├── src/
│   ├── content/          # Content script
│   ├── popup/            # Extension popup UI
│   ├── background/       # Background service worker
│   ├── lib/              # Shared utilities
│   └── manifest.json     # Extension manifest
├── dist/                 # Built extension
└── README.md
```

## 🎯 How It Works

Smart Scroll uses advanced text detection and look-ahead analysis to:

1. **Detect Text Density**: Analyzes visible text content in real-time
2. **Predict Upcoming Content**: Scans ahead to find the next text section
3. **Adjust Speed Dynamically**: 
   - Slows down when text is visible
   - Speeds up through whitespace/images
   - Decelerates when approaching text
4. **Navigate Automatically**: Detects chapter ends and advances seamlessly

## 📝 Notes

- The extension is designed for manga/webtoon sites but works on any long-scrolling content
- Speed adjustments happen automatically based on content analysis
- All keyboard shortcuts work during scrolling
- **When disabled, the extension is completely inactive** (no shortcuts, no UI)

## 📄 License

MIT License - feel free to use and modify as needed.

---

**Enjoy smart scrolling! 📜✨**
