import { SdiAutomationPayload } from '../schemas/sdi-e2e.schema.js';

/**
 * Fallback data untuk Portal SDI berdasarkan DS-PORA-001 / DT-PORA-001 (olahragawan)
 * dari file Excel Kemenpora (RegDataset, RegEntitasData, dan RegKamusData).
 */
export const FALLBACK_FAKE_DATA: SdiAutomationPayload = {
  kebutuhanData: {
    namaData: 'olahragawan - Tabel untuk menyimpan data olahragawan',
    instansiIndikasi: 'KEMENTERIAN PEMUDA DAN OLAHRAGA',
    produsenData: 'Asisten Deputi Tenaga dan Organisasi Olahraga Prestasi, IOCO, NPC',
    waliData: 'Biro Perencanaan, Manajemen Kinerja dan Data (SIMT Kemenpora)',
    tujuanPengusulan: 'Registrasi Data Kemenpora MTN (DS-PORA-001 / DT-PORA-001) tabel olahragawan: Tabel untuk menyimpan data olahragawan.',
    catatanReviewSekretariat: 'Ditetapkan untuk registrasi data MTN Kemenpora DS-PORA-001 (DT-PORA-001 - olahragawan).'
  },
  registrasiDataset: {
    step1Informasi: {
      idDataset: 'DS-PORA-001',
      idAplikasi: 'APP-PORA-001',
      nama: 'olahragawan',
      deskripsi: 'Tabel untuk menyimpan data olahragawan',
      tema: 'Pendidikan dan Tenaga Kerja',
      jenisData: 'Data Induk',
      klasifikasiRisiko: 'Terbatas',
      frekuensi: 'Tahunan',
      formatData: ['JSON'],
      dampakKerahasiaan: 'sedang',
      dampakIntegritas: 'tinggi',
      dampakKetersediaan: 'sedang',
      lisensi: 'Creative Commons Attribution',
      versi: 'SIMT Kemenpora 1.0',
      standar: 'Standar Data Statistik Nasional',
      kodeReferensi: 'Kode Wilayah Administrasi Pemerintahan (Kemendagri)',
      tujuanPemanfaatan: 'Interoperabilitas data olahragawan (Tabel untuk menyimpan data olahragawan) pada Sistem Informasi Manajemen Talenta (SIMT) Kemenpora.',
      kontak: 'pusdatin@kemenpora.go.id / https://simt.kemenpora.go.id/'
    },
    step2Entitas: [
      {
        idData: 'DT-PORA-001',
        idDataset: 'DS-PORA-001',
        namaEntitas: 'olahragawan',
        definisi: 'Tabel untuk menyimpan data olahragawan'
      }
    ],
    step3KamusData: [
      {
        idElemen: 'DE-PORA-001',
        idData: 'DT-PORA-001',
        namaElemen: 'id_olahragawan',
        namaEntitas: 'olahragawan',
        alias: 'id_olahragawan',
        definisi: 'ID unik data talenta',
        tipeData: 'varchar',
        formatPanjang: '50',
        satuan: '-',
        sifatKewajiban: 'Optional',
        isPrimaryKey: true,
        idStandar: 'Standar Data Statistik Nasional (SDSN)',
        aturanValidasi: 'Optional - Tipe varchar(50) (DE-PORA-001)'
      }
    ]
  },
  registrasiLayananLID: {
    apiTitle: 'Layanan REST API SIMT Kemenpora - olahragawan (DS-PORA-001)',
    apiName: 'api-simt-kemenpora-olahragawan-v1',
    apiDesc: 'Layanan interoperabilitas SKDN/SPLP untuk dataset olahragawan (Tabel untuk menyimpan data olahragawan) pada SIMT Kemenpora.',
    exchangeMethod: 'REST API',
    format: 'JSON',
    keamanan: 'Melalui Gateway SPLP (Kredensial Khusus)',
    endpointUrl: 'https://simt.kemenpora.go.id/api/v1/olahragawan',
    documentationUrl: 'https://simt.kemenpora.go.id/docs/openapi/olahragawan.json',
    version: '1.0.0',
    slaAvailability: '99.9%'
  },
  pengajuanAksesLID: {
    classificationType: 'terbatas',
    peranIndex: 1,
    peranLabel: 'Produsen Data (Mendukung produksi data resmi instansi)',
    namaSistem: 'Sistem Informasi Pemerintahan Daerah & Kependudukan (SIPD Kemendagri)',
    layananDiminta: 'Layanan REST API SIMT Kemenpora - olahragawan (DS-PORA-001)',
    levelData: 'dataset',
    tujuanPenggunaan: 'Integrasi dan pemanfaatan dataset olahragawan (Tabel untuk menyimpan data olahragawan) dari SIMT Kemenpora untuk sinkronisasi data nasional.',
    dasarKewenangan: 'Peraturan Presiden Nomor 39 Tahun 2019 tentang Satu Data Indonesia dan Desain Besar Olahraga Nasional (DBON).',
    granularitas: 'Mikro',
    periodeAwal: '2026-11-10',
    periodeAkhir: '2026-11-25',
    frekuensiAkses: '1000 request/hari',
    metodePertukaran: 'Web Service / REST API (SPLP)',
    komitmenKeamanan: 'Koneksi Terenkripsi TLS 1.3 via Gateway SPLP, autentikasi OAuth2 Client Credentials, dan audit log.'
  }
};
