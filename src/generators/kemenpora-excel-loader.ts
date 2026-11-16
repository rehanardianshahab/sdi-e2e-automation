import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import type { Page } from 'playwright';
import { SdiAutomationPayload } from '../schemas/sdi-e2e.schema.js';
import { resolveInstansiContext } from '../utils/instansi-helper.js';
import { assertNoValidationErrors } from '../utils/page-error-guard.js';

export interface RegDatasetRow {
  idDataset: string;       // e.g. DS-PORA-001 s.d. DS-PORA-030
  idAplikasi: string;      // e.g. APP-PORA-001
  namaDataset: string;     // e.g. olahragawan
  deskripsiDataset: string;// e.g. Tabel untuk menyimpan data olahragawan
  frekuensiPemutakhiran: string; // e.g. Tahunan
  klasifikasiRisiko: 'Terbuka' | 'Terbatas' | 'Tertutup'; // e.g. Terbatas
  formatData: string;      // e.g. JSON
}

export interface RegEntitasDataRow {
  idData: string;          // e.g. DT-PORA-001 s.d. DT-PORA-030
  idDataset: string;       // e.g. DS-PORA-001 s.d. DS-PORA-030
  namaEntitas: string;     // e.g. olahragawan
  definisi: string;        // e.g. Tabel untuk menyimpan data olahragawan
  produsenData: string;    // e.g. Asisten Deputi Tenaga dan Organisasi Olahraga Prestasi, IOCO, NPC
  relasiEntitas: string[]; // e.g. ['pelatnas_atlet', 'atlet_cabor', ...]
}

export interface RegKamusDataRow {
  idElemen: string;        // e.g. DE-PORA-001 s.d. DE-PORA-211
  idData: string;          // e.g. DT-PORA-001 s.d. DT-PORA-030
  namaElemen: string;      // e.g. id_olahragawan
  alias: string;           // e.g. id_olahragawan (auto-filled from namaElemen if blank in Excel)
  definisi: string;        // e.g. ID unik data talenta
  satuan: string;          // e.g. - (auto-filled with '-' if blank in Excel)
  tipeDataRaw: string;     // e.g. varchar, int, date, text, tinyint, enum(...)
  tipeDataMapped: string;  // e.g. String, Integer, Date, DateTime, Text
  formatPanjangRaw: string;// e.g. 50, 21, 255
  formatPanjang: string;   // e.g. 50, 21, 255 (panjang karakter untuk #input-dataset-step3-modal-format-panjang)
  idStandar: string;       // e.g. Standar Data Statistik Nasional (SDSN)
  sifatKewajiban: 'Mandatory' | 'Optional';
  isPrimaryKey: boolean;
}

export interface KemenporaDatasetBundle {
  idData: string;          // DT-PORA-001 s.d. DT-PORA-030
  idDataset: string;       // DS-PORA-001 s.d. DS-PORA-030
  dataset: RegDatasetRow;
  entitas: RegEntitasDataRow;
  kamusData: RegKamusDataRow[];
}

const DEFAULT_XLSX_PATH = path.resolve(process.cwd(), 'fixtures/data-model-kemenpora.xlsx');
const ROUND_ROBIN_STATE_FILE = path.resolve(process.cwd(), '.last-kemenpora-dataset-idx');

/**
 * Pure Node.js ZIP reader for .xlsx files (reads Central Directory & inflates entries)
 */
function readZipEntries(filePath: string): Map<string, Buffer> {
  const buf = fs.readFileSync(filePath);
  const entries = new Map<string, Buffer>();

  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error(`Invalid .xlsx ZIP file: EOCD not found in ${filePath}`);
  }

  const cdCount = buf.readUInt16LE(eocdOffset + 10);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);

  let ptr = cdOffset;
  for (let i = 0; i < cdCount; i++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) break;
    const compressionMethod = buf.readUInt16LE(ptr + 10);
    const compressedSize = buf.readUInt32LE(ptr + 20);
    const fileNameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localHeaderOffset = buf.readUInt32LE(ptr + 42);
    const fileName = buf.toString('utf8', ptr + 46, ptr + 46 + fileNameLen);

    const localNameLen = buf.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const rawData = buf.subarray(dataStart, dataStart + compressedSize);

    if (compressionMethod === 0) {
      entries.set(fileName, rawData);
    } else if (compressionMethod === 8) {
      entries.set(fileName, zlib.inflateRawSync(rawData));
    }

    ptr += 46 + fileNameLen + extraLen + commentLen;
  }

  return entries;
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Parse worksheet rows from raw XML string and sharedStrings array
 */
