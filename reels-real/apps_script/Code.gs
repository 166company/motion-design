/**
 * Yük.az Reels → Google Drive köçürücü.
 * Hər saat GitHub "reels-drop" branch-indən son günlərin video + cover + caption fayllarını
 * Drive-da "Yük.az Reels/YYYY-MM-DD" qovluğuna yazır.
 * GitHub API istifadə etmir (anonim API limiti Apps Script-də tez dolur) — birbaşa raw.githubusercontent.com.
 * Quraşdırma: bu kodu skript redaktoruna yapışdır, Services → Drive API (v3) əlavə et, setup() funksiyasını BİR DƏFƏ işə sal və icazə ver.
 */
const RAW = 'https://raw.githubusercontent.com/166company/motion-design/reels-drop/';
const ROOT_NAME = 'Yük.az Reels';
const FOLDER = 'application/vnd.google-apps.folder';
const DAYS_BACK = 3;   // bugün + son 3 gün yoxlanır

function setup() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncReels').timeBased().everyHours(1).create();
  syncReels();
}

function children_(parentId, extraQ) {
  const q = "'" + parentId + "' in parents and trashed = false" + (extraQ ? ' and ' + extraQ : '');
  return (Drive.Files.list({q: q, fields: 'files(id,name)', pageSize: 100}).files) || [];
}

function rootId_() {
  const p = PropertiesService.getScriptProperties();
  const id = p.getProperty('ROOT_ID');
  if (id) { try { const f = Drive.Files.get(id, {fields: 'id,trashed'}); if (!f.trashed) return id; } catch (e) {} }
  const f = Drive.Files.create({name: ROOT_NAME, mimeType: FOLDER});
  p.setProperty('ROOT_ID', f.id);
  return f.id;
}

function syncReels() {
  const root = rootId_();
  for (let k = 0; k <= DAYS_BACK; k++) {
    const d = Utilities.formatDate(new Date(Date.now() - k * 86400000), 'Asia/Baku', 'yyyy-MM-dd');
    const names = ['yukaz_reel_' + d + '.mp4', 'yukaz_cover_' + d + '.jpg', 'yukaz_caption_' + d + '.txt'];
    const blobs = [];
    names.forEach(n => {
      const r = UrlFetchApp.fetch(RAW + d + '/' + encodeURIComponent(n), {muteHttpExceptions: true});
      if (r.getResponseCode() === 200) blobs.push(r.getBlob().setName(n));
    });
    if (!blobs.length) continue;
    const found = children_(root, "mimeType = '" + FOLDER + "' and name = '" + d + "'");
    const folderId = found.length ? found[0].id : Drive.Files.create({name: d, mimeType: FOLDER, parents: [root]}).id;
    const have = {};
    children_(folderId).forEach(f => have[f.name] = true);
    blobs.filter(b => !have[b.getName()]).forEach(b => {
      Drive.Files.create({name: b.getName(), parents: [folderId]}, b);
      console.log('Drive: ' + d + '/' + b.getName());
    });
  }
}
