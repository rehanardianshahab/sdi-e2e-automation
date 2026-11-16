import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SdiAutomationPayload, RegistrasiDatasetPayload } from '../schemas/sdi-e2e.schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const jsonPath = path.resolve(__dirname, '../data/kemenpora-mtn-datasets.json');

let loadedDatasets: Record<string, any> = {};
try {
  if (fs.existsSync(jsonPath)) {
    const raw = fs.readFileSync(jsonPath, 'utf-8');
    loadedDatasets = JSON.parse(raw);
  }
} catch (err) {
  console.warn('[WARN] Gagal membaca kemenpora-mtn-datasets.json:', err);
}

/**
 * Mengambil payload registrasi dataset dari file kemenpora-mtn-datasets.json
 * @param datasetId ID Dataset MTN (contoh: 'DS-PORA-001', 'DS-PORA-002', dst). Default: 'DS-PORA-001'
 */
export function getKemenporaDatasetPayload(datasetId: string = 'DS-PORA-001'): RegistrasiDatasetPayload {
  const ds = loadedDatasets[datasetId] || loadedDatasets['DS-PORA-001'];
  if (ds && ds.step1Informasi && ds.step2Entitas && ds.step3KamusData) {
    return {
      step1Informasi: { ...ds.step1Informasi },
      step2Entitas: [...ds.step2Entitas],
      step3KamusData: [...ds.step3KamusData]
    };
  }
  // Fallback standar jika file JSON belum termuat
  return {
    step1Informasi: {
      nama: "Data Terpadu Olahragawan dan Manajemen Talenta Keolahragaan Nasional (DS-PORA-001)",
      deskripsi: "Dataset agregat dan relasional terpadu MTN Keolahragaan Kemenpora yang menyimpan data olahragawan, pelatih, pembinaan, riwayat prestasi, dan hasil pengukuran kesehatan nasional.",
      tema: "Pendidikan dan Tenaga Kerja",
      jenisData: "Data Induk",
      klasifikasiRisiko: "Terbatas",
      frekuensi: "Tahunan",
      formatData: ["JSON"],
      dampakKerahasiaan: "sedang",
      dampakIntegritas: "tinggi",
      dampakKetersediaan: "sedang",
      lisensi: "Creative Commons Attribution",
      versi: "Permenpora Nomor 5 Tahun 2023",
      standar: "Standar Data Statistik Nasional",
      kodeReferensi: "Kode Wilayah Administrasi Pemerintahan (Kemendagri)",
      tujuanPemanfaatan: "Pemadanan data dan sinkronisasi pembinaan atlet serta tenaga keolahragaan nasional.",
      kontak: "pusdatin@kemenpora.go.id / (021) 5738151"
    },
    step2Entitas: [
      {
        namaEntitas: "olahragawan",
        definisi: "Tabel untuk menyimpan data olahragawan"
      }
    ],
    step3KamusData: [
      {
        namaElemen: "id_olahragawan",
        namaEntitas: "olahragawan",
        alias: "id_olahragawan",
        definisi: "ID unik data talenta",
        tipeData: "varchar",
        formatPanjang: "50",
        satuan: "-",
        sifatKewajiban: "Optional",
        isPrimaryKey: true,
        idStandar: "-",
        aturanValidasi: "Opsional"
      }
    ]
  };
}

/**
 * Mengembalikan daftar seluruh dataset yang tersedia di kemenpora-mtn-datasets.json
 */
export function getAllKemenporaDatasets(): Record<string, any> {
  return loadedDatasets;
}

const defaultKemenporaRegistrasi = getKemenporaDatasetPayload('DS-PORA-001');

/**
 * Fallback fake data untuk Portal SDI.
 * Default ini disiapkan untuk skenario Pengusul = Kemendagri ➔ Target Instansi = Kemenpora.
 */
export const FALLBACK_FAKE_DATA: SdiAutomationPayload = {
  kebutuhanData: {
    namaData: "Data Terpadu Kepemudaan, Wirausaha Muda, dan Prestasi Olahraga Daerah",
    instansiIndikasi: "KEMENTERIAN PEMUDA DAN OLAHRAGA",
    produsenData: "Deputi Bidang Pengembangan Pemuda dan Pemberdayaan Olahraga",
    waliData: "Pusat Data dan Sistem Informasi Kemenpora (Pusdatin Kemenpora)",
    tujuanPengusulan: "Sinkronisasi data kepemudaan, wirausaha muda, dan pembinaan atlet berprestasi daerah dengan profil kependudukan wilayah Kemendagri.",
    catatanReviewSekretariat: "Usulan kebutuhan data kepemudaan dan keolahragaan daerah telah sesuai dengan prioritas Satu Data Indonesia dan disetujui untuk disediakan oleh Kemenpora."
  },
  registrasiDataset: defaultKemenporaRegistrasi,
  registrasiLayananLID: {
    apiTitle: "Layanan Interoperabilitas Data Kepemudaan dan Keolahragaan Kemenpora",
    apiName: "api-kepemudaan-olahraga-kemenpora-v1",
    apiDesc: "Layanan REST API melalui SPLP untuk pertukaran data kepemudaan, wirausaha muda, atlet daerah, dan prasarana olahraga Kemenpora.",
    exchangeMethod: "REST API",
    format: "JSON",
    keamanan: "Melalui Gateway SPLP (Kredensial Khusus)",
    endpointUrl: "https://splp.layanan.go.id/kemenpora/v1/kepemudaan-olahraga",
    documentationUrl: "https://api-docs.kemenpora.go.id/openapi/kepemudaan-olahraga.json",
    version: "1.0.0",
    slaAvailability: "99.9%"
  },
  pengajuanAksesLID: {
    classificationType: "terbatas",
    peranIndex: 1,
    peranLabel: "Produsen Data (Mendukung produksi data resmi instansi)",
    namaSistem: "Sistem Informasi Pemerintahan Daerah & Kependudukan (SIPD Kemendagri)",
    layananDiminta: "Layanan Interoperabilitas Data Kepemudaan dan Keolahragaan Kemenpora",
    levelData: "dataset",
    tujuanPenggunaan: "Menyinkronkan data kepemudaan, wirausaha muda, dan prestasi olahraga daerah dari Kemenpora dengan profil kependudukan daerah di Kemendagri.",
    dasarKewenangan: "Peraturan Presiden Nomor 39 Tahun 2019 tentang Satu Data Indonesia dan Undang-Undang Nomor 40 Tahun 2009 tentang Kepemudaan.",
    granularitas: "Makro",
    periodeAwal: "2026-11-10",
    periodeAkhir: "2026-11-25",
    frekuensiAkses: "1000 request/hari",
    metodePertukaran: "Web Service / REST API (SPLP)",
    komitmenKeamanan: "Koneksi Terenkripsi TLS 1.3 via Gateway SPLP, autentikasi OAuth2 Client Credentials, IP Whitelist, dan pencatatan log audit."
  }
};
