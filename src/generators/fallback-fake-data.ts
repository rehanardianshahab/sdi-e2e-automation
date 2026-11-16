import { SdiAutomationPayload } from '../schemas/sdi-e2e.schema.js';

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
  registrasiDataset: {
    step1Informasi: {
      nama: "Data Terpadu Kepemudaan, Prestasi Olahraga, dan Indeks Pembangunan Pemuda Kemenpora",
      deskripsi: "Dataset agregat indikator kepemudaan, wirausaha muda, pembinaan atlet daerah, serta sebaran prasarana olahraga nasional untuk mendukung sinkronisasi pembangunan daerah.",
      tema: "Pembangunan Daerah",
      jenisData: "Data Induk",
      klasifikasiRisiko: "Terbatas",
      frekuensi: "Bulanan",
      formatData: ["JSON", "REST API", "CSV"],
      dampakKerahasiaan: "sedang",
      dampakIntegritas: "tinggi",
      dampakKetersediaan: "sedang",
      lisensi: "Creative Commons Attribution",
      versi: "Permenpora Nomor 5 Tahun 2023",
      standar: "Standar Data Statistik Nasional",
      kodeReferensi: "Kode Wilayah Administrasi Pemerintahan (Kemendagri)",
      tujuanPemanfaatan: "Sinkronisasi data kepemudaan dan pembangunan keolahragaan daerah antara Kemenpora dan Kemendagri.",
      kontak: "pusdatin@kemenpora.go.id / (021) 5738151"
    },
    step2Entitas: [
      {
        namaEntitas: "entitas_profil_kepemudaan_daerah",
        definisi: "Entitas data agregat kepemudaan, organisasi kepemudaan, dan wirausaha muda berdasarkan kode wilayah provinsi serta kabupaten/kota."
      },
      {
        namaEntitas: "entitas_prestasi_dan_sarana_olahraga",
        definisi: "Entitas catatan pembinaan atlet daerah berprestasi serta sebaran prasarana olahraga tingkat kabupaten/kota dan provinsi."
      }
    ],
    step3KamusData: [
      {
        namaElemen: "Nomor Induk Kependudukan Pemuda dan Atlet",
        namaEntitas: "entitas_profil_kepemudaan_daerah",
        alias: "nik_pemuda_atlet",
        definisi: "Nomor identitas tunggal kependudukan bagi pemuda binaan, wirausaha muda, dan atlet berprestasi daerah.",
        tipeData: "String (Code)",
        formatPanjang: "CHAR(16)",
        satuan: "-",
        sifatKewajiban: "Mandatory",
        isPrimaryKey: true,
        idStandar: "Kode Wilayah Administrasi Pemerintahan (Kemendagri)",
        aturanValidasi: "Wajib unik, tidak boleh NULL, 16 karakter numerik tervalidasi Dukcapil."
      },
      {
        namaElemen: "Kode Wilayah Administrasi Daerah",
        namaEntitas: "entitas_profil_kepemudaan_daerah",
        alias: "kode_wilayah",
        definisi: "Kode unik wilayah administrasi pemerintahan provinsi dan kabupaten/kota tempat domisili pemuda dan sarana olahraga.",
        tipeData: "String (Code)",
        formatPanjang: "CHAR(10)",
        satuan: "-",
        sifatKewajiban: "Mandatory",
        isPrimaryKey: false,
        idStandar: "Kode Wilayah Administrasi Pemerintahan (Kemendagri)",
        aturanValidasi: "Format kode wilayah Kemendagri yang sah."
      },
      {
        namaElemen: "Indeks Pembangunan Pemuda dan Kategori Cabang Olahraga",
        namaEntitas: "entitas_prestasi_dan_sarana_olahraga",
        alias: "kategori_pemuda_olahraga",
        definisi: "Klasifikasi bidang pengembangan kepemudaan, kewirausahaan pemuda, dan cabang olahraga prestasi daerah.",
        tipeData: "String",
        formatPanjang: "VARCHAR(100)",
        satuan: "Skor/Kategori",
        sifatKewajiban: "Mandatory",
        isPrimaryKey: false,
        idStandar: "Standar Data Statistik Nasional (SDSN)",
        aturanValidasi: "Tidak boleh kosong, memuat kategori resmi Kemenpora."
      }
    ]
  },
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
