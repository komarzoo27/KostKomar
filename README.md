# Website Profil Penghuni — Kost Komar

Implementasi Google Apps Script + Google Sheets + Google Drive. Halaman publik tidak memerlukan login. Operasi admin memerlukan email/password authentication ID token yang diverifikasi server-side dan email yang terdaftar pada allowlist.

## Berkas
- `Code.gs`: backend, skema Sheets, autentikasi, validasi, Drive, audit log.
- `Index.html`: UI responsif publik + dashboard admin; logo sudah disematkan pada header.
- `logo-kost-komar.png`: aset logo asli untuk penggunaan atau penggantian desain selanjutnya.
- `appsscript.json`: manifest Apps Script.

## Sebelum mulai
1. Gunakan akun Google milik pengelola Kost Komar.
2. Buka https://script.google.com dan buat proyek Apps Script baru.
3. Buat file `Code.gs`, salin isi dari file yang disediakan.
4. Buat file HTML bernama `Index`, salin isi `Index.html`.
5. Di Project Settings, aktifkan "Show appsscript.json manifest file" jika belum terlihat; ganti manifest dengan file yang disediakan bila perlu.
6. Jalankan `setupKostKomar()` dari editor Apps Script dan setujui izin Google Sheets/Drive. Jalankan sekali.
7. Buka Execution log. Ambil URL spreadsheet yang dibuat. Di Spreadsheet, sheet `Admins` memiliki header `email | active | addedAt`.
8. Tambahkan email Google pengelola pada baris 2, misalnya:
   - kolom A: `admin@contoh.com`
   - kolom B: `TRUE`
   - kolom C: tanggal penambahan (opsional)
   Gunakan email yang benar-benar dimiliki admin. Jangan menambahkan email publik yang tidak dipercaya.
9. Simpan spreadsheet dan folder foto secara privat. Jangan aktifkan "Anyone with the link" pada spreadsheet atau folder foto.

## Membuat akun admin (email/password)
1. Jalankan `setupKostKomar()` sekali dari editor Apps Script.
2. Sheet `Admins` menggunakan header: `email | active | salt | passwordHash | iterations | addedAt`.
3. Dari editor Apps Script, jalankan `setAdminPassword('admin@contoh.com', 'PASSWORD_UNIK_MINIMAL_14_KARAKTER')` dengan email milik pengelola dan password unik minimal 14 karakter.
4. Jangan simpan password nyata di kode permanen, chat, atau file proyek. Hapus pemanggilan sementara setelah dijalankan.
5. Password disimpan sebagai hash bersalt, bukan teks biasa. Untuk reset, jalankan kembali `setAdminPassword(email, passwordBaru)`.
6. Batasi akses editor Apps Script dan spreadsheet hanya kepada pengelola tepercaya.

**Batasan keamanan:** kode memakai salted iterative SHA-256 dan sesi CacheService 30 menit. Ini menghindari password teks biasa, tetapi bukan pengganti autentikasi produksi berbasis Argon2id/scrypt/bcrypt dan proteksi brute-force terkelola. CacheService dapat menghapus sesi lebih awal. Untuk risiko tinggi, gunakan penyedia autentikasi khusus.

## Deploy
1. Pastikan `SPREADSHEET_ID` dan `PHOTO_FOLDER_ID` ada di Script Properties. Dua ID terakhir dibuat oleh `setupKostKomar()`.
2. Jika sebelumnya sudah menjalankan versi Google Identity Services, periksa sheet `Admins`. Ganti header menjadi `email | active | salt | passwordHash | iterations | addedAt` sebelum menjalankan versi baru; buat ulang sheet `Admins` jika masih berisi skema lama. Setel password admin melalui `setAdminPassword()`.
2. Klik Deploy → New deployment → Select type: Web app.
3. Execute as: **Me** (akun pengelola yang memiliki spreadsheet dan folder foto).
4. Who has access: **Anyone** untuk halaman direktori publik.
5. Deploy, lalu buka URL yang berakhiran `/exec`.
6. Setiap kali mengubah kode, pilih Deploy → Manage deployments → Edit → New version → Deploy. Buka URL `/exec` dan uji kembali.

## Skema data
### Residents
`id, fullName, roomNumber, description, status, published, consentAt, photoFileId, createdAt, updatedAt`

### Admins
`email, active, salt, passwordHash, iterations, addedAt`

### AuditLog
`timestamp, adminEmail, action, residentId, details`

## Pengujian penerimaan
1. Buka `/exec` dalam jendela incognito: daftar publik harus tampil; dashboard admin tidak menampilkan data internal.
2. Tambahkan penghuni melalui admin yang diizinkan, jangan centang publikasi: data harus terlihat di admin tetapi tidak di halaman publik.
3. Centang publikasi setelah mendapat persetujuan, simpan: profil harus muncul di publik.
4. Login menggunakan akun Google yang tidak ada di `Admins`: server harus menolak.
5. Coba kirim request langsung ke `saveResident` tanpa ID token valid: server harus menolak.
6. Arsipkan penghuni: profil harus hilang dari publik dan status menjadi ARCHIVED.
7. Coba unggah file >1 MB, SVG, atau file yang hanya menyamar sebagai JPG: server harus menolak.
8. Pastikan folder Drive dan spreadsheet tetap privat.
9. Uji dari ponsel dan desktop.
10. Cek `AuditLog` setelah operasi admin.

## Batasan dan catatan keamanan
- Foto publik dikirim sebagai data URL base64 hanya untuk profil aktif yang `published=TRUE`. Folder Drive tidak perlu dibagikan publik. Foto 1 MB dibatasi untuk mengurangi waktu dan ukuran respons.
- Apps Script memiliki kuota eksekusi, batas durasi, dan batas layanan Google. Untuk jumlah penghuni besar atau trafik tinggi, pertimbangkan backend khusus dan object storage.
- Login memakai hash password dan sesi CacheService; jika sesi hilang atau kedaluwarsa, admin harus login kembali.
- Apps Script web app publik yang berjalan sebagai pemilik harus memvalidasi setiap fungsi admin di server. Jangan mengandalkan UI tersembunyi.
- Token sesi hanya disimpan di memori halaman, tidak ditulis ke localStorage, dan dihapus dari CacheService saat logout.
- email/password authentication memerlukan OAuth client ID yang benar dan pengaturan origin yang cocok. Uji deployment pada URL yang sebenarnya.
- Data foto yang diarsipkan tidak otomatis dihapus. Penghapusan permanen mengirim file foto ke Trash; pastikan kebijakan retensi cocok dengan kebutuhan kost.
- `Admins` sheet hanya boleh diedit pengelola tepercaya. Hak akses spreadsheet harus dibatasi.
- Untuk produksi, pertimbangkan kebijakan privasi, prosedur penarikan persetujuan, backup, dan pembatasan akses ke akun Google pengelola.
