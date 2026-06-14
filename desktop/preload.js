// Minimal, safe preload. Exposes only the app version to the renderer.
const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('roblox2', {
  version: process.env.npm_package_version || '1.0.0',
  desktop: true
});
