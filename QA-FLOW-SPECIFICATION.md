# 🇮🇩 SPESIFIKASI ALUR PENGUJIAN END-TO-END (QA FLOW COMPARISON)
**Portal Satu Data Indonesia (SDI)**  
*Target Environment*: `https://fe-staging.data.go.id`  
*Dibuat Otomatis*: 17/11/2026, 00.14.06 WIB

> Dokumen ini disusun untuk Tim Quality Assurance (QA) guna memvalidasi kesesuaian alur bisnis aktual (*business flow*) dengan skrip automasi pengujian yang telah diimplementasikan.

---

## 👥 AKUN PENGUJIAN YANG DIGUNAKAN
| Role / Aktor | Instansi | Email Akun | Password |
|---|---|---|---|
| **Pengusul Data** | Kementerian Sosial (Kemensos) | `exchange@test.kemensos.go.id` | `123456789` |
| **Walidata Pengampu** | Kementerian Dalam Negeri (Kemendagri) | `exchange@test.kemendagri.go.id` | `123456789` |
| **Sekretariat SDI** | Tim Sekretariat Satu Data Indonesia | `Mkalmunawar@gmail.com` | `@Celestial12` |

---

## 📌 MATRIKS PERBANDINGAN & SPESIFIKASI SKENARIO (CASE 1 S.D. CASE 4)

### CASE-01: Case Data Terbatas (Klasifikasi Risiko Terbatas)
- **Kategori**: Perencanaan s.d. Publikasi Dataset
- **Deskripsi**: Alur lengkap dataset berklasifikasi Terbatas untuk interoperabilitas antarinstansi melalui SPLP/SKDN.

| Step | Aktor & Akun | Halaman / Rute | Aksi Pengujian | Elemen UI / Selector Kunci | Hasil yang Diharapkan (Expected Result) |
|:---:|:---|:---|:---|:---|:---|
| **#1** | **Pengusul Data (Kemensos)**<br><small>`exchange@test.kemensos.go.id`</small> | `/perencanaan/kebutuhan-data` | Login Kemensos & Mengajukan usulan kebutuhan data baru dengan instansi target Kemendagri. | `#button-kebutuhan-tambah`<br>`#input-kebutuhan-form-nama`<br>`select target instansi KEMENDAGRI`<br>`submit modal` | Usulan tercatat di tabel Kebutuhan Data dengan status awal "Diajukan". |
| **#2** | **Sekretariat SDI**<br><small>`Mkalmunawar@gmail.com`</small> | `/perencanaan/kebutuhan-data` | Sekretariat membuka usulan dan menetapkan hasil evaluasi menjadi "Dapat Disediakan". | `#button-kebutuhan-detail-0`<br>`#button-kebutuhan-detail-dapat-disediakan`<br>`textarea catatan review` | Status usulan kebutuhan data resmi berubah menjadi "Dapat Disediakan". |
| **#3** | **Walidata Pengampu (Kemendagri)**<br><small>`exchange@test.kemendagri.go.id`</small> | `/registrasi/data ➔ /dataset-form/baru/[id]` | Walidata mengisi registrasi dataset: Step 1 (Deskripsi maks 255 karakter, Klasifikasi: Terbatas, Dampak: Sedang, Tema, Frekuensi), Step 2 (Tambah Entitas), Step 3 (Tambah Kamus NIK) & Submit registrasi. | `#button-registrasi-data-registrasikan-0`<br>`button:has-text("Terbatas")`<br>`#button-dataset-next-step`<br>`#button-dataset-open-confirm-submit`<br>`checkbox persetujuan` | Dataset terdaftar dan status berubah menjadi "Menunggu Validasi". |
| **#4** | **Sekretariat SDI**<br><small>`Mkalmunawar@gmail.com`</small> | `/registrasi/data (atau /perencanaan/daftar-data) ➔ /dataset-form/review/[id]` | Sekretariat mereview form registrasi Step 1-3, meninjau kelengkapan metadata, lalu menyetujui dataset. | `#button-registrasi-data-review-0`<br>`button:has-text("Setujui Dataset (Published)")`<br>`dialog konfirmasi publish` | Dataset berhasil divalidasi dan resmi berstatus "Published". |

---

