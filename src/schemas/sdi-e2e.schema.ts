export interface KebutuhanDataPayload {
  namaData: string;
  instansiIndikasi: string;
  produsenData: string;
  waliData: string;
  tujuanPengusulan: string;
  catatanReviewSekretariat: string;
}

export interface RegistrasiDatasetPayload {
  step1Informasi: {
    nama: string;
    deskripsi: string;
    tema: string;
    jenisData: string;
    klasifikasiRisiko: 'Terbuka' | 'Terbatas' | 'Tertutup';
    frekuensi: string;
    formatData: string[];
    dampakKerahasiaan: 'rendah' | 'sedang' | 'tinggi';
    dampakIntegritas: 'rendah' | 'sedang' | 'tinggi';
    dampakKetersediaan: 'rendah' | 'sedang' | 'tinggi';
    lisensi: string;
    versi: string;
    standar: string;
    kodeReferensi: string;
    tujuanPemanfaatan: string;
    kontak: string;
  };
  step2Entitas: Array<{
    namaEntitas: string;
    definisi: string;
  }>;
  step3KamusData: Array<{
    namaElemen: string;
    namaEntitas: string;
    alias: string;
    definisi: string;
    tipeData: string;
    formatPanjang: string;
    satuan: string;
    sifatKewajiban: string;
    isPrimaryKey: boolean;
    idStandar: string;
    aturanValidasi: string;
  }>;
}

export interface RegistrasiLayananPayload {
  apiTitle: string;
  apiName: string;
  apiDesc: string;
  exchangeMethod: string;
  format: string;
  keamanan: string;
  endpointUrl: string;
  documentationUrl: string;
  version: string;
  slaAvailability: string;
}

export interface PengajuanAksesPayload {
  classificationType: 'terbuka' | 'terbatas';
  peranIndex: number;
  peranLabel: string;
  namaSistem: string;
  layananDiminta: string;
  levelData: 'dataset' | 'entitas' | 'elemen';
  tujuanPenggunaan: string;
  dasarKewenangan: string;
  granularitas: string;
  periodeAwal: string;
  periodeAkhir: string;
  frekuensiAkses: string;
  metodePertukaran: string;
  komitmenKeamanan: string;
}

export interface SdiAutomationPayload {
  kebutuhanData: KebutuhanDataPayload;
  registrasiDataset: RegistrasiDatasetPayload;
  registrasiLayananLID: RegistrasiLayananPayload;
  pengajuanAksesLID: PengajuanAksesPayload;
}