function parseSheetXml(xml: string, sst: string[]): Array<Record<string, string>> {
  const rows: Array<Record<string, string>> = [];
  const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  const cellRegex = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;

  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(xml)) !== null) {
    const rowContent = rowMatch[1];
    const rowCells: Record<string, string> = {};
    let cellMatch: RegExpExecArray | null;

    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      const attrs = cellMatch[1];
      const inner = cellMatch[2] || '';

      const refMatch = /\br="([A-Z]+)\d+"/.exec(attrs);
      if (!refMatch) continue;
      const col = refMatch[1];
      if (!inner) {
        rowCells[col] = '';
        continue;
      }

      const typeMatch = /\bt="([^"]+)"/.exec(attrs);
      const cellType = typeMatch ? typeMatch[1] : '';

      let val = '';
      if (cellType === 'inlineStr') {
        const tMatches = inner.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g) || [];
        val = tMatches
          .map((m) => decodeXmlEntities(m.replace(/<\/?t(?:\s[^>]*)?>/g, '')))
          .join('');
      } else {
        const vMatch = /<v>([\s\S]*?)<\/v>/.exec(inner);
        const rawV = vMatch ? decodeXmlEntities(vMatch[1].trim()) : '';
        if (cellType === 's' && rawV !== '') {
          const idx = parseInt(rawV, 10);
          val = sst[idx] ?? '';
        } else {
          val = rawV;
        }
      }

      rowCells[col] = val.trim();
    }

    if (Object.values(rowCells).some((v) => v !== '')) {
      rows.push(rowCells);
    }
  }

  return rows;
}

function mapSqlTypeToSdiType(sqlType: string): string {
  const t = (sqlType || '').toLowerCase().trim();
  if (t.includes('int')) return 'Integer';
  if (t.includes('date') && !t.includes('time')) return 'Date';
  if (t.includes('timestamp') || t.includes('datetime')) return 'DateTime';
  if (t.includes('text')) return 'Text';
  if (t.includes('float') || t.includes('double') || t.includes('decimal')) return 'Float';
  if (t.includes('bool')) return 'Boolean';
  return 'String';
}

function normalizeFormatPanjang(sqlType: string, rawLen: string): string {
  let cleanLen = (rawLen || '').trim();
  if (cleanLen.endsWith('.0')) {
    cleanLen = cleanLen.slice(0, -2);
  }
  if (!cleanLen || cleanLen === '-') {
    const t = (sqlType || '').toLowerCase();
    if (t.includes('date') && !t.includes('time')) return '10';
    if (t.includes('timestamp') || t.includes('datetime')) return '19';
    if (t.includes('year')) return '4';
    if (t.includes('int')) return '11';
    return '255';
  }
  return cleanLen;
}

let cachedCatalog: KemenporaDatasetBundle[] | null = null;

/**
 * Membaca dan mem-parsing worksheet RegDataset, RegEntitasData, dan RegKamusData
 * dari file fixtures/data-model-kemenpora.xlsx dan memetakannya berdasarkan ID Data (DT-PORA-001 s.d. DT-PORA-030)
 */
