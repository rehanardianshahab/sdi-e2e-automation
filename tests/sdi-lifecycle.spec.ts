import { test, expect } from '@playwright/test';
import {
  runPageByPageVerification,
  runRevisiRegistrasiVerification,
  runLayananSplpVerification
} from '../src/flows/verify-page-access.js';

test.describe('Portal Satu Data Indonesia - Lifecycle & Case Verifications', () => {
  // Timeout 240s per test case karena alur multi-role end-to-end lengkap
  test.setTimeout(240000);

  test('Case 1: Alur Lengkap Registrasi Data Terbatas (Klasifikasi Risiko Terbatas)', async () => {
    const isSuccess = await runPageByPageVerification({ caseType: 'terbatas' });
    expect(isSuccess).toBeTruthy();
  });

  test('Case 2: Alur Lengkap Registrasi Data Tertutup (Klasifikasi Risiko Tertutup)', async () => {
    const isSuccess = await runPageByPageVerification({ caseType: 'tertutup' });
    expect(isSuccess).toBeTruthy();
  });

  test('Case 3: Skenario Revisi Registrasi Data (Review Tombol ✕ Ditolak ➔ Edit ➔ Ceklis ✓ Published)', async () => {
    const isSuccess = await runRevisiRegistrasiVerification();
    expect(isSuccess).toBeTruthy();
  });

  test('Case 4: Registrasi Layanan SKDN & Pindah ke /splp untuk Verifikasi Data', async () => {
    const isSuccess = await runLayananSplpVerification();
    expect(isSuccess).toBeTruthy();
  });
});