### CASE-02: Case Data Tertutup (Klasifikasi Risiko Tertutup / Rahasia Negara)
- **Kategori**: Perencanaan s.d. Publikasi Dataset
- **Deskripsi**: Alur lengkap dataset berklasifikasi Tertutup dengan dampak kerahasiaan tinggi & pengecualian publik.

| Step | Aktor & Akun | Halaman / Rute | Aksi Pengujian | Elemen UI / Selector Kunci | Hasil yang Diharapkan (Expected Result) |
|:---:|:---|:---|:---|:---|:---|
| **#1** | **Pengusul Data (Kemensos)**<br><small>`exchange@test.kemensos.go.id`</small> | `/perencanaan/kebutuhan-data` | Mengajukan usulan kebutuhan data tertutup strategis nasional ke Kemendagri. | `#button-kebutuhan-tambah`<br>`#input-kebutuhan-form-nama`<br>`target KEMENDAGRI` | Usulan terkirim dengan status "Diajukan". |
| **#2** | **Sekretariat SDI**<br><small>`Mkalmunawar@gmail.com`</small> | `/perencanaan/kebutuhan-data` | Menetapkan usulan menjadi "Dapat Disediakan". | `#button-kebutuhan-detail-0`<br>`#button-kebutuhan-detail-dapat-disediakan` | Status usulan menjadi "Dapat Disediakan". |
| **#3** | **Walidata Kemendagri**<br><small>`exchange@test.kemendagri.go.id`</small> | `/registrasi/data ➔ /dataset-form/baru/[id]` | Mengisi form registrasi dengan Deskripsi (maks 255 karakter), Klasifikasi "Tertutup", Tingkat Dampak "Tinggi" (Kerahasiaan Negara), Entitas & Kamus Data, lalu kirim. | `button:has-text("Tertutup")`<br>`select value="tinggi"`<br>`#button-dataset-open-confirm-submit` | Dataset berstatus "Menunggu Validasi" dengan parameter kerahasiaan tertutup. |
| **#4** | **Sekretariat SDI**<br><small>`Mkalmunawar@gmail.com`</small> | `/registrasi/data ➔ /dataset-form/review/[id]` | Sekretariat mereview kelayakan data tertutup dan menyetujui publikasi berbatas. | `#button-registrasi-data-review-0`<br>`button:has-text("Setujui Dataset (Published)")` | Dataset berstatus "Published" pada katalog data tertutup. |

---

### CASE-03: Case Revisi Registrasi Data (Review Tolak ✕ ➔ Edit ➔ Setuju ✓ Published)
- **Kategori**: Siklus Evaluasi & Revisi Dataset
- **Deskripsi**: Revisi spesifik pada saat Registrasi Data di mana Sekretariat menolak dengan tombol ✕ (Silang), Walidata mengedit dan mengirim ulang, lalu disetujui hingga Published.

| Step | Aktor & Akun | Halaman / Rute | Aksi Pengujian | Elemen UI / Selector Kunci | Hasil yang Diharapkan (Expected Result) |
|:---:|:---|:---|:---|:---|:---|
| **#1** | **Pengusul (Kemensos)**<br><small>`exchange@test.kemensos.go.id`</small> | `/perencanaan/kebutuhan-data` | Pengusul membuat usulan kebutuhan data segar untuk pengujian alur revisi. | `#button-kebutuhan-tambah`<br>`#input-kebutuhan-form-nama` | Usulan baru terbit dengan status "Diajukan". |
| **#2** | **Sekretariat SDI**<br><small>`Mkalmunawar@gmail.com`</small> | `/perencanaan/kebutuhan-data` | Sekretariat menetapkan status menjadi "Dapat Disediakan". | `#button-kebutuhan-detail-dapat-disediakan` | Status usulan menjadi "Dapat Disediakan". |
| **#3** | **Walidata Kemendagri**<br><small>`exchange@test.kemendagri.go.id`</small> | `/registrasi/data ➔ form registrasi` | Walidata mengisi registrasi data Step 1 s.d. Step 3 (Deskripsi dataset maks 255 karakter) dan mengirim data awal. | `#button-registrasi-data-registrasikan-0`<br>`#button-dataset-open-confirm-submit` | Dataset diajukan ke Sekretariat dengan status "Menunggu Validasi". |
| **#4** | **Sekretariat SDI**<br><small>`Mkalmunawar@gmail.com`</small> | `/registrasi/data ➔ /dataset-form/review/[id]` | Sekretariat membuka form review. Pada baris isian Step 1, Sekretariat mengklik tombol Silang ✕ (Ditolak / Perlu Revisi). Di Step 3, tombol submit berubah menjadi "Kembalikan untuk Revisi" ➔ Diklik! | `button[title="Ditolak (Perlu Revisi)"] / ✕`<br>`textarea catatan tolak`<br>`button:has-text("Kembalikan untuk Revisi")` | Dataset dikembalikan ke Walidata dengan status "Perlu Revisi". |
| **#5** | **Walidata Kemendagri**<br><small>`exchange@test.kemendagri.go.id`</small> | `/registrasi/data ➔ form edit dataset` | Walidata membuka tombol Edit pada baris dataset yang perlu revisi, memperbaiki deskripsi teknis (maks 255 karakter), lanjut Step 2 & 3, lalu mengirim ulang registrasi. | `#button-registrasi-data-edit-0 / tombol Edit`<br>`textarea deskripsi (update catatan revisi)`<br>`#button-dataset-open-confirm-submit` | Dataset berhasil diperbarui dan status kembali menjadi "Menunggu Validasi". |
| **#6** | **Sekretariat SDI**<br><small>`Mkalmunawar@gmail.com`</small> | `/registrasi/data ➔ /dataset-form/review/[id]` | Sekretariat membuka form review ulang, menandai Ceklis ✓ (Setuju), dan menekan tombol "Setujui Dataset (Published)". | `button[title="Setuju"] / ✓`<br>`button:has-text("Setujui Dataset (Published)")`<br>`dialog konfirmasi persetujuan` | Dataset hasil revisi resmi disetujui dan berstatus "Published"! |