export function loadKemenporaExcelCatalog(xlsxPath = DEFAULT_XLSX_PATH): KemenporaDatasetBundle[] {
  if (cachedCatalog && xlsxPath === DEFAULT_XLSX_PATH) {
    return cachedCatalog;
  }

  if (!fs.existsSync(xlsxPath)) {
    throw new Error(`File Excel Kemenpora tidak ditemukan di: ${xlsxPath}`);
  }

  const entries = readZipEntries(xlsxPath);

  // 1. Parse Shared Strings (xl/sharedStrings.xml)
  const sst: string[] = [];
  const sstBuf = entries.get('xl/sharedStrings.xml');
  if (sstBuf) {
    const sstXml = sstBuf.toString('utf8');
    const siRegex = /<si>([\s\S]*?)<\/si>/g;
    let siMatch: RegExpExecArray | null;
    while ((siMatch = siRegex.exec(sstXml)) !== null) {
      const siInner = siMatch[1];
      const tMatches = siInner.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g) || [];
      const text = tMatches
        .map((m) => decodeXmlEntities(m.replace(/<\/?t(?:\s[^>]*)?>/g, '')))
        .join('');
      sst.push(text);
    }
  }

  // 2. Map sheet names to target XML paths via xl/workbook.xml & xl/_rels/workbook.xml.rels
  const wbXml = entries.get('xl/workbook.xml')?.toString('utf8') || '';
  const relsXml = entries.get('xl/_rels/workbook.xml.rels')?.toString('utf8') || '';

  const relMap = new Map<string, string>();
  const relRegex = /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g;
  let relMatch: RegExpExecArray | null;
  while ((relMatch = relRegex.exec(relsXml)) !== null) {
    relMap.set(relMatch[1], `xl/${relMatch[2].replace(/^\/+/, '')}`);
  }

  const sheetTargetByName = (keyword: string): string | undefined => {
    const sheetRegex = /<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g;
    let sm: RegExpExecArray | null;
    while ((sm = sheetRegex.exec(wbXml)) !== null) {
      if (sm[1].toLowerCase().includes(keyword.toLowerCase())) {
        return relMap.get(sm[2]);
      }
    }
    return undefined;
  };

  const regDatasetPath = sheetTargetByName('RegDataset');
  const regEntitasPath = sheetTargetByName('RegEntitasData');
  const regKamusPath = sheetTargetByName('RegKamusData');

  if (!regDatasetPath || !regEntitasPath || !regKamusPath) {
    throw new Error(
      `Worksheet tidak lengkap di ${xlsxPath}. Ditemukan: RegDataset=${regDatasetPath}, RegEntitasData=${regEntitasPath}, RegKamusData=${regKamusPath}`
    );
  }

  const dsRowsRaw = parseSheetXml(entries.get(regDatasetPath)!.toString('utf8'), sst);
  const entRowsRaw = parseSheetXml(entries.get(regEntitasPath)!.toString('utf8'), sst);
  const kamusRowsRaw = parseSheetXml(entries.get(regKamusPath)!.toString('utf8'), sst);

  // 3. Parse RegDataset (DS-PORA-001 s.d. DS-PORA-030)
  const datasets: RegDatasetRow[] = [];
  for (const r of dsRowsRaw) {
    const idDataset = r['A'] || '';
    if (!idDataset.startsWith('DS-PORA-')) continue;
    const rawRisk = (r['F'] || 'Terbatas').trim();
    const klasifikasiRisiko: 'Terbuka' | 'Terbatas' | 'Tertutup' =
      rawRisk === 'Terbuka' || rawRisk === 'Tertutup' ? rawRisk : 'Terbatas';

    datasets.push({
      idDataset,
      idAplikasi: r['B'] || 'APP-PORA-001',
      namaDataset: (r['C'] || '').trim(),
      deskripsiDataset: (r['D'] || '').trim(),
      frekuensiPemutakhiran: (r['E'] || 'Tahunan').trim(),
      klasifikasiRisiko,
      formatData: (r['G'] || 'JSON').trim()
    });
  }

  // 4. Parse RegEntitasData (DT-PORA-001 s.d. DT-PORA-030, dipetakan 1-ke-1 dengan DS-PORA-001 s.d. DS-PORA-030)
  const entitasByDatasetId = new Map<string, RegEntitasDataRow>();
  let lastProdusen = 'Asisten Deputi Tenaga dan Organisasi Olahraga Prestasi, IOCO, NPC';

  for (const r of entRowsRaw) {
    const idDataset = (r['B'] || '').trim();
    if (!idDataset.startsWith('DS-PORA-')) continue;

    const numSuffix = idDataset.replace('DS-PORA-', '');
    const idData = (r['A'] || '').trim() || `DT-PORA-${numSuffix}`;
    const namaEntitas = (r['C'] || '').trim();
    const definisi = (r['D'] || '').trim();
    const rawProdusen = (r['E'] || '').replace(/^-\s*/gm, '').replace(/\n+/g, ', ').trim();
    if (rawProdusen) lastProdusen = rawProdusen;

    const relasiEntitas = (r['F'] || '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    entitasByDatasetId.set(idDataset, {
      idData,
      idDataset,
      namaEntitas,
      definisi,
      produsenData: rawProdusen || lastProdusen,
      relasiEntitas
    });
  }

  // 5. Parse RegKamusData (forward-fill col B 'ID Data' DT-PORA-001 s.d. DT-PORA-030)
  const kamusByDataId = new Map<string, RegKamusDataRow[]>();
  let currentIdData = 'DT-PORA-001';

  for (const r of kamusRowsRaw) {
    const idElemen = (r['A'] || '').trim();
    if (!idElemen.startsWith('DE-PORA-')) continue;

    if (r['B'] && r['B'].trim().startsWith('DT-PORA-')) {
      currentIdData = r['B'].trim();
    }

    const namaElemen = (r['C'] || '').trim();
    const rawAlias = (r['D'] || '').trim();
    const alias = rawAlias || namaElemen.replace(/\s+/g, '_').toLowerCase();
    const definisi = (r['E'] || namaElemen).trim();
    const rawSatuan = (r['F'] || '').trim();
    const satuan = rawSatuan || '-';
    const tipeDataRaw = (r['G'] || 'varchar').trim();
    const tipeDataMapped = mapSqlTypeToSdiType(tipeDataRaw);
    const formatPanjangRaw = (r['H'] || '').trim();
    const formatPanjang = normalizeFormatPanjang(tipeDataRaw, formatPanjangRaw);
    const idStandar = (r['I'] || '').trim() || 'Standar Data Statistik Nasional (SDSN)';
    const rawKewajiban = (r['J'] || 'Mandatory').trim();
    const sifatKewajiban: 'Mandatory' | 'Optional' =
      rawKewajiban.toLowerCase() === 'optional' ? 'Optional' : 'Mandatory';

    const list = kamusByDataId.get(currentIdData) || [];
    const isPrimaryKey = list.length === 0;

    list.push({
      idElemen,
      idData: currentIdData,
      namaElemen,
      alias,
      definisi,
      satuan,
      tipeDataRaw,
      tipeDataMapped,
      formatPanjangRaw,
      formatPanjang,
      idStandar,
      sifatKewajiban,
      isPrimaryKey
    });
    kamusByDataId.set(currentIdData, list);
  }

  // 6. Bundle berdasarkan ID Data (DT-PORA-001 s.d. DT-PORA-030) & ID Dataset (DS-PORA-001 s.d. DS-PORA-030)
  const bundles: KemenporaDatasetBundle[] = datasets.map((ds) => {
    const numSuffix = ds.idDataset.replace('DS-PORA-', '');
    const defaultIdData = `DT-PORA-${numSuffix}`;
    const entitas = entitasByDatasetId.get(ds.idDataset) || {
      idData: defaultIdData,
      idDataset: ds.idDataset,
      namaEntitas: ds.namaDataset,
      definisi: ds.deskripsiDataset,
      produsenData: lastProdusen,
      relasiEntitas: []
    };
    const kamusData = kamusByDataId.get(entitas.idData) || [];
    return {
      idData: entitas.idData,
      idDataset: ds.idDataset,
      dataset: ds,
      entitas,
      kamusData
    };
  });

  if (xlsxPath === DEFAULT_XLSX_PATH) {
    cachedCatalog = bundles;
  }

  return bundles;
}

