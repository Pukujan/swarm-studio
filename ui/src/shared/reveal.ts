// "Show in Finder" says the file manager this computer has (web/reveal.js, the same words in the classic Studio):
// the Studio's server runs on the same machine as the page and opens Finder, Explorer or the file manager (#560)
export const revealLabel = (ua: string = navigator.userAgent) =>
  /Windows/i.test(ua) ? 'Show in Explorer' : /Mac OS|Macintosh/i.test(ua) ? 'Show in Finder' : 'Show in folder'
