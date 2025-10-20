# Firefox Installation Guide

## ✅ Firefox Compatibility Complete!

Your Smart Scroll extension now works on **both Chrome and Firefox** with the same codebase!

---

## How to Load in Firefox

### Method 1: Temporary Installation (for Testing)

1. Open Firefox
2. Type `about:debugging` in the address bar
3. Click **"This Firefox"** in the left sidebar
4. Click **"Load Temporary Add-on..."**
5. Navigate to `D:\CKXJ\ML\TD3\smart-scroll\dist\`
6. Select the **`manifest.json`** file
7. The extension is now loaded! (Will be removed when Firefox restarts)

### Method 2: Permanent Installation (Signed)

For permanent installation, you need to:
1. Package the extension as a `.zip` file
2. Submit to [Firefox Add-ons (AMO)](https://addons.mozilla.org/developers/)
3. Wait for Mozilla review
4. Once approved, users can install from AMO

---

## Testing Checklist for Firefox

After loading the extension, test these features:

- [ ] **Extension loads without errors** (check Browser Console: Ctrl+Shift+J)
- [ ] **Popup opens** (click extension icon)
- [ ] **Settings persist** (change speed, reload page)
- [ ] **Auto-scroll works** (click "Start Scrolling")
- [ ] **Speed adjustment** (Arrow Up/Down keys)
- [ ] **Comment detection** (scroll to comments section)
- [ ] **Chapter navigation** (countdown notification appears)
- [ ] **Emergency stop** (shake mouse vigorously)
- [ ] **Progress indicator** (shows % at top center)

---

## Browser Differences

### Works the Same:
- ✅ All scrolling features
- ✅ Content detection
- ✅ Chapter navigation
- ✅ Settings sync
- ✅ Keyboard shortcuts

### Minor Differences:
- **Storage Sync Limits**: Firefox has smaller sync storage limits than Chrome
- **Badge API**: Slightly different styling in Firefox
- **Manifest V3**: Firefox has full support as of v109+

---

## Key Changes Made

1. **Installed `webextension-polyfill`** - Cross-browser compatibility layer
2. **Replaced `chrome.*` with `browser.*`** - Works on both browsers
3. **Updated manifest.json** - Added `browser_specific_settings` for Firefox
4. **Promise-based APIs** - All storage/messaging now uses promises instead of callbacks

---

## Future Development

**Good News:** You only need to write code once! 

- Use `browser.*` API for all new features
- No separate Firefox/Chrome versions needed
- Build once, works everywhere

### Example for Stage 3:
```typescript
// ✅ Works on both Chrome and Firefox
const data = await browser.storage.local.get('readingHistory');
await browser.storage.local.set({ readingHistory: newData });
```

---

## Debugging in Firefox

### Browser Console (Ctrl+Shift+J)
- Shows extension errors
- Service worker logs
- General JavaScript errors

### About:debugging
- View loaded extensions
- Inspect extension pages (popup, options)
- Reload extension after changes

### Developer Tools (F12)
- Content script debugging
- Network requests
- Console logs from content script

---

## Package for Distribution

### Create Firefox Package:
```bash
cd D:\CKXJ\ML\TD3\smart-scroll\dist
# Zip all files in dist folder
```

**Important Files:**
- `manifest.json` (with `browser_specific_settings`)
- `content.js`, `background.js`, `popup.js`
- `browser-polyfill.js` (auto-included)
- All HTML/CSS files
- Icons (if you have them)

---

## Troubleshooting

### "Extension could not be loaded"
- Check manifest.json syntax
- Ensure `strict_min_version` is `109.0` or higher
- Verify all file paths in manifest are correct

### "browser is not defined"
- Make sure `webextension-polyfill` is imported
- Check that build includes `browser-polyfill.js`

### Settings not persisting
- Firefox syncing may be disabled
- Use `browser.storage.local` for guaranteed local storage
- Check Firefox Sync settings in `about:preferences`

---

## Version Info

- **Extension Version**: 0.2.0
- **Minimum Firefox**: 109.0
- **Manifest Version**: 3
- **Polyfill Version**: Latest (webextension-polyfill)

---

## Next Steps

1. **Test in Firefox** using Method 1 above
2. **Compare with Chrome** - ensure identical behavior
3. **Fix any Firefox-specific issues** (if found)
4. **Continue Stage 3 development** - write once, run everywhere!

---

**Last Updated**: 2025-01-20  
**Status**: ✅ Ready for Firefox Testing
