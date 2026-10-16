/**
 * KOST KOMAR — Profil Penghuni
 * Backend Google Apps Script + Google Sheets + Google Drive.
 * Jalankan setupKostKomar() sekali, lalu setel admin dengan setAdminPassword(email, password).
 */
const APP = {
  title: 'Kost Komar',
  residentsSheet: 'Residents',
  adminsSheet: 'Admins',
  auditSheet: 'AuditLog',
  maxPhotoBytes: 1024 * 1024,
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp']
};
const RESIDENT_HEADERS = ['id','fullName','roomNumber','description','status','published','consentAt','photoFileId','createdAt','updatedAt'];
const ADMIN_HEADERS = ['email','active','salt','passwordHash','iterations','addedAt'];
const AUDIT_HEADERS = ['timestamp','adminEmail','action','residentId','details'];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle(APP.title + ' — Profil Penghuni')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function setupKostKomar() {
  const p = PropertiesService.getScriptProperties();
  let spreadsheetId = p.getProperty('SPREADSHEET_ID');
  let photoFolderId = p.getProperty('PHOTO_FOLDER_ID');
  if (!spreadsheetId) {
    const ss = SpreadsheetApp.create('Kost Komar — Database Penghuni');
    spreadsheetId = ss.getId();
    p.setProperty('SPREADSHEET_ID', spreadsheetId);
  }
  if (!photoFolderId) {
    const folder = DriveApp.createFolder('Kost Komar — Foto Penghuni (PRIVATE)');
    photoFolderId = folder.getId();
    p.setProperty('PHOTO_FOLDER_ID', photoFolderId);
  }
  const ss = SpreadsheetApp.openById(spreadsheetId);
  ensureSheet_(ss, APP.residentsSheet, RESIDENT_HEADERS);
  ensureSheet_(ss, APP.adminsSheet, ADMIN_HEADERS);
  ensureSheet_(ss, APP.auditSheet, AUDIT_HEADERS);
  DriveApp.getFolderById(photoFolderId).setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  Logger.log('Setup selesai. Spreadsheet: ' + ss.getUrl());
  Logger.log('Tambahkan akun admin dengan menjalankan setAdminPassword(email, password).');
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1,1,1,headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    sh.getRange(1,1,1,headers.length).setFontWeight('bold');
    sh.autoResizeColumns(1, headers.length);
  } else {
    const existing = sh.getRange(1,1,1,headers.length).getDisplayValues()[0];
    if (headers.some((h,i) => existing[i] !== h)) {
      throw new Error('Header sheet "' + name + '" tidak sesuai. Pastikan urutan kolom: ' + headers.join(', '));
    }
  }
  return sh;
}

function setAdminPassword(email, password) {
  email = String(email || '').trim().toLowerCase();
  password = String(password || '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Format email tidak valid.');
  if (password.length < 14 || password.length > 200) throw new Error('Password harus 14–200 karakter.');
  const sh = getSheet_(APP.adminsSheet);
  const row = findAdminRow_(sh, email);
  const salt = Utilities.getUuid() + Utilities.getUuid();
  const iterations = 20000;
  const hash = passwordHash_(password, salt, iterations);
  const values = [email, true, salt, hash, iterations, new Date().toISOString()];
  if (row) sh.getRange(row,1,1,ADMIN_HEADERS.length).setValues([values]);
  else sh.appendRow(values);
  Logger.log('Password admin disetel untuk ' + email + '. Jangan simpan password di source code.');
}

function loginAdmin(email, password) {
  email = String(email || '').trim().toLowerCase();
  password = String(password || '');
  if (email.length > 254 || password.length > 200 || !email || !password) throw new Error('Email atau password salah.');
  const sh = getSheet_(APP.adminsSheet);
  const row = findAdminRow_(sh, email);
  if (!row) {
    passwordHash_(password, 'dummy-salt-for-timing', 20000);
    throw new Error('Email atau password salah.');
  }
  const data = sh.getRange(row,1,1,ADMIN_HEADERS.length).getValues()[0];
  const active = data[1] === true || String(data[1]).toUpperCase() === 'TRUE' || String(data[1]).toUpperCase() === 'ACTIVE';
  const salt = String(data[2] || '');
  const expected = String(data[3] || '');
  const iterations = Math.max(10000, Math.min(50000, Number(data[4]) || 20000));
  const actual = passwordHash_(password, salt, iterations);
  if (!active || !salt || !expected || !constantTimeEquals_(actual, expected)) throw new Error('Email atau password salah.');
  const token = Utilities.getUuid().replace(/-/g,'') + Utilities.getUuid().replace(/-/g,'');
  CacheService.getScriptCache().put('admin-session:' + token, JSON.stringify({email, createdAt:Date.now()}), 1800);
  audit_(email, 'ADMIN_LOGIN', '', 'Admin login successful');
  return {ok:true, token, email, expiresInSeconds:1800};
}

function logoutAdmin(token) {
  CacheService.getScriptCache().remove('admin-session:' + validateTokenShape_(token));
  return {ok:true};
}