---

### CASE-04: Case Registrasi Layanan SKDN & Verifikasi Portal SPLP
- **Kategori**: Interoperabilitas & Pendaftaran Layanan
- **Deskripsi**: Pendaftaran layanan interoperabilitas melalui katalog SKDN pada halaman registrasi layanan, simpan formulir, lalu beralih ke /splp untuk verifikasi data (Approval LID).

| Step | Aktor & Akun | Halaman / Rute | Aksi Pengujian | Elemen UI / Selector Kunci | Hasil yang Diharapkan (Expected Result) |
|:---:|:---|:---|:---|:---|:---|
| **#1** | **Walidata Kemendagri**<br><small>`exchange@test.kemendagri.go.id`</small> | `/registrasi/layanan` | Walidata membuka halaman Registrasi Layanan Interoperabilitas. | `Rute /registrasi/layanan`<br>`Tabel Dataset Layanan` | Halaman registrasi layanan termuat dengan tombol "Tambah Layanan" berstatus disabled. |
| **#2** | **Walidata Kemendagri**<br><small>`exchange@test.kemendagri.go.id`</small> | `/registrasi/layanan` | Memilih dataset pada tabel (checklist) untuk mengaktifkan tombol header "Tambah Layanan", lalu mengkliknya. | `tbody input[type="checkbox"]`<br>`#button-layanan-tambah-header` | Tombol Tambah Layanan aktif, dan modal "Pilih Platform Layanan Interoperabilitas" terbuka. |
| **#3** | **Walidata Kemendagri**<br><small>`exchange@test.kemendagri.go.id`</small> | `/registrasi/layanan (Modal Dialog)` | Memilih opsi "Tambah di SKDN" (#button-layanan-platform-skdn) untuk membuka formulir layanan di katalog SKDN. | `#button-layanan-platform-skdn`<br>`div:has-text("Tambah di SKDN")` | Formulir input layanan SKDN terbuka pada modal/halaman katalog SDI. |
| **#4** | **Walidata Kemendagri**<br><small>`exchange@test.kemendagri.go.id`</small> | `/registrasi/layanan (Form SKDN)` | Mengisi data layanan: Nama Layanan REST API, Deskripsi Teknis (maks 255 karakter), Endpoint URL, dan URL Dokumentasi API, lalu klik "Simpan Layanan di SKDN". | `#input-layanan-form-nama`<br>`#input-layanan-form-deskripsi`<br>`#input-layanan-form-endpoint`<br>`#input-layanan-form-dokumentasi`<br>`#button-layanan-form-submit` | Formulir layanan SKDN berhasil tersimpan di katalog data SDI. |
| **#5** | **Walidata Kemendagri / Admin SPLP**<br><small>`exchange@test.kemendagri.go.id`</small> | `/splp ➔ Tab Verifikasi Layanan` | Langsung berpindah ke rute /splp, membuka tab "Verifikasi Layanan", memverifikasi data layanan SKDN yang baru disimpan muncul di antrean, lalu klik "Approve LID". | `Rute /splp`<br>`#button-splp-tab-verifikasi`<br>`tbody tr:first-child button:has-text("Approve LID")` | Data layanan terverifikasi resmi pada portal SPLP dan berstatus Approval LID. |

