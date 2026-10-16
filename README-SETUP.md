# Kost Komar — GitHub Pages 404 Fix

Paket ini menambahkan `index.html` di root repository supaya GitHub Pages menemukan halaman awal.

## Penting: cara kerja paket ini
Website Kost Komar saat ini memakai Google Apps Script (`google.script.run`) untuk membaca Google Sheets dan mengelola foto di Google Drive. API tersebut tidak bisa langsung dijalankan sebagai halaman statis GitHub Pages. Karena itu, paket ini memakai GitHub Pages sebagai halaman depan dan mengarahkan pengunjung ke Web App Google Apps Script untuk fitur penuh. Database dan dashboard admin tetap dijalankan di Apps Script.

## Langkah
1. Di Google Apps Script, buka **Deploy → Manage deployments**.
2. Salin URL Web App yang berakhiran `/exec`. Jika belum ada deployment, pilih **Deploy → New deployment → Web app**; jalankan sebagai akun pemilik dan pilih akses yang sesuai kebutuhan aplikasi.
3. Buka `index.html`, ganti `PASTE_APPS_SCRIPT_WEB_APP_EXEC_URL_HERE` dengan URL `/exec` tersebut.
4. Unggah `index.html` ke root repository `komarzoo27/KostKomar` (bukan di dalam folder).
5. Commit perubahan ke branch `main`.
6. Di GitHub repository, buka **Settings → Pages**. Pilih **Deploy from a branch**, branch `main`, folder `/(root)`, lalu Save.
7. Tunggu deployment selesai dan buka `https://komarzoo27.github.io/KostKomar/`.

## Catatan
- Saya tidak dapat melakukan push langsung ke repository dari koneksi saat ini karena aksesnya hanya baca.
- Paket ini memperbaiki halaman 404 dengan halaman depan/redirect. Konten dinamis dan autentikasi tetap berada di Apps Script; ini bukan pemindahan seluruh backend ke GitHub Pages.
- Jangan memasukkan password, token admin, ID rahasia, atau kredensial Google ke file frontend.
