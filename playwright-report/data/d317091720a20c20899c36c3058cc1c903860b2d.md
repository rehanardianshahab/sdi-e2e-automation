# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: sdi-lifecycle.spec.ts >> Portal Satu Data Indonesia - Lifecycle & Case Verifications >> Case 2: Alur Lengkap Registrasi Data Tertutup (Klasifikasi Risiko Tertutup)
- Location: tests\sdi-lifecycle.spec.ts:17:3

# Error details

```
Error: expect(received).toBeTruthy()

Received: false
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import {
  3  |   runPageByPageVerification,
  4  |   runRevisiRegistrasiVerification,
  5  |   runLayananSplpVerification
  6  | } from '../src/flows/verify-page-access.js';
  7  | 
  8  | test.describe('Portal Satu Data Indonesia - Lifecycle & Case Verifications', () => {
  9  |   // Timeout 240s per test case karena alur multi-role end-to-end lengkap
  10 |   test.setTimeout(240000);
  11 | 
  12 |   test('Case 1: Alur Lengkap Registrasi Data Terbatas (Klasifikasi Risiko Terbatas)', async () => {
  13 |     const isSuccess = await runPageByPageVerification({ caseType: 'terbatas' });
  14 |     expect(isSuccess).toBeTruthy();
  15 |   });
  16 | 
  17 |   test('Case 2: Alur Lengkap Registrasi Data Tertutup (Klasifikasi Risiko Tertutup)', async () => {
  18 |     const isSuccess = await runPageByPageVerification({ caseType: 'tertutup' });
> 19 |     expect(isSuccess).toBeTruthy();
     |                       ^ Error: expect(received).toBeTruthy()
  20 |   });
  21 | 
  22 |   test('Case 3: Skenario Revisi Registrasi Data (Review Tombol ✕ Ditolak ➔ Edit ➔ Ceklis ✓ Published)', async () => {
  23 |     const isSuccess = await runRevisiRegistrasiVerification();
  24 |     expect(isSuccess).toBeTruthy();
  25 |   });
  26 | 
  27 |   test('Case 4: Registrasi Layanan SKDN & Pindah ke /splp untuk Verifikasi Data', async () => {
  28 |     const isSuccess = await runLayananSplpVerification();
  29 |     expect(isSuccess).toBeTruthy();
  30 |   });
  31 | });
  32 | 
  33 | 
```