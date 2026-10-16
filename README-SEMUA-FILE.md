# Kost Komar — Paket Lengkap Website

Paket ini menggabungkan:
- `index.html` di root: halaman GitHub Pages yang otomatis mengarahkan ke aplikasi utama.
- `AppsScript/Code.gs`: backend Google Apps Script.
- `AppsScript/Index.html`: UI direktori penghuni dan dashboard admin.
- `AppsScript/appsscript.json`: manifest Apps Script.
- `AppsScript/logo-kost-komar.png`: logo.

## URL aplikasi utama
https://script.google.com/macros/s/AKfycbxHBKVaV55Xezs8KHaRDiUDYgUAkNos1L3eolWuYNjLCCutR3LUAQlS2Gw55rs0i2bm/exec

## Cara unggah ke GitHub

1. Ekstrak ZIP ini.
2. Buka repository https://github.com/komarzoo27/KostKomar.
3. Unggah file **`index.html` yang berada di root ZIP** ke root repository dan commit ke branch `main`. File root ini yang digunakan GitHub Pages.
4. Unggah juga folder `AppsScript` sebagai cadangan source code Apps Script. Jika ingin mengganti backend, salin isi file dari folder ini ke proyek Apps Script, sesuai nama file.
5. Pastikan **Settings → Pages** menggunakan `Deploy from a branch`, branch `main`, folder `/(root)`.
6. Buka https://komarzoo27.github.io/KostKomar/. Halaman akan mengarahkan pengunjung ke URL Apps Script di atas.

## Cara memperbarui proyek Google Apps Script

1. Buka https://script.google.com dan buka proyek Apps Script yang terkait dengan URL aplikasi.
2. Buka `Code.gs` di folder `AppsScript`, salin seluruh isinya ke file `Code.gs` di editor Apps Script.
3. Buka file HTML bernama `Index` di editor Apps Script (tanpa ekstensi pada nama file), lalu salin isi `AppsScript/Index.html`.
4. Jika perlu, aktifkan tampilan manifest dan sesuaikan `appsscript.json`.
5. Simpan, lalu pilih **Deploy → Manage deployments → Edit → New version → Deploy** agar URL Web App memakai kode terbaru.

## Konfigurasi awal backend

- Jalankan fungsi `setupKostKomar()` sekali dari editor Apps Script dan setujui izin yang diminta.
- Di spreadsheet yang dibuat, sheet `Admins` berisi kolom `email`, `active`, `addedAt`. Masukkan email Google admin pada baris berikutnya dan set `active` menjadi `TRUE`.
- Di **Project Settings → Script Properties**, atur `GOOGLE_OAUTH_CLIENT_ID` dan, bila ingin, `ADMIN_EMAILS` (email dipisahkan koma).
- OAuth Client ID harus sesuai dengan yang dipakai Google Identity Services di aplikasi.
- Jangan membagikan spreadsheet atau folder foto Drive secara publik. Aplikasi hanya memublikasikan profil yang disetujui admin.

## Catatan penting

- GitHub Pages hanya menyajikan file statis; ia tidak menjalankan `google.script.run`. Karena itu `index.html` di root berfungsi sebagai halaman depan/pengarah, sementara fitur database tetap di Apps Script.
- Jangan hapus atau mengganti nama file `index.html` (huruf kecil) di root. `Index.html` (I besar) di folder `AppsScript` adalah template aplikasi Apps Script.
- Saya tidak dapat melakukan commit langsung ke repository dari koneksi saat ini; unggah file ZIP hasil ekstrak secara manual.
