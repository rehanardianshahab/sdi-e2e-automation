import * as fs from 'fs';
import * as path from 'path';
import { select, confirm } from '@inquirer/prompts';
import {
  runPageByPageVerification,
  runRevisiRegistrasiVerification,
  runLayananSplpVerification
} from '../src/flows/verify-page-access.js';

export interface QAFlowStep {
  stepNo: number;
  actor: string;
  account: string;
  pageRoute: string;
  actionSummary: string;
  uiElements: string[];
  expectedResult: string;
}

export interface QACaseSpec {
  id: string;
  title: string;
  category: string;
  description: string;
  steps: QAFlowStep[];
}

export const QA_FLOW_SPECS: QACaseSpec[] = [
  {
    id: 'CASE-01',
    title: 'Case Data Terbatas (Klasifikasi Risiko Terbatas)',
    category: 'Perencanaan s.d. Publikasi Dataset',
    description: 'Alur lengkap dataset berklasifikasi Terbatas untuk interoperabilitas antarinstansi melalui SPLP/SKDN.',
    steps: [
      {
        stepNo: 1,
        actor: 'Pengusul Data (Kemensos)',
        account: 'exchange@test.kemensos.go.id',
        pageRoute: '/perencanaan/kebutuhan-data',
        actionSummary: 'Login Kemensos & Mengajukan usulan kebutuhan data baru dengan instansi target Kemendagri.',
        uiElements: ['#button-kebutuhan-tambah', '#input-kebutuhan-form-nama', 'select target instansi KEMENDAGRI', 'submit modal'],
        expectedResult: 'Usulan tercatat di tabel Kebutuhan Data dengan status awal "Diajukan".'
      },
      {
        stepNo: 2,
        actor: 'Sekretariat SDI',
        account: 'Mkalmunawar@gmail.com',
        pageRoute: '/perencanaan/kebutuhan-data',
        actionSummary: 'Sekretariat membuka usulan dan menetapkan hasil evaluasi menjadi "Dapat Disediakan".',
        uiElements: ['#button-kebutuhan-detail-0', '#button-kebutuhan-detail-dapat-disediakan', 'textarea catatan review'],
        expectedResult: 'Status usulan kebutuhan data resmi berubah menjadi "Dapat Disediakan".'
      },
      {
        stepNo: 3,
        actor: 'Walidata Pengampu (Kemendagri)',
        account: 'exchange@test.kemendagri.go.id',
        pageRoute: '/registrasi/data ➔ /dataset-form/baru/[id]',
        actionSummary: 'Walidata mengisi registrasi dataset: Step 1 (Deskripsi maks 255 karakter, Klasifikasi: Terbatas, Dampak: Sedang, Tema, Frekuensi), Step 2 (Tambah Entitas), Step 3 (Tambah Kamus NIK) & Submit registrasi.',
        uiElements: ['#button-registrasi-data-registrasikan-0', 'button:has-text("Terbatas")', '#button-dataset-next-step', '#button-dataset-open-confirm-submit', 'checkbox persetujuan'],
        expectedResult: 'Dataset terdaftar dan status berubah menjadi "Menunggu Validasi".'
      },
      {
        stepNo: 4,
        actor: 'Sekretariat SDI',
        account: 'Mkalmunawar@gmail.com',
        pageRoute: '/registrasi/data (atau /perencanaan/daftar-data) ➔ /dataset-form/review/[id]',
        actionSummary: 'Sekretariat mereview form registrasi Step 1-3, meninjau kelengkapan metadata, lalu menyetujui dataset.',
        uiElements: ['#button-registrasi-data-review-0', 'button:has-text("Setujui Dataset (Published)")', 'dialog konfirmasi publish'],
        expectedResult: 'Dataset berhasil divalidasi dan resmi berstatus "Published".'
      }
    ]
  },
  {
    id: 'CASE-02',
    title: 'Case Data Tertutup (Klasifikasi Risiko Tertutup / Rahasia Negara)',
    category: 'Perencanaan s.d. Publikasi Dataset',
    description: 'Alur lengkap dataset berklasifikasi Tertutup dengan dampak kerahasiaan tinggi & pengecualian publik.',
    steps: [
      {
        stepNo: 1,
        actor: 'Pengusul Data (Kemensos)',
        account: 'exchange@test.kemensos.go.id',
        pageRoute: '/perencanaan/kebutuhan-data',
        actionSummary: 'Mengajukan usulan kebutuhan data tertutup strategis nasional ke Kemendagri.',
        uiElements: ['#button-kebutuhan-tambah', '#input-kebutuhan-form-nama', 'target KEMENDAGRI'],
        expectedResult: 'Usulan terkirim dengan status "Diajukan".'
      },
      {
        stepNo: 2,
        actor: 'Sekretariat SDI',
        account: 'Mkalmunawar@gmail.com',
        pageRoute: '/perencanaan/kebutuhan-data',
        actionSummary: 'Menetapkan usulan menjadi "Dapat Disediakan".',
        uiElements: ['#button-kebutuhan-detail-0', '#button-kebutuhan-detail-dapat-disediakan'],
        expectedResult: 'Status usulan menjadi "Dapat Disediakan".'
      },
      {
        stepNo: 3,
        actor: 'Walidata Kemendagri',
        account: 'exchange@test.kemendagri.go.id',
        pageRoute: '/registrasi/data ➔ /dataset-form/baru/[id]',
        actionSummary: 'Mengisi form registrasi dengan Deskripsi (maks 255 karakter), Klasifikasi "Tertutup", Tingkat Dampak "Tinggi" (Kerahasiaan Negara), Entitas & Kamus Data, lalu kirim.',
        uiElements: ['button:has-text("Tertutup")', 'select value="tinggi"', '#button-dataset-open-confirm-submit'],
        expectedResult: 'Dataset berstatus "Menunggu Validasi" dengan parameter kerahasiaan tertutup.'
      },
      {
        stepNo: 4,
        actor: 'Sekretariat SDI',
        account: 'Mkalmunawar@gmail.com',
        pageRoute: '/registrasi/data ➔ /dataset-form/review/[id]',
        actionSummary: 'Sekretariat mereview kelayakan data tertutup dan menyetujui publikasi berbatas.',
        uiElements: ['#button-registrasi-data-review-0', 'button:has-text("Setujui Dataset (Published)")'],
        expectedResult: 'Dataset berstatus "Published" pada katalog data tertutup.'
      }
    ]
  },
  {
    id: 'CASE-03',
    title: 'Case Revisi Registrasi Data (Review Tolak ✕ ➔ Edit ➔ Setuju ✓ Published)',
    category: 'Siklus Evaluasi & Revisi Dataset',
    description: 'Revisi spesifik pada saat Registrasi Data di mana Sekretariat menolak dengan tombol ✕ (Silang), Walidata mengedit dan mengirim ulang, lalu disetujui hingga Published.',
    steps: [
      {
        stepNo: 1,
        actor: 'Pengusul (Kemensos)',
        account: 'exchange@test.kemensos.go.id',
        pageRoute: '/perencanaan/kebutuhan-data',
        actionSummary: 'Pengusul membuat usulan kebutuhan data segar untuk pengujian alur revisi.',
        uiElements: ['#button-kebutuhan-tambah', '#input-kebutuhan-form-nama'],
        expectedResult: 'Usulan baru terbit dengan status "Diajukan".'
      },
      {
        stepNo: 2,
        actor: 'Sekretariat SDI',
        account: 'Mkalmunawar@gmail.com',
        pageRoute: '/perencanaan/kebutuhan-data',
        actionSummary: 'Sekretariat menetapkan status menjadi "Dapat Disediakan".',
        uiElements: ['#button-kebutuhan-detail-dapat-disediakan'],
        expectedResult: 'Status usulan menjadi "Dapat Disediakan".'
      },
      {
        stepNo: 3,
        actor: 'Walidata Kemendagri',
        account: 'exchange@test.kemendagri.go.id',
        pageRoute: '/registrasi/data ➔ form registrasi',
        actionSummary: 'Walidata mengisi registrasi data Step 1 s.d. Step 3 (Deskripsi dataset maks 255 karakter) dan mengirim data awal.',
        uiElements: ['#button-registrasi-data-registrasikan-0', '#button-dataset-open-confirm-submit'],
        expectedResult: 'Dataset diajukan ke Sekretariat dengan status "Menunggu Validasi".'
      },
      {
        stepNo: 4,
        actor: 'Sekretariat SDI',
        account: 'Mkalmunawar@gmail.com',
        pageRoute: '/registrasi/data ➔ /dataset-form/review/[id]',
        actionSummary: 'Sekretariat membuka form review. Pada baris isian Step 1, Sekretariat mengklik tombol Silang ✕ (Ditolak / Perlu Revisi). Di Step 3, tombol submit berubah menjadi "Kembalikan untuk Revisi" ➔ Diklik!',
        uiElements: ['button[title="Ditolak (Perlu Revisi)"] / ✕', 'textarea catatan tolak', 'button:has-text("Kembalikan untuk Revisi")'],
        expectedResult: 'Dataset dikembalikan ke Walidata dengan status "Perlu Revisi".'
      },
      {
        stepNo: 5,
        actor: 'Walidata Kemendagri',
        account: 'exchange@test.kemendagri.go.id',
        pageRoute: '/registrasi/data ➔ form edit dataset',
        actionSummary: 'Walidata membuka tombol Edit pada baris dataset yang perlu revisi, memperbaiki deskripsi teknis (maks 255 karakter), lanjut Step 2 & 3, lalu mengirim ulang registrasi.',
        uiElements: ['#button-registrasi-data-edit-0 / tombol Edit', 'textarea deskripsi (update catatan revisi)', '#button-dataset-open-confirm-submit'],
        expectedResult: 'Dataset berhasil diperbarui dan status kembali menjadi "Menunggu Validasi".'
      },
      {
        stepNo: 6,
        actor: 'Sekretariat SDI',
        account: 'Mkalmunawar@gmail.com',
        pageRoute: '/registrasi/data ➔ /dataset-form/review/[id]',
        actionSummary: 'Sekretariat membuka form review ulang, menandai Ceklis ✓ (Setuju), dan menekan tombol "Setujui Dataset (Published)".',
        uiElements: ['button[title="Setuju"] / ✓', 'button:has-text("Setujui Dataset (Published)")', 'dialog konfirmasi persetujuan'],
        expectedResult: 'Dataset hasil revisi resmi disetujui dan berstatus "Published"!'
      }
    ]
  },
  {
    id: 'CASE-04',
    title: 'Case Registrasi Layanan SKDN & Verifikasi Portal SPLP',
    category: 'Interoperabilitas & Pendaftaran Layanan',
    description: 'Pendaftaran layanan interoperabilitas melalui katalog SKDN pada halaman registrasi layanan, simpan formulir, lalu beralih ke /splp untuk verifikasi data (Approval LID).',
    steps: [
      {
        stepNo: 1,
        actor: 'Walidata Kemendagri',
        account: 'exchange@test.kemendagri.go.id',
        pageRoute: '/registrasi/layanan',
        actionSummary: 'Walidata membuka halaman Registrasi Layanan Interoperabilitas.',
        uiElements: ['Rute /registrasi/layanan', 'Tabel Dataset Layanan'],
        expectedResult: 'Halaman registrasi layanan termuat dengan tombol "Tambah Layanan" berstatus disabled.'
      },
      {
        stepNo: 2,
        actor: 'Walidata Kemendagri',
        account: 'exchange@test.kemendagri.go.id',
        pageRoute: '/registrasi/layanan',
        actionSummary: 'Memilih dataset pada tabel (checklist) untuk mengaktifkan tombol header "Tambah Layanan", lalu mengkliknya.',
        uiElements: ['tbody input[type="checkbox"]', '#button-layanan-tambah-header'],
        expectedResult: 'Tombol Tambah Layanan aktif, dan modal "Pilih Platform Layanan Interoperabilitas" terbuka.'
      },
      {
        stepNo: 3,
        actor: 'Walidata Kemendagri',
        account: 'exchange@test.kemendagri.go.id',
        pageRoute: '/registrasi/layanan (Modal Dialog)',
        actionSummary: 'Memilih opsi "Tambah di SKDN" (#button-layanan-platform-skdn) untuk membuka formulir layanan di katalog SKDN.',
        uiElements: ['#button-layanan-platform-skdn', 'div:has-text("Tambah di SKDN")'],
        expectedResult: 'Formulir input layanan SKDN terbuka pada modal/halaman katalog SDI.'
      },
      {
        stepNo: 4,
        actor: 'Walidata Kemendagri',
        account: 'exchange@test.kemendagri.go.id',
        pageRoute: '/registrasi/layanan (Form SKDN)',
        actionSummary: 'Mengisi data layanan: Nama Layanan REST API, Deskripsi Teknis (maks 255 karakter), Endpoint URL, dan URL Dokumentasi API, lalu klik "Simpan Layanan di SKDN".',
        uiElements: ['#input-layanan-form-nama', '#input-layanan-form-deskripsi', '#input-layanan-form-endpoint', '#input-layanan-form-dokumentasi', '#button-layanan-form-submit'],
        expectedResult: 'Formulir layanan SKDN berhasil tersimpan di katalog data SDI.'
      },
      {
        stepNo: 5,
        actor: 'Walidata Kemendagri / Admin SPLP',
        account: 'exchange@test.kemendagri.go.id',
        pageRoute: '/splp ➔ Tab Verifikasi Layanan',
        actionSummary: 'Langsung berpindah ke rute /splp, membuka tab "Verifikasi Layanan", memverifikasi data layanan SKDN yang baru disimpan muncul di antrean, lalu klik "Approve LID".',
        uiElements: ['Rute /splp', '#button-splp-tab-verifikasi', 'tbody tr:first-child button:has-text("Approve LID")'],
        expectedResult: 'Data layanan terverifikasi resmi pada portal SPLP dan berstatus Approval LID.'
      }
    ]
  }
];

