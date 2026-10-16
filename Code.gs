/**
 * KOST KOMAR — Website Profil Penghuni
 * Backend Google Apps Script + Google Sheets + private Google Drive photos.
 *
 * First run setupKostKomar() from the Apps Script editor.
 * Set Script Properties:
 *   ADMIN_EMAILS = admin1@example.com,admin2@example.com
 *
 * Deploy as Web App: Execute as ME; Who has access: Anyone.
 * Admin endpoints verify email/password authentication ID tokens server-side.
 */

const APP = {
  title: 'Kost Komar',
  residentsSheet: 'Residents',
  adminsSheet: 'Admins',
  auditSheet: 'AuditLog',
  maxPhotoBytes: 1024 * 1024,
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  maxNameLength: 160,
  maxRoomLength: 40,
  maxDescriptionLength: 500
};

const RESIDENT_HEADERS = [
  'id', 'fullName', 'roomNumber', 'description', 'status',
  'published', 'consentAt', 'photoFileId', 'createdAt', 'updatedAt'
];
const ADMIN_HEADERS = ['email', 'active', 'salt', 'passwordHash', 'iterations', 'addedAt'];
const AUDIT_HEADERS = ['timestamp', 'adminEmail', 'action', 'residentId', 'details'];

function doGet() {
  const template = HtmlService.createTemplateFromFile('Index');
  template.appTitle = APP.title;
  return template.evaluate()
    .setTitle(APP.title + ' — Profil Penghuni')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Run once manually from the Apps Script editor.
 * Creates a spreadsheet and a private Drive folder if not configured yet.
 * Then fill the Admins sheet and Script Properties as described in README.
 */
function setupKostKomar() {
  const props = PropertiesService.getScriptProperties();
  let spreadsheetId = props.getProperty('SPREADSHEET_ID');
  let photoFolderId = props.getProperty('PHOTO_FOLDER_ID');

  if (!spreadsheetId) {
    const ss = SpreadsheetApp.create('Kost Komar — Database Penghuni');
    spreadsheetId = ss.getId();
    props.setProperty('SPREADSHEET_ID', spreadsheetId);
  }
  if (!photoFolderId) {
    const folder = DriveApp.createFolder('Kost Komar — Foto Penghuni (PRIVATE)');
    photoFolderId = folder.getId();
    props.setProperty('PHOTO_FOLDER_ID', photoFolderId);
  }

  const ss = SpreadsheetApp.openById(spreadsheetId);
  ensureSheet_(ss, APP.residentsSheet, RESIDENT_HEADERS);
  ensureSheet_(ss, APP.adminsSheet, ADMIN_HEADERS);
  ensureSheet_(ss, APP.auditSheet, AUDIT_HEADERS);

  // Remove accidental public sharing from the photo folder. The folder owner remains responsible
  // for reviewing inherited/shared permissions in Drive.
  const folder = DriveApp.getFolderById(photoFolderId);
  folder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);

  Logger.log('Setup selesai.');
  Logger.log('Spreadsheet: ' + ss.getUrl());
  Logger.log('Photo folder ID (keep private): ' + photoFolderId);
  Logger.log('Buat akun admin dengan menjalankan setAdminPassword(email, password) dari editor.');
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sh.autoResizeColumns(1, headers.length);
  } else {
    const current = sh.getRange(1, 1, 1, Math.max(headers.length, sh.getLastColumn())).getValues()[0];
    const missing = headers.filter((h, i) => current[i] !== h);
    if (missing.length) throw new Error('Header sheet "' + name + '" tidak sesuai. Jangan ubah urutan header.');
  }
  return sh;
}

/** Public endpoint: returns only explicitly published, active residents. */
function getPublicResidents() {
  const rows = getResidents_();
  return rows
    .filter(r => r.status === 'ACTIVE' && r.published === true)
    .map(r => ({
      id: r.id,
      fullName: r.fullName,
      roomNumber: r.roomNumber,
      description: r.description,
      photoDataUrl: getPublicPhotoDataUrl_(r.photoFileId)
    }));
}