/**
 * Mengambil bundle berdasarkan ID Data (misal "DT-PORA-001"), ID Dataset ("DS-PORA-001"),
 * atau Nama Dataset/Entitas ("olahragawan").
 * Jika tidak diberikan parameter, memilih secara bergilir (round-robin) dari 30 ID Data.
 */
export function pickKemenporaDataset(idDataOrDatasetId?: string): KemenporaDatasetBundle {
  const catalog = loadKemenporaExcelCatalog();
  const targetQuery = (
    idDataOrDatasetId ||
    process.env.ID_DATA ||
    process.env.DATASET_ID ||
    ''
  ).trim();

  if (targetQuery) {
    const found = catalog.find(
      (b) =>
        b.idData.toLowerCase() === targetQuery.toLowerCase() ||
        b.idDataset.toLowerCase() === targetQuery.toLowerCase() ||
        b.dataset.namaDataset.toLowerCase() === targetQuery.toLowerCase() ||
        b.entitas.namaEntitas.toLowerCase() === targetQuery.toLowerCase()
    );
    if (found) {
      return found;
    }
  }

  let nextIdx = 0;
  try {
    if (fs.existsSync(ROUND_ROBIN_STATE_FILE)) {
      const lastIdx = parseInt(fs.readFileSync(ROUND_ROBIN_STATE_FILE, 'utf8').trim(), 10);
      if (!isNaN(lastIdx)) {
        nextIdx = (lastIdx + 1) % catalog.length;
      }
    }
    fs.writeFileSync(ROUND_ROBIN_STATE_FILE, String(nextIdx), 'utf8');
  } catch {
    nextIdx = Math.floor(Math.random() * catalog.length);
  }

  return catalog[nextIdx];
}

/**
 * Membangun payload SdiAutomationPayload lengkap dari bundle worksheet
 * RegDataset, RegEntitasData, dan RegKamusData berdasarkan ID Data
 */