function requireAdmin_(token) {
  token = validateTokenShape_(token);
  const raw = CacheService.getScriptCache().get('admin-session:' + token);
  if (!raw) throw new Error('Sesi berakhir. Silakan login kembali.');
  let session;
  try { session = JSON.parse(raw); } catch (e) { throw new Error('Sesi tidak valid. Silakan login kembali.'); }
  const email = String(session.email || '').trim().toLowerCase();
  const row = findAdminRow_(getSheet_(APP.adminsSheet), email);
  if (!row) throw new Error('Akun admin tidak lagi diizinkan.');
  const data = getSheet_(APP.adminsSheet).getRange(row,1,1,ADMIN_HEADERS.length).getValues()[0];
  const active = data[1] === true || String(data[1]).toUpperCase() === 'TRUE' || String(data[1]).toUpperCase() === 'ACTIVE';
  if (!active) throw new Error('Akun admin tidak lagi aktif.');
  return {email};
}

function validateTokenShape_(token) {
  token = String(token || '');
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Login admin diperlukan.');
  return token;
}

function getPublicResidents() {
  return getResidents_()
    .filter(r => r.status === 'ACTIVE' && r.published)
    .map(r => ({id:r.id, fullName:r.fullName, roomNumber:r.roomNumber, description:r.description, photoDataUrl:getPhotoDataUrl_(r.photoFileId)}));
}

function adminListResidents(token) {
  const who = requireAdmin_(token);
  audit_(who.email, 'LIST_RESIDENTS', '', 'Admin opened resident list');
  return getResidents_().map(r => ({
    id:r.id, fullName:r.fullName, roomNumber:r.roomNumber, description:r.description,
    status:r.status, published:r.published, hasPhoto:!!r.photoFileId,
    createdAt:r.createdAt, updatedAt:r.updatedAt
  }));
}

function saveResident(token, input) {
  const who = requireAdmin_(token);
  if (!input || typeof input !== 'object') throw new Error('Data penghuni tidak valid.');
  const fullName = cleanString_(input.fullName,160);
  const roomNumber = cleanString_(input.roomNumber,40);
  const description = cleanString_(input.description || '',500);
  const status = input.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE';
  const published = input.published === true && status === 'ACTIVE';
  if (!fullName || !roomNumber) throw new Error('Nama lengkap dan nomor kamar wajib diisi.');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = getSheet_(APP.residentsSheet);
    const residents = getResidents_();
    const id = cleanString_(input.id || '',80) || Utilities.getUuid();
    const old = residents.find(r => r.id === id);
    let photoFileId = old ? old.photoFileId : '';
    let newPhotoFileId = '';
    if (input.photo) {
      newPhotoFileId = savePhoto_(input.photo,id);
      photoFileId = newPhotoFileId;
    }
    const now = new Date().toISOString();
    const rowObj = {
      id, fullName, roomNumber, description, status, published,
      consentAt: published ? (old && old.published && old.consentAt ? old.consentAt : now) : '',
      photoFileId, createdAt:old ? old.createdAt : now, updatedAt:now
    };
    const values = RESIDENT_HEADERS.map(h => rowObj[h] === undefined ? '' : rowObj[h]);
    const row = findRowById_(sh,id);
    if (row) sh.getRange(row,1,1,values.length).setValues([values]);
    else sh.appendRow(values);
    if (old && old.photoFileId && newPhotoFileId && old.photoFileId !== newPhotoFileId) {
      try { DriveApp.getFileById(old.photoFileId).setTrashed(true); } catch (e) {}
    }
    audit_(who.email, old ? 'UPDATE_RESIDENT' : 'CREATE_RESIDENT', id, 'Resident saved');
    return {ok:true,id};
  } finally { lock.releaseLock(); }
}

function archiveResident(token,id) {
  const who = requireAdmin_(token);
  id = cleanString_(id,80);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = getSheet_(APP.residentsSheet);
    const row = findRowById_(sh,id);
    if (!row) throw new Error('Data penghuni tidak ditemukan.');
    sh.getRange(row,5).setValue('ARCHIVED');
    sh.getRange(row,6,1,2).setValues([[false,'']]);
    sh.getRange(row,10).setValue(new Date().toISOString());
    audit_(who.email,'ARCHIVE_RESIDENT',id,'Resident archived');
    return {ok:true};
  } finally { lock.releaseLock(); }
}

function deleteResident(token,id) {
  const who = requireAdmin_(token);
  id = cleanString_(id,80);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = getSheet_(APP.residentsSheet);
    const row = findRowById_(sh,id);
    if (!row) throw new Error('Data penghuni tidak ditemukan.');
    const photoId = sh.getRange(row,8).getValue();
    sh.deleteRow(row);
    if (photoId) { try { DriveApp.getFileById(String(photoId)).setTrashed(true); } catch(e) {} }
    audit_(who.email,'DELETE_RESIDENT',id,'Resident deleted');
    return {ok:true};
  } finally { lock.releaseLock(); }
}

