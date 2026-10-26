/**
 * Yük.az Reels → Google Drive köçürücü.
 * Hər saat GitHub-da yeni "daily-YYYY-MM-DD" release-i yoxlayır və
 * video + cover + caption fayllarını Drive-da "Yük.az Reels/YYYY-MM-DD" qovluğuna yazır.
 * Quraşdırma: setup() funksiyasını BİR DƏFƏ işə sal (icazə ver).
 */
const REPO = '166company/motion-design';
const ROOT_NAME = 'Yük.az Reels';

function setup() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncReels').timeBased().everyHours(1).create();
  syncReels();
}

function rootFolder_() {
  const it = DriveApp.getRootFolder().getFoldersByName(ROOT_NAME);
  return it.hasNext() ? it.next() : DriveApp.getRootFolder().createFolder(ROOT_NAME);
}

function syncReels() {
  const res = UrlFetchApp.fetch('https://api.github.com/repos/' + REPO + '/releases?per_page=15',
    {headers: {Accept: 'application/vnd.github+json'}, muteHttpExceptions: true});
  if (res.getResponseCode() !== 200) { console.log('GitHub ' + res.getResponseCode()); return; }
  const root = rootFolder_();
  JSON.parse(res.getContentText())
    .filter(r => /^daily-\d{4}-\d{2}-\d{2}$/.test(r.tag_name))
    .forEach(r => {
      const date = r.tag_name.slice(6);
      const it = root.getFoldersByName(date);
      const folder = it.hasNext() ? it.next() : root.createFolder(date);
      const have = {};
      const files = folder.getFiles();
      while (files.hasNext()) have[files.next().getName()] = true;
      r.assets.forEach(a => {
        if (have[a.name]) return;
        const blob = UrlFetchApp.fetch(a.browser_download_url, {followRedirects: true}).getBlob().setName(a.name);
        folder.createFile(blob);
        console.log('Drive: ' + date + '/' + a.name);
      });
    });
}