---

### CASE-05: Case Full E2E Kebutuhan Data s.d. Verifikasi Pengajuan Akses Data (LID)
- **Kategori**: Siklus Hidup Lengkap Antarinstansi (A s.d. E)
- **Deskripsi**: Alur komprehensif mulai dari pengajuan kebutuhan data oleh Kemensos, penetapan oleh Sekretariat, registrasi dataset & publish, registrasi layanan SKDN, permohonan akses data (LID), hingga verifikasi dan approval oleh Sekretariat SDI.

| Step | Aktor & Akun | Halaman / Rute | Aksi Pengujian | Elemen UI / Selector Kunci | Hasil yang Diharapkan (Expected Result) |
|:---:|:---|:---|:---|:---|:---|
| **#1** | **Pengusul Data (Kemensos)**<br><small>`exchange@test.kemensos.go.id`</small> | `/perencanaan/kebutuhan-data` | Login Kemensos & Mengajukan usulan kebutuhan data baru (Klasifikasi Terbatas) dengan instansi target Kemendagri. | `#button-kebutuhan-ajukan`<br>`#input-kebutuhan-form-nama-data`<br>`select target instansi KEMENDAGRI`<br>`#button-kebutuhan-form-submit` | Usulan baru tercatat di tabel Kebutuhan Data dengan status "Diajukan". |
| **#2** | **Sekretariat SDI**<br><small>`Mkalmunawar@gmail.com`</small> | `/perencanaan/kebutuhan-data` | Sekretariat membuka usulan dan menetapkan hasil evaluasi menjadi "Dapat Disediakan". | `button:has-text("Penetapan")`<br>`#input-kebutuhan-detail-catatan-review`<br>`#button-kebutuhan-detail-dapat-disediakan` | Status usulan kebutuhan data resmi berubah menjadi "Dapat Disediakan". |
| **#3** | **Walidata Pengampu (Kemendagri)**<br><small>`exchange@test.kemendagri.go.id`</small> | `/registrasi/data ➔ /dataset-form/baru/[id]` | Walidata mengisi registrasi dataset: Step 1 (Deskripsi maks 255 karakter, Klasifikasi: Terbatas, Dampak: Sedang, Tema, Frekuensi), Step 2 (Tambah Entitas), Step 3 (Tambah Kamus NIK) & Submit registrasi. | `#button-registrasi-data-registrasikan-0`<br>`button:has-text("Terbatas")`<br>`#button-dataset-next-step`<br>`#button-dataset-open-confirm-submit`<br>`checkbox persetujuan` | Dataset terdaftar dan status berubah menjadi "Menunggu Validasi". |
| **#4** | **Sekretariat SDI**<br><small>`Mkalmunawar@gmail.com`</small> | `/registrasi/data (atau /perencanaan/daftar-data) ➔ /dataset-form/review/[id]` | Sekretariat mereview form registrasi Step 1-3, meninjau kelengkapan metadata, lalu menyetujui dataset. | `#button-registrasi-data-review-0`<br>`button:has-text("Setujui Dataset (Published)")`<br>`dialog konfirmasi publish` | Dataset berhasil divalidasi dan resmi berstatus "Published". |
| **#5** | **Walidata Pengampu (Kemendagri)**<br><small>`exchange@test.kemendagri.go.id`</small> | `/registrasi/layanan` | Mendaftarkan layanan interoperabilitas SKDN pada katalog data dengan mengisi form endpoint dan dokumentasi API. | `#button-layanan-tambah-header`<br>`#button-layanan-platform-skdn`<br>`#input-layanan-form-nama`<br>`#button-layanan-form-submit` | Layanan SKDN berhasil tersimpan di katalog layanan interoperabilitas SDI. |
| **#6** | **Pengusul Data (Kemensos)**<br><small>`exchange@test.kemensos.go.id`</small> | `/pengajuan-akses/tambah ➔ /pengajuan-akses` | Mengajukan permohonan akses data (LID): pilih Data Terbatas, peran Produsen Data, isi Nama Sistem & Layanan yang Diminta, pilih Dataset dari Katalog, isi Tujuan & Dasar Kewenangan, pilih Rentang Tanggal Akses, unggah Surat Permohonan (.pdf), lalu klik "Kirim Permohonan & Generate BAST" hingga tercatat di Daftar Pengajuan (/pengajuan-akses). | `#button-pengajuan-form-type-terbatas`<br>`#input-pengajuan-form-nama-sistem`<br>`#input-pengajuan-form-layanan-diminta`<br>`#button-pengajuan-form-dataset-trigger`<br>`#textarea-pengajuan-form-tujuan`<br>`#textarea-pengajuan-form-dasar-kewenangan`<br>`#button-pengajuan-form-date-range-trigger`<br>`#dokumen-pendukung-file-input`<br>`#button-pengajuan-form-submit` | Permohonan akses data berhasil dibuat (HTTP 201 Created, BAST-DRAFT terbit) dan tampil di tabel Daftar Pengajuan (/pengajuan-akses). |
| **#7** | **Sekretariat SDI**<br><small>`Mkalmunawar@gmail.com`</small> | `/pemberian-akses (Verifikasi Pengajuan)` | Sekretariat SDI membuka /pemberian-akses, mengklik tombol Verifikasi Kelayakan (#button-pemberian-akses-verifikasi-0), mengisi catatan verifikator (#textarea-verifikasi-catatan), dan mengklik "Setujui • Teruskan ke Produsen" (#button-verifikasi-setujui). | `#button-pemberian-akses-verifikasi-0`<br>`#textarea-verifikasi-catatan`<br>`#button-verifikasi-setujui` | Status Verifikasi SDI berubah menjadi "Layak (Disetujui SDI)" dan diteruskan ke antrean Produsen Data. |
| **#8** | **Produsen Data (Kemendagri) & Walidata Pemohon**<br><small>`exchange@test.kemendagri.go.id (Role: PRODUSEN DATA (DE))`</small> | `/pemberian-akses (Persetujuan & Tanda Tangan BAST)` | Login dengan akun Produsen Data Kemendagri (Role: PRODUSEN DATA (DE)), buka /pemberian-akses, klik tombol Persetujuan Akhir (#button-pemberian-akses-persetujuan-0), isi catatan (#textarea-persetujuan-catatan), unggah berkas Tanda Tangan Produsen Data (#persetujuan-ttd-produsen-file-input), lalu klik "Setujui & Terbitkan Kredensial BAST" (#button-persetujuan-setujui) serta lengkapi tanda tangan pemohon. | `#button-pemberian-akses-persetujuan-0`<br>`#textarea-persetujuan-catatan`<br>`#persetujuan-ttd-produsen-file-input`<br>`#button-persetujuan-setujui`<br>`#button-pemberian-akses-detail-0` | Tanda Tangan Produsen Data berstatus "Sudah Ditandatangani", Status Produsen menjadi "Disetujui Produsen (2/2 Tanda Tangan Selesai)", dan BAST resmi diterbitkan. |

---

## 🚀 CARA MENJALANKAN PENGUJIAN (BAGI TIM QA)

### 1. Menjalankan via Terminal Interaktif:
```bash
npm start
```
Pilih menu case yang ingin diuji:
- **1. Case Data Terbatas**
- **2. Case Data Tertutup**
- **3. Case Revisi Registrasi Data (Review Tolak ✕ ➔ Edit ➔ Setuju ✓ Published)**
- **4. Case Tambah Layanan SKDN & Verifikasi di /splp**
- **5. Jalankan Semua Case Sekaligus (All Cases)**

### 2. Menjalankan Per Kasus Spesifik Secara Langsung:
```bash
npm run check:terbatas   # Uji Case 1: Data Terbatas
npm run check:tertutup   # Uji Case 2: Data Tertutup
npm run check:revisi     # Uji Case 3: Revisi Registrasi Data
npm run check:layanan    # Uji Case 4: Layanan SKDN & SPLP
npm run check:all        # Uji Semua Case
```

### 3. Membuka Dashboard Laporan HTML Interaktif:
```bash
npm run report:web
# atau buka langsung file: reports/dashboard.html
```
