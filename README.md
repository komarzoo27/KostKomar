# Website Profil Penghuni — Kost Komar

Implementasi Google Apps Script + Google Sheets + Google Drive. Halaman publik tidak memerlukan login. Operasi admin memerlukan Google Identity Services ID token yang diverifikasi server-side dan email yang terdaftar pada allowlist.

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

## Konfigurasi Google Identity Services
Admin login memakai Google Identity Services. ID token dikirim ke Apps Script dan diverifikasi menggunakan endpoint tokeninfo Google, lalu email diperiksa terhadap sheet `Admins` atau Script Property `ADMIN_EMAILS`.

1. Buka Google Cloud Console: https://console.cloud.google.com/
2. Buat atau pilih project Google Cloud.
3. Konfigurasikan OAuth consent screen / Google Auth Platform. Isi nama aplikasi dan email dukungan yang benar.
4. Buat OAuth Client ID bertipe **Web application**.
5. Pada Authorized JavaScript origins, masukkan origin `https://script.google.com`. Jika login gagal karena origin tidak cocok pada deployment akun Anda, periksa origin yang ditampilkan browser dan tambahkan hanya origin Google Apps Script yang relevan.
6. Salin Client ID.
7. Di Apps Script → Project Settings → Script Properties, tambahkan:
   - `GOOGLE_OAUTH_CLIENT_ID` = Client ID OAuth Web
   - `ADMIN_EMAILS` = daftar email admin dipisahkan koma (opsional; sheet Admins juga didukung)
8. Jangan menaruh OAuth client secret di frontend. Untuk Google Identity Services ID token, client ID memang digunakan di frontend; server tetap memverifikasi token dan allowlist.

Catatan: konfigurasi OAuth dan aturan akun Google dapat berbeda untuk akun Workspace dan akun Gmail pribadi. Jika Google menolak origin atau aplikasi berada dalam mode testing, tambahkan akun admin sebagai test user atau sesuaikan status publikasi OAuth consent screen. Jangan menonaktifkan pemeriksaan token untuk mengatasi error.

## Deploy
1. Pastikan `GOOGLE_OAUTH_CLIENT_ID`, `SPREADSHEET_ID`, dan `PHOTO_FOLDER_ID` ada di Script Properties. Dua ID terakhir dibuat oleh `setupKostKomar()`.
2. Klik Deploy → New deployment → Select type: Web app.
3. Execute as: **Me** (akun pengelola yang memiliki spreadsheet dan folder foto).
4. Who has access: **Anyone** untuk halaman direktori publik.
5. Deploy, lalu buka URL yang berakhiran `/exec`.
6. Setiap kali mengubah kode, pilih Deploy → Manage deployments → Edit → New version → Deploy. Buka URL `/exec` dan uji kembali.

## Skema data
### Residents
`id, fullName, roomNumber, description, status, published, consentAt, photoFileId, createdAt, updatedAt`

### Admins
`email, active, addedAt`

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
- Endpoint tokeninfo menambah ketergantungan jaringan. Jika verifikasi gagal, operasi admin harus gagal tertutup.
- Apps Script web app publik yang berjalan sebagai pemilik harus memvalidasi setiap fungsi admin di server. Jangan mengandalkan UI tersembunyi.
- Token ID hanya disimpan di memori halaman dan tidak ditulis ke localStorage. Saat logout, token dihapus dari state halaman. Tutup halaman untuk mengakhiri sesi browser sepenuhnya.
- Google Identity Services memerlukan OAuth client ID yang benar dan pengaturan origin yang cocok. Uji deployment pada URL yang sebenarnya.
- Data foto yang diarsipkan tidak otomatis dihapus. Penghapusan permanen mengirim file foto ke Trash; pastikan kebijakan retensi cocok dengan kebutuhan kost.
- `Admins` sheet hanya boleh diedit pengelola tepercaya. Hak akses spreadsheet harus dibatasi.
- Untuk produksi, pertimbangkan kebijakan privasi, prosedur penarikan persetujuan, backup, dan pembatasan akses ke akun Google pengelola.