export function buildSdiPayloadFromKemenporaExcel(options?: {
  datasetId?: string;
  idData?: string;
  userEmail?: string;
  caseType?: 'terbatas' | 'tertutup' | 'revisi';
}): SdiAutomationPayload & {
  excelMeta: {
    idDataset: string;
    idData: string;
    namaDataset: string;
    namaEntitas: string;
    totalElemen: number;
  };
} {
  const bundle = pickKemenporaDataset(options?.idData || options?.datasetId);
  const { dataset, entitas, kamusData } = bundle;
  const instansiCtx = resolveInstansiContext(options?.userEmail);

  const isTertutup = options?.caseType === 'tertutup';
  const klasifikasiRisiko: 'Terbuka' | 'Terbatas' | 'Tertutup' = isTertutup
    ? 'Tertutup'
    : dataset.klasifikasiRisiko;

  const deskripsiDataset = dataset.deskripsiDataset.slice(0, 255);

  return {
    excelMeta: {
      idDataset: dataset.idDataset,
      idData: entitas.idData,
      namaDataset: dataset.namaDataset,
      namaEntitas: entitas.namaEntitas,
      totalElemen: kamusData.length
    },
    kebutuhanData: {
      namaData: `${dataset.namaDataset} - ${dataset.deskripsiDataset}`.slice(0, 90),
      instansiIndikasi: instansiCtx.targetInstansi,
      produsenData: entitas.produsenData || instansiCtx.targetProdusenData,
      waliData: 'Biro Perencanaan, Manajemen Kinerja dan Data (SIMT Kemenpora)',
      tujuanPengusulan: `Registrasi Data Kemenpora MTN (${dataset.idDataset} / ${entitas.idData}) tabel ${dataset.namaDataset}: ${dataset.deskripsiDataset}.`.slice(0, 255),
      catatanReviewSekretariat: `Ditetapkan untuk registrasi data MTN Kemenpora ${dataset.idDataset} (${entitas.idData} - ${dataset.namaDataset}).`
    },
    registrasiDataset: {
      step1Informasi: {
        idDataset: dataset.idDataset,
        idAplikasi: dataset.idAplikasi,
        nama: dataset.namaDataset,
        deskripsi: deskripsiDataset,
        tema: 'Pendidikan dan Tenaga Kerja',
        jenisData: 'Data Induk',
        klasifikasiRisiko,
        frekuensi: dataset.frekuensiPemutakhiran || 'Tahunan',
        formatData: [dataset.formatData || 'JSON'],
        dampakKerahasiaan: isTertutup ? 'tinggi' : 'sedang',
        dampakIntegritas: 'tinggi',
        dampakKetersediaan: isTertutup ? 'tinggi' : 'sedang',
        lisensi: 'Creative Commons Attribution',
        versi: 'SIMT Kemenpora 1.0',
        standar: 'Standar Data Statistik Nasional',
        kodeReferensi: 'Kode Wilayah Administrasi Pemerintahan (Kemendagri)',
        tujuanPemanfaatan: `Interoperabilitas data ${dataset.namaDataset} (${dataset.deskripsiDataset}) pada Sistem Informasi Manajemen Talenta (SIMT) Kemenpora.`,
        kontak: 'pusdatin@kemenpora.go.id / https://simt.kemenpora.go.id/'
      },
      step2Entitas: [
        {
          idData: entitas.idData,
          idDataset: entitas.idDataset,
          namaEntitas: entitas.namaEntitas,
          definisi: entitas.definisi.slice(0, 255),
          produsenData: entitas.produsenData,
          relasiEntitas: entitas.relasiEntitas
        }
      ],
      step3KamusData: kamusData.map((el) => ({
        idElemen: el.idElemen,
        idData: el.idData,
        namaElemen: el.namaElemen,
        namaEntitas: entitas.namaEntitas,
        alias: el.alias,
        definisi: el.definisi.slice(0, 255),
        tipeData: el.tipeDataRaw,
        formatPanjang: el.formatPanjang,
        satuan: el.satuan,
        sifatKewajiban: el.sifatKewajiban,
        isPrimaryKey: el.isPrimaryKey,
        idStandar: el.idStandar,
        aturanValidasi: `${el.sifatKewajiban} - Tipe ${el.tipeDataRaw}(${el.formatPanjang}) (${el.idElemen})`
      }))
    },
    registrasiLayananLID: {
      apiTitle: `Layanan REST API SIMT Kemenpora - ${dataset.namaDataset} (${dataset.idDataset})`,
      apiName: `api-simt-kemenpora-${dataset.namaDataset.replace(/_/g, '-')}-v1`,
      apiDesc: `Layanan interoperabilitas SKDN/SPLP untuk dataset ${dataset.namaDataset} (${dataset.deskripsiDataset}) pada SIMT Kemenpora.`.slice(0, 255),
      exchangeMethod: 'REST API',
      format: dataset.formatData || 'JSON',
      keamanan: 'Melalui Gateway SPLP (Kredensial Khusus)',
      endpointUrl: `https://simt.kemenpora.go.id/api/v1/${dataset.namaDataset}`,
      documentationUrl: `https://simt.kemenpora.go.id/docs/openapi/${dataset.namaDataset}.json`,
      version: '1.0.0',
      slaAvailability: '99.9%'
    },
    pengajuanAksesLID: {
      classificationType: 'terbatas',
      peranIndex: 1,
      peranLabel: 'Produsen Data (Mendukung produksi data resmi instansi)',
      namaSistem: 'Sistem Informasi Pemerintahan Daerah & Kependudukan (SIPD Kemendagri)',
      layananDiminta: `Layanan REST API SIMT Kemenpora - ${dataset.namaDataset} (${dataset.idDataset})`,
      levelData: 'dataset',
      tujuanPenggunaan: `Integrasi dan pemanfaatan dataset ${dataset.namaDataset} (${dataset.deskripsiDataset}) dari SIMT Kemenpora untuk sinkronisasi data nasional.`,
      dasarKewenangan: 'Peraturan Presiden Nomor 39 Tahun 2019 tentang Satu Data Indonesia dan Desain Besar Olahraga Nasional (DBON).',
      granularitas: 'Mikro',
      periodeAwal: '2026-11-10',
      periodeAkhir: '2026-11-25',
      frekuensiAkses: '1000 request/hari',
      metodePertukaran: 'Web Service / REST API (SPLP)',
      komitmenKeamanan: 'Koneksi Terenkripsi TLS 1.3 via Gateway SPLP, autentikasi OAuth2 Client Credentials, dan audit log.'
    }
  };
}