export function generateQAMarkdownDoc(): string {
  let md = `# 🇮🇩 SPESIFIKASI ALUR PENGUJIAN END-TO-END (QA FLOW COMPARISON)
**Portal Satu Data Indonesia (SDI)**  
*Target Environment*: \`https://fe-staging.data.go.id\`  
*Dibuat Otomatis*: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB

> Dokumen ini disusun untuk Tim Quality Assurance (QA) guna memvalidasi kesesuaian alur bisnis aktual (*business flow*) dengan skrip automasi pengujian yang telah diimplementasikan.

---

## 👥 AKUN PENGUJIAN YANG DIGUNAKAN
| Role / Aktor | Instansi | Email Akun | Password |
|---|---|---|---|
| **Pengusul Data** | Kementerian Sosial (Kemensos) | \`exchange@test.kemensos.go.id\` | \`123456789\` |
| **Walidata Pengampu** | Kementerian Dalam Negeri (Kemendagri) | \`exchange@test.kemendagri.go.id\` | \`123456789\` |
| **Sekretariat SDI** | Tim Sekretariat Satu Data Indonesia | \`Mkalmunawar@gmail.com\` | \`@Celestial12\` |

---

## 📌 MATRIKS PERBANDINGAN & SPESIFIKASI SKENARIO (CASE 1 S.D. CASE 4)

`;

  QA_FLOW_SPECS.forEach((c) => {
    md += `### ${c.id}: ${c.title}\n`;
    md += `- **Kategori**: ${c.category}\n`;
    md += `- **Deskripsi**: ${c.description}\n\n`;
    md += `| Step | Aktor & Akun | Halaman / Rute | Aksi Pengujian | Elemen UI / Selector Kunci | Hasil yang Diharapkan (Expected Result) |\n`;
    md += `|:---:|:---|:---|:---|:---|:---|\n`;

    c.steps.forEach((s) => {
      const els = s.uiElements.map((e) => `\`${e}\``).join('<br>');
      md += `| **#${s.stepNo}** | **${s.actor}**<br><small>\`${s.account}\`</small> | \`${s.pageRoute}\` | ${s.actionSummary} | ${els} | ${s.expectedResult} |\n`;
    });

    md += `\n---\n\n`;
  });

  md += `## 🚀 CARA MENJALANKAN PENGUJIAN (BAGI TIM QA)

### 1. Menjalankan via Terminal Interaktif:
\`\`\`bash
npm start
\`\`\`
Pilih menu case yang ingin diuji:
- **1. Case Data Terbatas**
- **2. Case Data Tertutup**
- **3. Case Revisi Registrasi Data (Review Tolak ✕ ➔ Edit ➔ Setuju ✓ Published)**
- **4. Case Tambah Layanan SKDN & Verifikasi di /splp**
- **5. Jalankan Semua Case Sekaligus (All Cases)**

### 2. Menjalankan Per Kasus Spesifik Secara Langsung:
\`\`\`bash
npm run check:terbatas   # Uji Case 1: Data Terbatas
npm run check:tertutup   # Uji Case 2: Data Tertutup
npm run check:revisi     # Uji Case 3: Revisi Registrasi Data
npm run check:layanan    # Uji Case 4: Layanan SKDN & SPLP
npm run check:all        # Uji Semua Case
\`\`\`

### 3. Membuka Dashboard Laporan HTML Interaktif:
\`\`\`bash
npm run report:web
# atau buka langsung file: reports/dashboard.html
\`\`\`
`;

  return md;
}

