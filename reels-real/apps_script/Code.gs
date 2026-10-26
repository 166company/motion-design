/**
 * Yük.az Reels → Google Drive köçürücü.
 * Hər saat GitHub-dakı "reels-drop" branch-ini yoxlayır; YYYY-MM-DD qovluğundakı
 * video + cover + caption fayllarını Drive-da "Yük.az Reels/YYYY-MM-DD" qovluğuna yazır.
 * Quraşdırma: setup() funksiyasını BİR DƏFƏ işə sal və icazə ver.
 */
const REPO = '166company/motion-design';
const BRANCH = 'reels-drop';
const ROOT_NAME = 'Yük.az Reels';

function setup() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncReels').timeBased().everyHours(1).create();
  syncReels();
}

function gh_(path) {
  const r = UrlFetchApp.fetch('https://api.github.com/repos/' + REPO + '/contents/' + path + '?ref=' + BRANCH,
    {headers: {Accept: 'application/vnd.github+json'}, muteHttpExceptions: true});
  return r.getResponseCode() === 200 ? JSON.parse(r.getContentText()) : [];
}

function rootFolder_() {
  const it = DriveApp.getRootFolder().getFoldersByName(ROOT_NAME);
  return it.hasNext() ? it.next() : DriveApp.getRootFolder().createFolder(ROOT_NAME);
}

function syncReels() {
  const root = rootFolder_();
  gh_('').filter(e => e.type === 'dir' && /^\d{4}-\d{2}-\d{2}$/.test(e.name)).forEach(dir => {
    const it = root.getFoldersByName(dir.name);
    const folder = it.hasNext() ? it.next() : root.createFolder(dir.name);
    const have = {};
    const files = folder.getFiles();
    while (files.hasNext()) have[files.next().getName()] = true;
    gh_(dir.name).filter(f => f.type === 'file' && !have[f.name]).forEach(f => {
      const blob = UrlFetchApp.fetch(f.download_url).getBlob().setName(f.name);
      folder.createFile(blob);
      console.log('Drive: ' + dir.name + '/' + f.name);
    });
  });
}
