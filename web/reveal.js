// @ts-check
// "Show in Finder" says the file manager this computer has: the Studio's server runs on the same machine as the
// page, and its reveal route opens Finder on a Mac, Explorer on Windows and the file manager elsewhere (#560)

/** @param {string} [ua] the browser's user agent */
export function revealLabel(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent) {
  return /Windows/i.test(ua) ? 'Show in Explorer' : /Mac OS|Macintosh/i.test(ua) ? 'Show in Finder' : 'Show in folder'
}