function getResidents_() {
  const sh = getSheet_(APP.residentsSheet);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2,1,sh.getLastRow()-1,RESIDENT_HEADERS.length).getValues().map(row => {
    const o = {};
    RESIDENT_HEADERS.forEach((h,i) => o[h] = row[i]);
    o.id = String(o.id || '');
    o.fullName = String(o.fullName || '');
    o.roomNumber = String(o.roomNumber || '');
    o.description = String(o.description || '');
    o.status = String(o.status || 'ACTIVE');
    o.published = o.published === true || String(o.published).toUpperCase() === 'TRUE';
    o.consentAt = String(o.consentAt || '');
    o.photoFileId = String(o.photoFileId || '');
    o.createdAt = String(o.createdAt || '');
    o.updatedAt = String(o.updatedAt || '');
    return o;
  });
}

function savePhoto_(photo,id) {
  if (!photo || typeof photo !== 'object') throw new Error('File foto tidak valid.');
  const mime = String(photo.mimeType || '').toLowerCase();
  if (!APP.allowedMimeTypes.includes(mime)) throw new Error('Format foto harus JPG, PNG, atau WebP.');
  const b64 = String(photo.base64 || '');
  if (!b64 || b64.length > Math.ceil(APP.maxPhotoBytes*4/3)+16) throw new Error('Ukuran foto maksimal 1 MB.');
  const bytes = Utilities.base64Decode(b64);
  if (!bytes.length || bytes.length > APP.maxPhotoBytes || !hasValidImageSignature_(bytes,mime)) throw new Error('Foto tidak valid atau melebihi 1 MB.');
  const folderId = PropertiesService.getScriptProperties().getProperty('PHOTO_FOLDER_ID');
  if (!folderId) throw new Error('Folder foto belum dikonfigurasi. Jalankan setupKostKomar().');
  const ext = mime === 'image/jpeg' ? 'jpg' : (mime === 'image/png' ? 'png' : 'webp');
  const blob = Utilities.newBlob(bytes,mime,'resident-'+id+'.'+ext);
  const file = DriveApp.getFolderById(folderId).createFile(blob);
  file.setName('KostKomar-'+id+'-'+Date.now()+'.'+ext);
  file.setSharing(DriveApp.Access.PRIVATE,DriveApp.Permission.NONE);
  return file.getId();
}

function getPhotoDataUrl_(fileId) {
  if (!fileId) return '';
  try {
    const blob = DriveApp.getFileById(fileId).getBlob();
    const mime = blob.getContentType();
    if (!APP.allowedMimeTypes.includes(mime)) return '';
    const bytes = blob.getBytes();
    if (bytes.length > APP.maxPhotoBytes) return '';
    return 'data:'+mime+';base64,'+Utilities.base64Encode(bytes);
  } catch(e) { return ''; }
}

function hasValidImageSignature_(b,mime) {
  if (mime === 'image/jpeg') return b.length>3 && b[0]===-1 && b[1]===-40 && b[2]===-1;
  if (mime === 'image/png') return b.length>8 && b[0]===-119 && b[1]===80 && b[2]===78 && b[3]===71;
  if (mime === 'image/webp') return b.length>12 && b[0]===82 && b[1]===73 && b[2]===70 && b[3]===70 && b[8]===87 && b[9]===69 && b[10]===66 && b[11]===80;
  return false;
}

function passwordHash_(password,salt,iterations) {
  let value = salt+':'+password;
  for (let i=0;i<iterations;i++) value = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,value,Utilities.Charset.UTF_8));
  return value;
}
function constantTimeEquals_(a,b) {
  a=String(a||''); b=String(b||'');
  let diff=a.length^b.length, n=Math.max(a.length,b.length);
  for(let i=0;i<n;i++) diff |= (a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
  return diff===0;
}
function findAdminRow_(sh,email) {
  if (sh.getLastRow()<2) return 0;
  const rows=sh.getRange(2,1,sh.getLastRow()-1,1).getValues();
  for(let i=0;i<rows.length;i++) if(String(rows[i][0]||'').trim().toLowerCase()===email) return i+2;
  return 0;
}
function findRowById_(sh,id) {
  if(sh.getLastRow()<2) return 0;
  const found=sh.getRange(2,1,sh.getLastRow()-1,1).createTextFinder(String(id)).matchEntireCell(true).findNext();
  return found ? found.getRow() : 0;
}
function getSheet_(name) {
  const id=PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if(!id) throw new Error('Jalankan setupKostKomar() terlebih dahulu.');
  const sh=SpreadsheetApp.openById(id).getSheetByName(name);
  if(!sh) throw new Error('Sheet "'+name+'" tidak ditemukan.');
  return sh;
}
function cleanString_(v,max) {
  if(v===null||v===undefined) return '';
  return String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,'').trim().slice(0,max);
}
function audit_(email,action,id,details) {
  try { getSheet_(APP.auditSheet).appendRow([new Date().toISOString(),email,action,id||'',cleanString_(details||'',300)]); }
  catch(e) { console.error('Audit log write failed: '+e); }
}