/** Public endpoint: only returns a single published profile. */
function getPublicResident(id) {
  id = cleanString_(id, 80);
  const r = getResidents_().find(x => x.id === id && x.status === 'ACTIVE' && x.published === true);
  if (!r) return null;
  return {
    id: r.id,
    fullName: r.fullName,
    roomNumber: r.roomNumber,
    description: r.description,
    photoDataUrl: getPublicPhotoDataUrl_(r.photoFileId)
  };
}

/**
 * Run manually from Apps Script editor to create/reset an admin password.
 * Example: setAdminPassword('admin@example.com', 'use-a-unique-password-14-chars-or-more')
 * Never call this function from the public UI or leave a real password in source code.
 */
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
  if (row) sh.getRange(row, 1, 1, ADMIN_HEADERS.length).setValues([values]);
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
  const data = sh.getRange(row, 1, 1, ADMIN_HEADERS.length).getValues()[0];
  const active = data[1] === true || String(data[1]).toUpperCase() === 'TRUE' || String(data[1]).toUpperCase() === 'ACTIVE';
  const salt = String(data[2] || '');
  const expected = String(data[3] || '');
  const iterations = Math.max(10000, Math.min(50000, Number(data[4]) || 20000));
  const actual = passwordHash_(password, salt, iterations);
  if (!active || !salt || !expected || !constantTimeEquals_(actual, expected)) throw new Error('Email atau password salah.');
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('admin-session:' + token, JSON.stringify({email:email, createdAt:Date.now()}), 1800);
  audit_(email, 'ADMIN_LOGIN', '', 'Admin login successful');
  return {ok:true, token:token, email:email, expiresInSeconds:1800};
}

function logoutAdmin(sessionToken) {
  const token = validateTokenShape_(sessionToken);
  CacheService.getScriptCache().remove('admin-session:' + token);
  return {ok:true};
}

function requireAdmin_(sessionToken) {
  const token = validateTokenShape_(sessionToken);
  const raw = CacheService.getScriptCache().get('admin-session:' + token);
  if (!raw) throw new Error('Sesi berakhir. Silakan login kembali.');
  let session;
  try { session = JSON.parse(raw); } catch (e) { throw new Error('Sesi tidak valid. Silakan login kembali.'); }
  const email = String(session.email || '').trim().toLowerCase();
  const sh = getSheet_(APP.adminsSheet);
  const row = findAdminRow_(sh, email);
  if (!row) throw new Error('Akun admin tidak lagi diizinkan.');
  const data = sh.getRange(row, 1, 1, ADMIN_HEADERS.length).getValues()[0];
  const active = data[1] === true || String(data[1]).toUpperCase() === 'TRUE' || String(data[1]).toUpperCase() === 'ACTIVE';
  if (!active) throw new Error('Akun admin tidak lagi aktif.');
  return {email:email};
}

function validateTokenShape_(token) {
  token = String(token || '');
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Login admin diperlukan.');
  return token;
}

function findAdminRow_(sh, email) {
  if (sh.getLastRow() < 2) return 0;
  const values = sh.getRange(2, 1, sh.getLastRow()-1, 1).getValues();
  for (let i=0; i<values.length; i++) if (String(values[i][0] || '').trim().toLowerCase() === email) return i+2;
  return 0;
}

function passwordHash_(password, salt, iterations) {
  // Salted iterative SHA-256; see README for production limitations.
  let value = salt + ':' + password;
  for (let i=0; i<iterations; i++) {
    value = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8));
  }
  return value;
}

function constantTimeEquals_(a,b) {
  a=String(a||''); b=String(b||'');
  let diff=a.length ^ b.length; const n=Math.max(a.length,b.length);
  for(let i=0;i<n;i++) diff |= (a.charCodeAt(i)||0) ^ (b.charCodeAt(i)||0);
  return diff===0;
}