export function generateQAComparisonHTML(): string {
  const md = generateQAMarkdownDoc();
  const htmlPath = path.join(process.cwd(), 'reports', 'QA-FLOW-COMPARISON.html');
  fs.mkdirSync(path.dirname(htmlPath), { recursive: true });

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>QA Flow Specification & Comparison - Portal SDI</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #D5001E;
      --bg: #090D16;
      --surface: #111827;
      --border: #374151;
      --text: #F3F4F6;
      --text-muted: #9CA3AF;
      --success: #10B981;
      --info: #38BDF8;
      --warning: #F59E0B;
    }
    body {
      font-family: 'Plus Jakarta Sans', sans-serif;
      background: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 2rem 1.5rem;
      line-height: 1.6;
    }
    .container { max-width: 1300px; margin: 0 auto; }
    .header {
      background: linear-gradient(135deg, rgba(213, 0, 30, 0.15), rgba(56, 189, 248, 0.05));
      border: 1px solid rgba(213, 0, 30, 0.3);
      border-radius: 16px;
      padding: 2rem;
      margin-bottom: 2rem;
    }
    h1 { margin: 0 0 0.5rem 0; font-size: 1.75rem; color: #FFF; font-weight: 800; }
    p { margin: 0; color: var(--text-muted); font-size: 0.95rem; }
    .badge {
      display: inline-block;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .badge-primary { background: rgba(213,0,30,0.2); color: #FF4D6D; border: 1px solid rgba(213,0,30,0.4); }
    .badge-success { background: rgba(16,185,129,0.2); color: var(--success); border: 1px solid rgba(16,185,129,0.4); }
    
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 1.75rem;
      margin-bottom: 2rem;
    }
    .card-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: #FFF;
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.5rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 1rem;
    }
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    th {
      background: #1f2937;
      text-align: left;
      padding: 0.85rem 1rem;
      font-size: 0.75rem;
      text-transform: uppercase;
      color: var(--text-muted);
      letter-spacing: 0.05em;
      border-bottom: 1px solid var(--border);
    }
    td {
      padding: 1rem;
      border-bottom: 1px solid #1f2937;
      font-size: 0.85rem;
      vertical-align: top;
    }
    tr:nth-child(even) { background: rgba(255,255,255,0.015); }
    tr:hover { background: rgba(255,255,255,0.04); }
    .code {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      background: rgba(0,0,0,0.3);
      padding: 0.2rem 0.5rem;
      border-radius: 6px;
      color: var(--info);
      display: inline-block;
      margin: 0.15rem 0;
    }
    .actor-tag {
      font-weight: 700;
      color: #F9FAFB;
    }
    .account-tag {
      font-size: 0.75rem;
      color: var(--text-muted);
      font-family: 'JetBrains Mono', monospace;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <span class="badge badge-primary">Spesifikasi Alur Pengujian QA</span>
      <h1 style="margin-top: 0.5rem;">🇮🇩 Matriks Alur Automasi Portal Satu Data Indonesia</h1>
      <p>Bahan perbandingan Tim QA untuk memvalidasi kesesuaian alur automasi dengan alur bisnis nyata (Staging: <strong>https://fe-staging.data.go.id</strong>)</p>
    </div>

    <!-- AKUN DAFTAR -->
    <div class="card">
      <div class="card-title">
        <span>👥 Akun Resmi yang Digunakan (Batasan Ketat: Kemensos, Kemendagri, Sekretariat)</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Peran / Aktor</th>
            <th>Instansi</th>
            <th>Email Akun</th>
            <th>Password</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Pengusul Kebutuhan Data</strong></td>
            <td>Kementerian Sosial (Kemensos)</td>
            <td><span class="code">exchange@test.kemensos.go.id</span></td>
            <td><span class="code">123456789</span></td>
          </tr>
          <tr>
            <td><strong>Walidata Pengampu Dataset & Layanan</strong></td>
            <td>Kementerian Dalam Negeri (Kemendagri)</td>
            <td><span class="code">exchange@test.kemendagri.go.id</span></td>
            <td><span class="code">123456789</span></td>
          </tr>
          <tr>
            <td><strong>Sekretariat SDI (Penetapan & Review Publish)</strong></td>
            <td>Sekretariat Satu Data Indonesia</td>
            <td><span class="code">Mkalmunawar@gmail.com</span></td>
            <td><span class="code">@Celestial12</span></td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- CASES ITERATION -->
    ${QA_FLOW_SPECS.map(
      (c) => `
      <div class="card">
        <div class="card-title">
          <span>${c.id}: ${c.title}</span>
          <span class="badge badge-success">${c.category}</span>
        </div>
        <p style="margin-bottom: 1rem;">${c.description}</p>
        <table>
          <thead>
            <tr>
              <th style="width: 50px;">Step</th>
              <th style="width: 200px;">Aktor & Akun</th>
              <th style="width: 220px;">Halaman / URL Rute</th>
              <th>Aksi Pengujian Langkah demi Langkah</th>
              <th style="width: 240px;">Elemen / Tombol / Selector</th>
              <th style="width: 260px;">Hasil yang Diharapkan (Expected Result)</th>
            </tr>
          </thead>
          <tbody>
            ${c.steps
              .map(
                (s) => `
              <tr>
                <td><strong>#${s.stepNo}</strong></td>
                <td>
                  <div class="actor-tag">${s.actor}</div>
                  <div class="account-tag">${s.account}</div>
                </td>
                <td><span class="code">${s.pageRoute}</span></td>
                <td>${s.actionSummary}</td>
                <td>${s.uiElements.map((e) => `<span class="code">${e}</span>`).join('<br>')}</td>
                <td><strong>${s.expectedResult}</strong></td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `
    ).join('')}
  </div>
</body>
</html>`;

  fs.writeFileSync(htmlPath, html, 'utf-8');
  return htmlPath;
}

export async function runQAFlowComparatorCLI() {
  if (process.argv.includes('--view')) {
    QA_FLOW_SPECS.forEach((c) => {
      console.log(`\n================================================================================`);
      console.log(`📌 [${c.id}] ${c.title.toUpperCase()}`);
      console.log(`   Kategori : ${c.category}`);
      console.log(`   Deskripsi: ${c.description}`);
      console.log(`================================================================================`);
      c.steps.forEach((s) => {
        console.log(`   Langkah #${s.stepNo}: [${s.actor}]`);
        console.log(`     🌐 Rute       : ${s.pageRoute}`);
        console.log(`     🎯 Aksi       : ${s.actionSummary}`);
        console.log(`     🔘 UI Selector: ${s.uiElements.join(' | ')}`);
        console.log(`     ✅ Expected   : ${s.expectedResult}\n`);
      });
    });
    return;
  }

  if (process.argv.includes('--html')) {
    const htmlPath = generateQAComparisonHTML();
    console.log(`✅ Dokumen HTML berhasil dibuat di: ${htmlPath}`);
    return;
  }

  if (process.argv.includes('--md')) {
    const mdPath = path.join(process.cwd(), 'QA-FLOW-SPECIFICATION.md');
    fs.writeFileSync(mdPath, generateQAMarkdownDoc(), 'utf-8');
    console.log(`✅ File Markdown berhasil dibuat di: ${mdPath}`);
    return;
  }

  console.clear();
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║        🛠️  SDI QA FLOW COMPARATOR & SPECIFICATION RUNNER                    ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log('Alat bantu Tim QA untuk membandingkan kesesuaian alur sistem dengan automasi.\n');

  const action = await select({
    message: 'Pilih Tindakan untuk Tim QA:',
    choices: [
      {
        name: '1. Tampilkan Matriks Alur Lengkap (Walkthrough di Terminal) [Cepat & Ringkas]',
        value: 'view',
        description: 'Tampilkan perincian step-by-step setiap case lengkap dengan aktor, URL, dan aksi'
      },
      {
        name: '2. Generate & Buka Dokumen QA Flow Comparison (HTML Interaktif)',
        value: 'html',
        description: 'Buat file HTML visual cantik di reports/QA-FLOW-COMPARISON.html'
      },
      {
        name: '3. Export Dokumen Spesifikasi Markdown (QA-FLOW-SPECIFICATION.md)',
        value: 'markdown',
        description: 'Simpan dokumentasi resmi markdown di root direktori proyek untuk dibagikan'
      },
      {
        name: '4. Jalankan Pengujian Live (Browser Headed / Headless) untuk Memverifikasi Alur',
        value: 'execute',
        description: 'Pilih dan jalankan case secara langsung di portal staging'
      }
    ]
  });

  if (action === 'view') {
    QA_FLOW_SPECS.forEach((c) => {
      console.log(`\n================================================================================`);
      console.log(`📌 [${c.id}] ${c.title.toUpperCase()}`);
      console.log(`   Kategori : ${c.category}`);
      console.log(`   Deskripsi: ${c.description}`);
      console.log(`================================================================================`);
      c.steps.forEach((s) => {
        console.log(`   Langkah #${s.stepNo}: [${s.actor}]`);
        console.log(`     🌐 Rute       : ${s.pageRoute}`);
        console.log(`     🎯 Aksi       : ${s.actionSummary}`);
        console.log(`     🔘 UI Selector: ${s.uiElements.join(' | ')}`);
        console.log(`     ✅ Expected   : ${s.expectedResult}\n`);
      });
    });
  } else if (action === 'html') {
    const htmlPath = generateQAComparisonHTML();
    console.log(`\n✅ Dokumen HTML berhasil dibuat di: ${htmlPath}`);
    console.log('Membuka di peramban (browser default)...');
    const { exec } = await import('child_process');
    exec(`start "" "${htmlPath}"`);
  } else if (action === 'markdown') {
    const mdPath = path.join(process.cwd(), 'QA-FLOW-SPECIFICATION.md');
    fs.writeFileSync(mdPath, generateQAMarkdownDoc(), 'utf-8');
    console.log(`\n✅ File Markdown berhasil dibuat di: ${mdPath}`);
    console.log('File ini siap dibagikan ke teman QA atau dicommit ke repositori.');
  } else if (action === 'execute') {
    const caseToRun = await select({
      message: 'Pilih Case yang Ingin Dijalankan Langsung:',
      choices: [
        { name: '1. Case 1: Data Terbatas', value: 'terbatas' },
        { name: '2. Case 2: Data Tertutup', value: 'tertutup' },
        { name: '3. Case 3: Revisi Registrasi Data (Tolak ✕ ➔ Edit ➔ Publish ✓)', value: 'revisi' },
        { name: '4. Case 4: Layanan SKDN & Verifikasi /splp', value: 'layanan' }
      ]
    });

    if (caseToRun === 'terbatas') await runPageByPageVerification({ caseType: 'terbatas' });
    else if (caseToRun === 'tertutup') await runPageByPageVerification({ caseType: 'tertutup' });
    else if (caseToRun === 'revisi') await runRevisiRegistrasiVerification();
    else if (caseToRun === 'layanan') await runLayananSplpVerification();
  }
}

// Eksekusi jika dipanggil langsung
if (process.argv[1]?.includes('qa-flow-comparator')) {
  runQAFlowComparatorCLI().catch(console.error);
}
