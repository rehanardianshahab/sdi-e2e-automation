import * as dotenv from 'dotenv';
import { SdiAutomationPayload } from '../schemas/sdi-e2e.schema.js';
import { sanitizePayload } from '../utils/page-error-guard.js';
import { buildSdiPayloadFromKemenporaExcel } from './kemenpora-excel-loader.js';

dotenv.config();

/**
 * Menghasilkan payload End-to-End Portal Satu Data Indonesia (SDI)
 * secara langsung dari file Excel Kemenpora (fixtures/data-model-kemenpora.xlsx)
 * pada worksheet:
 * - B2. RegDataset (Insert Dataset)
 * - B3. RegEntitasData (Insert Entitas berdasarkan ID Data)
 * - B4. RegKamusData (Insert Kamus Data berdasarkan ID Data)
 */
export async function generateSdiE2EPayload(
  customIdDataOrDatasetId?: string,
  userEmail?: string,
  caseType?: 'terbatas' | 'tertutup' | 'revisi'
): Promise<SdiAutomationPayload> {
  const excelPayload = buildSdiPayloadFromKemenporaExcel({
    idData: customIdDataOrDatasetId,
    userEmail,
    caseType
  });

  if (excelPayload.excelMeta) {
    console.log(
      `📊 [Excel Data Source] ID Data: ${excelPayload.excelMeta.idData} | ID Dataset: ${excelPayload.excelMeta.idDataset} (${excelPayload.excelMeta.namaDataset}) | ` +
      `Entitas: ${excelPayload.excelMeta.namaEntitas} | Kamus Data: ${excelPayload.excelMeta.totalElemen} elemen`
    );
  }

  return sanitizePayload(excelPayload, userEmail);
}
