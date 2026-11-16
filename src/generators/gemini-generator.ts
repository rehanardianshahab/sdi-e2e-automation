import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
import { FALLBACK_FAKE_DATA } from './fallback-fake-data.js';
import { SdiAutomationPayload } from '../schemas/sdi-e2e.schema.js';
import { sanitizePayload } from '../utils/page-error-guard.js';
import { resolveInstansiContext } from '../utils/instansi-helper.js';

dotenv.config();

export async function generateSdiE2EPayload(
  customTopic?: string,
  userEmail?: string
): Promise<SdiAutomationPayload> {
  const apiKey = process.env.GEMINI_API_KEY;
  const useAi = process.env.USE_AI_GENERATOR === 'true';

  const instansiCtx = resolveInstansiContext(userEmail);
  const topic = customTopic || process.env.AI_SCENARIO_TOPIC || instansiCtx.defaultTopic;

  if (!useAi || !apiKey || apiKey === 'MASUKKAN_GEMINI_API_KEY_ANDA_DI_SINI') {
    return sanitizePayload(FALLBACK_FAKE_DATA, userEmail);
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `
Buatkan data pengisian form End-to-End Portal Satu Data Indonesia (SDI) bertema: "${topic}".
Output HARUS JSON objek lengkap dengan 4 key utama: "kebutuhanData", "registrasiDataset", "registrasiLayananLID", dan "pengajuanAksesLID".

=== ATURAN MUTLAK INSTANSI ===
Instansi yang diizinkan di seluruh payload HANYA DUA:
1. Kementerian Dalam Negeri (Kemendagri) - sebagai Pengusul / Pemohon
2. Kementerian Pemuda dan Olahraga (Kemenpora) - sebagai Target Instansi / Walidata & Produsen Data
DILARANG KERAS memunculkan atau memilih instansi lain di luar Kemendagri dan Kemenpora!

=== KONTEKS HUBUNGAN INSTANSI PENGUSUL & TARGET ===
Instansi Pengusul yang login : ${instansiCtx.loginInstansiName} (${instansiCtx.loginEmail})
Instansi Target yang dituju  : ${instansiCtx.targetInstansi}
- kebutuhanData.instansiIndikasi HARUS: "${instansiCtx.targetInstansi}"
- kebutuhanData.produsenData HARUS unit di bawah ${instansiCtx.targetInstansi} (misal "${instansiCtx.targetProdusenData}")
- kebutuhanData.waliData HARUS unit di ${instansiCtx.targetInstansi} (misal "${instansiCtx.targetWaliData}")

Pastikan seluruh field mematuhi batasan karakter dan ENUM berikut secara ketat:
1. kebutuhanData:
   - namaData: maksimal 100 karakter (tema kepemudaan, wirausaha muda, prestasi olahraga daerah, atau sarana olahraga).
   - instansiIndikasi: "${instansiCtx.targetInstansi}".
   - produsenData: Unit kerja terkait di ${instansiCtx.targetInstansi}.
   - waliData: Unit walidata di ${instansiCtx.targetInstansi}.
   - tujuanPengusulan: maksimal 255 karakter (sinkronisasi data kepemudaan & olahraga lintas instansi ${instansiCtx.loginInstansiName} dengan ${instansiCtx.targetInstansi}).
   - catatanReviewSekretariat: persetujuan usulan.
2. registrasiDataset:
   - step1Informasi.deskripsi: ringkasan ruang lingkup dataset kepemudaan & olahraga Kemenpora, MAKSIMAL 255 KARAKTER.
   - step1Informasi.tema: salah satu dari ["Pembangunan Daerah", "Budaya dan Agama", "Pendidikan dan Tenaga Kerja", "Pemerintahan Umum"].
   - step1Informasi.jenisData: salah satu dari ["Data Statistik", "Data Spasial", "Data Keuangan", "Data Induk", "Kode Referensi", "Data Transaksi", "Data lainnya"].
   - step1Informasi.klasifikasiRisiko: "Terbuka" | "Terbatas" | "Tertutup".
   - step1Informasi.frekuensi: "Real-time" | "Harian" | "Mingguan" | "Bulanan" | "Triwulan" | "Tahunan".
   - step1Informasi.formatData: array minimal 2 dari ["JSON", "CSV", "XML", "REST API", "SOAP", "Excel"].
   - dampakKerahasiaan, dampakIntegritas, dampakKetersediaan: "rendah" | "sedang" | "tinggi".
   - step2Entitas: 2 entitas dengan namaEntitas snake_case dan definisi (maksimal 255 karakter).
   - step3KamusData: minimal 3 elemen yang merujuk ke namaEntitas di step2Entitas, minimal 1 elemen isPrimaryKey: true, tipeData dari ["String", "String (Code)", "Integer", "Boolean", "Float", "Date", "DateTime", "Text"], sifatKewajiban dari ["Mandatory", "Optional"], idStandar dari ["Standar Data Statistik Nasional (SDSN)", "Katalog Unsur Geografi Indonesia (KUGI)", "Standar Metadata Kesehatan (Kemenkes)", "Kode Wilayah Administrasi Pemerintahan (Kemendagri)", "Standar Klasifikasi Baku Lapangan Usaha (KBLI)", "Tidak menggunakan data rujukan"].
3. registrasiLayananLID:
   - apiTitle, apiName, apiDesc, exchangeMethod: "REST API", format: "JSON", keamanan: "Melalui Gateway SPLP (Kredensial Khusus)", endpointUrl, documentationUrl, version: "1.0.0", slaAvailability: "99.9%".
4. pengajuanAksesLID:
   - classificationType: "terbatas" | "terbuka",
   - peranIndex: 1,
   - peranLabel: "Produsen Data (Mendukung produksi data resmi instansi)",
   - namaSistem: Nama sistem pemohon di ${instansiCtx.loginInstansiName} (misal SIPD Kemendagri),
   - layananDiminta: nama layanan interoperabilitas Kemenpora,
   - levelData: "dataset",
   - tujuanPenggunaan, dasarKewenangan, granularitas, periodeAwal: "2026-11-10", periodeAkhir: "2026-11-25", frekuensiAkses: "1000 request/hari", metodePertukaran: "Web Service / REST API (SPLP)", komitmenKeamanan.
    `.trim();

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const text = response.text;
    if (!text) return sanitizePayload(FALLBACK_FAKE_DATA, userEmail);
    const parsed = JSON.parse(text) as Partial<SdiAutomationPayload>;
    return sanitizePayload(parsed, userEmail);
  } catch (err: any) {
    console.error(`[Generator] Gagal menghubungi Gemini API: ${err.message}. Menggunakan fallback fake data.`);
    return sanitizePayload(FALLBACK_FAKE_DATA, userEmail);
  }
}
