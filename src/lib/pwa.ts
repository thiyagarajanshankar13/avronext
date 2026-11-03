/**
 * Runs in <head>: registers the service worker (installable app, offline page,
 * share target) and keeps the browser's install prompt for the "Install app"
 * menu item, which can't be re-requested later.
 */
export const PWA_SCRIPT = `(function(){addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__avronextInstall=e;dispatchEvent(new Event('avronext:installable'))});addEventListener('appinstalled',function(){window.__avronextInstall=null;dispatchEvent(new Event('avronext:installable'))});if('serviceWorker' in navigator)addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})})()`
