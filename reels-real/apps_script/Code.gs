/**
 * Yük.az Reels → Google Drive köçürücü (156evakuasiyayt@gmail.com hesabında quraşdırılıb).
 * Hər saat GitHub-dakı "reels-drop" branch-ini yoxlayır; YYYY-MM-DD qovluğundakı
 * video + cover + caption fayllarını Drive-da "Yük.az Reels/YYYY-MM-DD" qovluğuna yazır.
 * Yalnız drive.file icazəsi (Drive API v3 qabaqcıl xidməti). Quraşdırma: setup() bir dəfə.
 */
const REPO = '166company/motion-design';
const BRANCH = 'reels-drop';
const ROOT_NAME = 'Yük.az Reels';
const FOLDER = 'application/vnd.google-apps.folder';

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

function children_(parentId, extraQ) {
  const q = "'" + parentId + "' in parents and trashed = false" + (extraQ ? ' and ' + extraQ : '');
  return (Drive.Files.list({q: q, fields: 'files(id,name)', pageSize: 100}).files) || [];
}

function rootId_() {
  const p = PropertiesService.getScriptProperties();
  const id = p.getProperty('ROOT_ID');
  if (id) { try { Drive.Files.get(id, {fields: 'id,trashed'}); return id; } catch (e) {} }
  const f = Drive.Files.create({name: ROOT_NAME, mimeType: FOLDER});
  p.setProperty('ROOT_ID', f.id);
  return f.id;
}

function syncReels() {
  const root = rootId_();
  gh_('').filter(e => e.type === 'dir' && /^\d{4}-\d{2}-\d{2}$/.test(e.name)).forEach(dir => {
    const found = children_(root, "mimeType = '" + FOLDER + "' and name = '" + dir.name + "'");
    const folderId = found.length ? found[0].id : Drive.Files.create({name: dir.name, mimeType: FOLDER, parents: [root]}).id;
    const have = {};
    children_(folderId).forEach(f => have[f.name] = true);
    gh_(dir.name).filter(f => f.type === 'file' && !have[f.name]).forEach(f => {
      const blob = UrlFetchApp.fetch(f.download_url).getBlob().setName(f.name);
      Drive.Files.create({name: f.name, parents: [folderId]}, blob);
      console.log('Drive: ' + dir.name + '/' + f.name);
    });
  });
}