function adminListResidents(sessionToken) {
  const identity = requireAdmin_(sessionToken);
  audit_(identity.email, 'LIST_RESIDENTS', '', 'Admin opened resident list');
  return getResidents_().map(r => ({
    id: r.id,
    fullName: r.fullName,
    roomNumber: r.roomNumber,
    description: r.description,
    status: r.status,
    published: r.published,
    consentAt: r.consentAt,
    hasPhoto: !!r.photoFileId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  }));
}

/**
 * Save resident. For a new photo, pass photo = {mimeType, base64, fileName}.
 * Existing photo remains unchanged if photo is omitted.
 */
function saveResident(sessionToken, input) {
  const identity = requireAdmin_(sessionToken);
  if (!input || typeof input !== 'object') throw new Error('Data penghuni tidak valid.');

  const fullName = cleanString_(input.fullName, APP.maxNameLength);
  const roomNumber = cleanString_(input.roomNumber, APP.maxRoomLength);
  const description = cleanString_(input.description || '', APP.maxDescriptionLength);
  const status = input.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE';
  const published = input.published === true;
  if (!fullName) throw new Error('Nama lengkap wajib diisi.');
  if (!roomNumber) throw new Error('Nomor kamar wajib diisi.');

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = getSheet_(APP.residentsSheet);
    const rows = getResidents_();
    const id = cleanString_(input.id || '', 80) || Utilities.getUuid();
    const existing = rows.find(r => r.id === id);
    let photoFileId = existing ? existing.photoFileId : '';
    let newPhotoFileId = '';

    if (input.photo) {
      newPhotoFileId = savePhoto_(input.photo, id);
      photoFileId = newPhotoFileId;
    }

    const now = new Date().toISOString();
    const consentAt = published
      ? (existing && existing.published && existing.consentAt ? existing.consentAt : now)
      : '';

    const rowObject = {
      id, fullName, roomNumber, description, status, published, consentAt,
      photoFileId,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now
    };

    const values = RESIDENT_HEADERS.map(h => rowObject[h] === undefined ? '' : rowObject[h]);
    const rowNumber = findRowById_(sh, id);
    if (rowNumber) {
      sh.getRange(rowNumber, 1, 1, values.length).setValues([values]);
    } else {
      sh.appendRow(values);
    }

    // Delete replaced photo only after the spreadsheet update succeeds.
    if (existing && existing.photoFileId && newPhotoFileId && existing.photoFileId !== newPhotoFileId) {
      try { DriveApp.getFileById(existing.photoFileId).setTrashed(true); } catch (e) {}
    }
    audit_(identity.email, existing ? 'UPDATE_RESIDENT' : 'CREATE_RESIDENT', id, 'Resident saved');
    return { ok: true, id: id };
  } finally {
    lock.releaseLock();
  }
}

function archiveResident(sessionToken, id) {
  const identity = requireAdmin_(sessionToken);
  return setResidentStatus_(identity.email, id, 'ARCHIVED');
}