/**
 * Mengisi form Registrasi Dataset pada Portal SDI:
 * - Step 1: Insert Dataset dari worksheet RegDataset (berdasarkan ID Dataset DS-PORA-xxx)
 * - Step 2: Insert Entitas dari worksheet RegEntitasData (berdasarkan ID Data DT-PORA-xxx)
 * - Step 3: Insert seluruh elemen Kamus Data dari worksheet RegKamusData yang memiliki ID Data DT-PORA-xxx
 */
export async function fillDatasetRegistrationFromExcelPayload(
  page: Page,
  payload: SdiAutomationPayload,
  options?: { validateErrors?: boolean }
): Promise<void> {
  const step1 = payload.registrasiDataset.step1Informasi;
  const step2List = payload.registrasiDataset.step2Entitas;
  const step3List = payload.registrasiDataset.step3KamusData;
  const validate = options?.validateErrors !== false;

  // ==========================================================================
  // STEP 1: INSERT DATASET DARI WORKSHEET RegDataset
  // ==========================================================================
  console.log(
    `   ▶ [Step 1 - RegDataset] Insert Dataset ${step1.idDataset || ''} (${step1.nama})...`
  );
  const descInput = page.locator('#input-dataset-step1-deskripsi, textarea').first();
  if (await descInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await descInput.fill((step1.deskripsi || 'Tabel untuk menyimpan data keolahragaan').slice(0, 255));
  }

  // Klasifikasi Risiko: Terbuka | Terbatas | Tertutup
  const targetKlasifikasi = step1.klasifikasiRisiko || 'Terbatas';
  const risikoIdMap: Record<string, string> = {
    Terbuka: '#button-dataset-step1-risiko-terbuka',
    Terbatas: '#button-dataset-step1-risiko-terbatas',
    Tertutup: '#button-dataset-step1-risiko-tertutup'
  };
  const specificRisikoBtn = page.locator(risikoIdMap[targetKlasifikasi] || '#button-dataset-step1-risiko-terbatas').first();
  if (await specificRisikoBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    const btnClass = (await specificRisikoBtn.getAttribute('class')) || '';
    if (!btnClass.includes('emerald') && !btnClass.includes('primary')) {
      await specificRisikoBtn.click({ force: true });
    }
    console.log(`      🏷️ Klasifikasi Risiko: ${targetKlasifikasi}`);
  } else {
    const fallbackRisikoBtn = page.locator(`button:has-text("${targetKlasifikasi}")`).first();
    if (await fallbackRisikoBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await fallbackRisikoBtn.click({ force: true });
      console.log(`      🏷️ Klasifikasi Risiko: ${targetKlasifikasi}`);
    }
  }

  // Format Data: JSON (pastikan aktif, jangan toggle off jika sudah aktif)
  const jsonBtn = page.locator('#button-dataset-step1-format-json').first();
  if (await jsonBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    const jsonClass = (await jsonBtn.getAttribute('class')) || '';
    if (!jsonClass.includes('emerald') && !jsonClass.includes('primary')) {
      await jsonBtn.click({ force: true });
      console.log('      📁 Format Data: JSON diaktifkan');
    } else {
      console.log('      📁 Format Data: JSON (sudah aktif)');
    }
  } else {
    for (const fmt of step1.formatData || ['JSON']) {
      const fmtBtn = page.locator(`button:has-text("${fmt}")`).first();
      if (await fmtBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await fmtBtn.click({ force: true }).catch(() => {});
      }
    }
  }

  // Isi Dropdown Selects di Step 1
  const temaSelect = page.locator('#select-dataset-step1-tema').first();
  if (await temaSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
    await temaSelect.selectOption({ label: step1.tema || 'Pendidikan dan Tenaga Kerja' }).catch(async () => {
      await temaSelect.selectOption({ index: 4 }).catch(() => {});
    });
    await temaSelect.dispatchEvent('change').catch(() => {});
  }

  const jenisSelect = page.locator('#select-dataset-step1-jenis-data').first();
  if (await jenisSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
    await jenisSelect.selectOption({ label: 'Data Induk' }).catch(async () => {
      await jenisSelect.selectOption({ index: 4 }).catch(() => {});
    });
    await jenisSelect.dispatchEvent('change').catch(() => {});
  }

  const frekuensiSelect = page.locator('#select-dataset-step1-frekuensi').first();
  if (await frekuensiSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
    await frekuensiSelect.selectOption({ label: step1.frekuensi || 'Tahunan' }).catch(async () => {
      await frekuensiSelect.selectOption({ label: 'Tahunan' }).catch(() => {});
    });
    await frekuensiSelect.dispatchEvent('change').catch(() => {});
  }

  const impactVal = targetKlasifikasi === 'Tertutup' ? 'tinggi' : 'sedang';
  const dampakKerahasiaan = page.locator('#select-dataset-step1-dampak-kerahasiaan').first();
  if (await dampakKerahasiaan.isVisible({ timeout: 1500 }).catch(() => false)) {
    await dampakKerahasiaan.selectOption({ value: impactVal }).catch(() => {});
    await dampakKerahasiaan.dispatchEvent('change').catch(() => {});
  }

  const dampakIntegritas = page.locator('#select-dataset-step1-dampak-integritas').first();
  if (await dampakIntegritas.isVisible({ timeout: 1500 }).catch(() => false)) {
    await dampakIntegritas.selectOption({ value: 'tinggi' }).catch(() => {});
    await dampakIntegritas.dispatchEvent('change').catch(() => {});
  }

  const dampakKetersediaan = page.locator('#select-dataset-step1-dampak-ketersediaan').first();
  if (await dampakKetersediaan.isVisible({ timeout: 1500 }).catch(() => false)) {
    await dampakKetersediaan.selectOption({ value: impactVal }).catch(() => {});
    await dampakKetersediaan.dispatchEvent('change').catch(() => {});
  }

  await page.waitForTimeout(500);
  if (validate) {
    await assertNoValidationErrors(page, 'Registrasi Dataset Step 1 (RegDataset)');
  }

  const nextBtn1 = page
    .locator('#button-dataset-next-step, button:has-text("Lanjut Langkah 2"), button:has-text("Lanjut")')
    .first();
  await nextBtn1.waitFor({ state: 'visible', timeout: 5000 });
  await nextBtn1.click({ force: true });
  await page.waitForTimeout(2000);
  console.log(`   ✅ [Step 1 - RegDataset] Dataset "${step1.nama}" berhasil disimpan.`);

  // ==========================================================================
  // STEP 2: INSERT ENTITAS DARI WORKSHEET RegEntitasData (BERDASARKAN ID DATA)
  // ==========================================================================
  for (const ent of step2List) {
    console.log(
      `   ▶ [Step 2 - RegEntitasData] Insert Entitas untuk ID Data ${ent.idData || ''} (${ent.namaEntitas})...`
    );
    const addEntitasBtn = page
      .locator('#button-dataset-step2-tambah-entitas, button:has-text("Tambah Entitas")')
      .first();
    await addEntitasBtn.waitFor({ state: 'visible', timeout: 10000 });
    await addEntitasBtn.click({ force: true });
    await page.waitForTimeout(1000);

    const entDialog = page.locator('[role="dialog"]').first();
    await entDialog.waitFor({ state: 'visible', timeout: 5000 });

    const entNameInput = entDialog.locator('#input-dataset-step2-nama-entitas, input').first();
    await entNameInput.fill(ent.namaEntitas);

    const entDefInput = entDialog.locator('#input-dataset-step2-definisi-entitas, textarea').first();
    await entDefInput.fill((ent.definisi || ent.namaEntitas).slice(0, 255));

    if (validate) {
      await assertNoValidationErrors(page, `Modal Tambah Entitas Step 2 [${ent.idData || ent.namaEntitas}]`);
    }

    const saveEntBtn = entDialog.locator('button:has-text("Tambah"), button:has-text("Simpan")').first();
    await saveEntBtn.click({ force: true });
    await page.waitForTimeout(1500);
    console.log(`   ✅ [Step 2 - RegEntitasData] Entitas "${ent.namaEntitas}" (${ent.idData || ''}) berhasil ditambahkan.`);
  }

  if (validate) {
    await assertNoValidationErrors(page, 'Registrasi Dataset Step 2 (RegEntitasData)');
  }

  const nextBtn2 = page
    .locator('#button-dataset-next-step, button:has-text("Lanjut Langkah 3"), button:has-text("Lanjut")')
    .first();
  await nextBtn2.waitFor({ state: 'visible', timeout: 5000 });
  await nextBtn2.click({ force: true });
  await page.waitForTimeout(2000);

  // ==========================================================================
  // STEP 3: INSERT KAMUS DATA DARI WORKSHEET RegKamusData BERDASARKAN ID DATA
  // ==========================================================================
  const targetIdData = step2List[0]?.idData || '';
  const elementsForIdData = targetIdData
    ? step3List.filter((el) => !el.idData || el.idData === targetIdData)
    : step3List;

  console.log(
    `   ▶ [Step 3 - RegKamusData] Menambahkan ${elementsForIdData.length} Elemen Kamus Data untuk ID Data ${targetIdData || step2List[0]?.namaEntitas || ''}...`
  );

  for (let i = 0; i < elementsForIdData.length; i++) {
    const elem = elementsForIdData[i];
    console.log(
      `      [${i + 1}/${elementsForIdData.length}] (${elem.idElemen || ''}) Insert elemen "${elem.namaElemen}" [Tipe: ${elem.tipeData}, Panjang: ${elem.formatPanjang}, Sifat: ${elem.sifatKewajiban}]...`
    );

    const addElemBtn = page
      .locator('#button-dataset-step3-tambah-elemen, button:has-text("Tambah Elemen")')
      .first();
    await addElemBtn.waitFor({ state: 'visible', timeout: 8000 });
    await addElemBtn.click({ force: true });
    await page.waitForTimeout(800);

    const elemDialog = page.locator('[role="dialog"]').first();
    await elemDialog.waitFor({ state: 'visible', timeout: 5000 });

    const namaElemInput = elemDialog.locator('#input-dataset-step3-modal-nama-elemen').first();
    if (await namaElemInput.isVisible({ timeout: 1500 }).catch(() => false)) {
      await namaElemInput.fill(elem.namaElemen);
      await elemDialog.locator('#input-dataset-step3-modal-alias').fill(elem.alias || elem.namaElemen);
      await elemDialog.locator('#textarea-dataset-step3-modal-definisi').fill((elem.definisi || elem.namaElemen).slice(0, 255));
      await elemDialog.locator('#input-dataset-step3-modal-satuan').fill(elem.satuan || '-');
      await elemDialog.locator('#input-dataset-step3-modal-format-panjang').fill(elem.formatPanjang || '50');
    } else {
      const inputs = elemDialog.locator('input:not([type="checkbox"]):not([type="radio"])');
      const inCount = await inputs.count();
      if (inCount >= 1) await inputs.nth(0).fill(elem.namaElemen);
      if (inCount >= 2) await inputs.nth(1).fill(elem.alias || elem.namaElemen);
      if (inCount >= 3) await inputs.nth(2).fill(elem.satuan || '-');
      if (inCount >= 4) await inputs.nth(3).fill(elem.formatPanjang || '50');
      const elDesc = elemDialog.locator('textarea').first();
      if (await elDesc.isVisible()) {
        await elDesc.fill((elem.definisi || elem.namaElemen).slice(0, 255));
      }
    }

    // Sifat Kewajiban (Mandatory / Optional)
    if (elem.sifatKewajiban === 'Optional') {
      const kewajibanTrigger = elemDialog.locator('#select-dataset-step3-modal-sifat-kewajiban').first();
      if (await kewajibanTrigger.isVisible({ timeout: 1000 }).catch(() => false)) {
        await kewajibanTrigger.click();
        await page.waitForTimeout(300);
        const opt = page.locator('[role="option"]:has-text("Optional")').first();
        if (await opt.isVisible({ timeout: 1500 }).catch(() => false)) {
          await opt.click();
        }
      }
    }

    if (validate) {
      await assertNoValidationErrors(page, `Modal Elemen Kamus Data [${elem.idElemen || elem.namaElemen}]`);
    }

    const saveElemBtn = elemDialog
      .locator('#button-dataset-step3-modal-simpan, button:has-text("Tambah Kamus Data"), button:has-text("Tambah"), button:has-text("Simpan")')
      .first();
    await saveElemBtn.click({ force: true });
    await page.waitForTimeout(1000);
  }

  console.log(
    `   ✅ [Step 3 - RegKamusData] Seluruh ${elementsForIdData.length} elemen kamus data untuk ${targetIdData} berhasil ditambahkan.`
  );
  if (validate) {
    await assertNoValidationErrors(page, 'Registrasi Dataset Step 3 (Daftar Kamus Data)');
  }
}
