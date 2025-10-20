import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Smart Scroll',
  version: '0.1.0',
  description: 'Intelligent scrolling for long-form visual content',
  
  permissions: [
    'storage',
    'activeTab',
    'tabs'
  ],
  
  host_permissions: [
    "https://*/*",
    "http://*/*"
  ],
  
  action: {
    default_popup: 'src/popup/popup.html',
    default_icon: {
      16: 'public/icons/icon-16.png',
      32: 'public/icons/icon-32.png',
      48: 'public/icons/icon-48.png',
      128: 'public/icons/icon-128.png'
    }
  },
  
  icons: {
    16: 'public/icons/icon-16.png',
    32: 'public/icons/icon-32.png',
    48: 'public/icons/icon-48.png',
    128: 'public/icons/icon-128.png'
  },
  
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module'
  },
  
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/content-script.ts'],
      css: ['src/content/styles.css'],
      run_at: 'document_idle'
    }
  ],
  
  options_page: 'src/options/options.html'
});