function deleteResident(sessionToken, id) {
  const identity = requireAdmin_(sessionToken);
  id = cleanString_(id, 80);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = getSheet_(APP.residentsSheet);
    const row = findRowById_(sh, id);
    if (!row) throw new Error('Data penghuni tidak ditemukan.');
    const photoId = sh.getRange(row, 8).getValue();
    sh.deleteRow(row);
    if (photoId) {
      try { DriveApp.getFileById(String(photoId)).setTrashed(true); } catch (e) {}
    }
    audit_(identity.email, 'DELETE_RESIDENT', id, 'Resident deleted');
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function setResidentStatus_(email, id, status) {
  id = cleanString_(id, 80);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = getSheet_(APP.residentsSheet);
    const row = findRowById_(sh, id);
    if (!row) throw new Error('Data penghuni tidak ditemukan.');
    sh.getRange(row, 5).setValue(status);
    if (status === 'ARCHIVED') sh.getRange(row, 6, 1, 2).setValues([[false, '']]);
    sh.getRange(row, 10).setValue(new Date().toISOString());
    audit_(email, 'ARCHIVE_RESIDENT', id, 'Resident archived');
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function getResidents_() {
  const sh = getSheet_(APP.residentsSheet);
  if (sh.getLastRow() < 2) return [];
  const values = sh.getRange(2, 1, sh.getLastRow() - 1, RESIDENT_HEADERS.length).getValues();
  return values.map(row => {
    const o = {};
    RESIDENT_HEADERS.forEach((h, i) => o[h] = row[i]);
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

function getPublicPhotoDataUrl_(fileId) {
  if (!fileId) return '';
  try {
    const file = DriveApp.getFileById(fileId);
    const blob = file.getBlob();
    const mime = blob.getContentType();
    if (APP.allowedMimeTypes.indexOf(mime) === -1) return '';
    const bytes = blob.getBytes();
    if (bytes.length > APP.maxPhotoBytes) return '';
    return 'data:' + mime + ';base64,' + Utilities.base64Encode(bytes);
  } catch (e) {
    return '';
  }
}

function savePhoto_(photo, residentId) {
  if (!photo || typeof photo !== 'object') throw new Error('File foto tidak valid.');
  const mime = String(photo.mimeType || '').toLowerCase();
  if (APP.allowedMimeTypes.indexOf(mime) === -1) throw new Error('Format foto harus JPG, PNG, atau WebP.');
  const b64 = String(photo.base64 || '');
  if (!b64 || b64.length > Math.ceil(APP.maxPhotoBytes * 4 / 3) + 16) throw new Error('Ukuran foto maksimal 1 MB.');
  const bytes = Utilities.base64Decode(b64);
  if (!bytes.length || bytes.length > APP.maxPhotoBytes) throw new Error('Ukuran foto maksimal 1 MB.');

  // Basic signature checks reduce risk from mismatched MIME declarations.
  if (!hasValidImageSignature_(bytes, mime)) throw new Error('Isi file tidak cocok dengan format gambar.');
  const ext = mime === 'image/jpeg' ? 'jpg' : (mime === 'image/png' ? 'png' : 'webp');
  const blob = Utilities.newBlob(bytes, mime, 'resident-' + residentId + '.' + ext);
  const folderId = PropertiesService.getScriptProperties().getProperty('PHOTO_FOLDER_ID');
  if (!folderId) throw new Error('Folder foto belum dikonfigurasi.');
  const folder = DriveApp.getFolderById(folderId);
  const file = folder.createFile(blob);
  file.setName('KostKomar-' + residentId + '-' + Date.now() + '.' + ext);
  // Keep file private; no anyone-with-link sharing.
  file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  return file.getId();
}

function hasValidImageSignature_(bytes, mime) {
  if (mime === 'image/jpeg') return bytes.length > 3 && bytes[0] === -1 && bytes[1] === -40 && bytes[2] === -1;
  if (mime === 'image/png') return bytes.length > 8 && bytes[0] === -119 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
  if (mime === 'image/webp') return bytes.length > 12 && bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70 &&
    bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80;
  return false;
}

function getSheet_(name) {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Jalankan setupKostKomar() terlebih dahulu.');
  const sh = SpreadsheetApp.openById(id).getSheetByName(name);
  if (!sh) throw new Error('Sheet "' + name + '" tidak ditemukan.');
  return sh;
}

function findRowById_(sh, id) {
  if (sh.getLastRow() < 2) return 0;
  const found = sh.getRange(2, 1, sh.getLastRow() - 1, 1)
    .createTextFinder(String(id)).matchEntireCell(true).findNext();
  return found ? found.getRow() : 0;
}

function cleanString_(value, maxLength) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLength);
}

function audit_(email, action, residentId, details) {
  try {
    getSheet_(APP.auditSheet).appendRow([new Date().toISOString(), email, action, residentId || '', cleanString_(details || '', 300)]);
  } catch (e) {
    // Audit failure must not expose internal details to the client.
    console.error('Audit log write failed: ' + e);
  }
}
