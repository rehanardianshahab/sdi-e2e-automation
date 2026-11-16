import { SdiAutomationPayload } from '../schemas/sdi-e2e.schema.js';

/**
 * Fallback fake data untuk Portal SDI.
 * ATURAN: Instansi yang diizinkan HANYA Kementerian Sosial dan Kementerian Dalam Negeri.
 * Default ini disiapkan untuk skenario Pengusul = Kemensos ➔ Target = Kemendagri.
 */
export const FALLBACK_FAKE_DATA: SdiAutomationPayload = {
  kebutuhanData: {
    namaData: "Data Terpadu Kependudukan dan Identitas Wilayah untuk Bansos",
    instansiIndikasi: "KEMENTERIAN DALAM NEGERI",
    produsenData: "Direktorat Jenderal Kependudukan dan Pencatatan Sipil",
    waliData: "Pusat Data dan Informasi Kemendagri",
    tujuanPengusulan: "Sinkronisasi data kependudukan nasional dengan data penerima bantuan sosial.",
    catatanReviewSekretariat: "Usulan kebutuhan data telah sesuai dengan prioritas Satu Data Indonesia dan disetujui untuk disediakan oleh Kemendagri."
  },
  registrasiDataset: {
    step1Informasi: {
      nama: "Data Terpadu Kependudukan dan Identitas Wilayah Kemendagri",
      deskripsi: "Dataset identitas kependudukan terpadu dan agregasi wilayah administrasi pemerintahan untuk mendukung validasi data penerima manfaat program nasional.",
      tema: "Pemerintahan Umum",
      jenisData: "Data Induk",
      klasifikasiRisiko: "Terbatas",
      frekuensi: "Bulanan",
      formatData: ["JSON", "REST API", "CSV"],
      dampakKerahasiaan: "sedang",
      dampakIntegritas: "tinggi",
      dampakKetersediaan: "sedang",
      lisensi: "Creative Commons Attribution",
      versi: "Permendagri No 72 Tahun 2022",
      standar: "Standar Data Statistik Nasional",
      kodeReferensi: "Kode Wilayah Administrasi Pemerintahan (Kemendagri)",
      tujuanPemanfaatan: "Sinkronisasi data kependudukan dan perlindungan sosial antar Kementerian/Lembaga.",
      kontak: "pusdatin@kemendagri.go.id / (021) 3450038"
    },
    step2Entitas: [
      {
        namaEntitas: "agregat_kependudukan_wilayah",
        definisi: "Entitas data kependudukan agregat berdasarkan kode wilayah administrasi pemerintahan tingkat kabupaten/kota dan kecamatan."
      },
      {
        namaEntitas: "riwayat_validasi_identitas",
        definisi: "Entitas transaksi pencocokan dan pemadanan identitas kependudukan untuk verifikasi kelayakan bantuan nasional."
      }
    ],
    step3KamusData: [
      {
        namaElemen: "Kode Wilayah Administrasi",
        namaEntitas: "agregat_kependudukan_wilayah",
        alias: "kode_wilayah",
        definisi: "Kode unik wilayah administrasi pemerintahan Indonesia sesuai Kepmendagri terbaru.",
        tipeData: "String (Code)",
        formatPanjang: "CHAR(10)",
        satuan: "-",
        sifatKewajiban: "Mandatory",
        isPrimaryKey: true,
        idStandar: "Kode Wilayah Administrasi Pemerintahan (Kemendagri)",
        aturanValidasi: "Wajib unik, tidak boleh NULL, format 10 karakter numerik dengan pemisah titik."
      },
      {
        namaElemen: "Jumlah Penduduk Terdaftar",
        namaEntitas: "agregat_kependudukan_wilayah",
        alias: "total_penduduk",
        definisi: "Jumlah total jiwa penduduk yang tercatat aktif dalam basis data kependudukan pada wilayah bersangkutan.",
        tipeData: "Integer",
        formatPanjang: "INT(10)",
        satuan: "Jiwa",
        sifatKewajiban: "Mandatory",
        isPrimaryKey: false,
        idStandar: "Standar Data Statistik Nasional (SDSN)",
        aturanValidasi: "Nilai integer positif >= 0."
      },
      {
        namaElemen: "Status Validitas Pemadanan",
        namaEntitas: "riwayat_validasi_identitas",
        alias: "status_padan",
        definisi: "Indikator hasil pemadanan identitas kependudukan dengan basis data penerima bantuan.",
        tipeData: "String (Code)",
        formatPanjang: "VARCHAR(20)",
        satuan: "-",
        sifatKewajiban: "Mandatory",
        isPrimaryKey: false,
        idStandar: "Tidak menggunakan data rujukan",
        aturanValidasi: "Nilai valid: PADAN, TIDAK_PADAN, MENUNGGU_VERIFIKASI."
      }
    ]
  },
  registrasiLayananLID: {
    apiTitle: "Layanan Interoperabilitas Data Kependudukan Kemendagri",
    apiName: "api-dukcapil-kemendagri-v1",
    apiDesc: "Layanan REST API melalui SPLP untuk pertukaran data kependudukan dan validasi kode wilayah administrasi nasional.",
    exchangeMethod: "REST API",
    format: "JSON",
    keamanan: "Melalui Gateway SPLP (Kredensial Khusus)",
    endpointUrl: "https://splp.layanan.go.id/kemendagri/v1/kependudukan",
    documentationUrl: "https://api-docs.kemendagri.go.id/openapi/kependudukan.json",
    version: "1.0.0",
    slaAvailability: "99.9%"
  },
  pengajuanAksesLID: {
    classificationType: "terbatas",
    peranIndex: 0,
    peranLabel: "Produsen Data (Mendukung produksi data resmi instansi)",
    namaSistem: "Sistem Informasi Terpadu Kesejahteraan Sosial (SIKS-NG)",
    layananDiminta: "Layanan Interoperabilitas Data Kependudukan Kemendagri",
    levelData: "elemen",
    tujuanPenggunaan: "Memvalidasi data kependudukan penerima manfaat program bantuan sosial nasional agar tepat sasaran.",
    dasarKewenangan: "Peraturan Presiden Nomor 39 Tahun 2019 tentang Satu Data Indonesia.",
    granularitas: "Individu / Transaksional (By Name By Address)",
    periodeAwal: "2025",
    periodeAkhir: "2026",
    frekuensiAkses: "Bulanan",
    metodePertukaran: "Web Service / REST API (SPLP)",
    komitmenKeamanan: "Koneksi Terenkripsi TLS 1.3 via Gateway SPLP, autentikasi OAuth2 Client Credentials, IP Whitelist, dan pencatatan log audit."
  }
};
