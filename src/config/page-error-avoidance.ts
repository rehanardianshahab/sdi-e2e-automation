/**
 * Page Error Avoidance Configuration & Safeguards
 * File ini berfungsi untuk mendeteksi dan mencegah kesalahan halaman pada automasi E2E
 * berdasarkan hasil analisis report dan evaluasi Gemini AI.
 */

export interface PageAvoidanceRule {
  id: string;
  moduleCode: 'A' | 'B' | 'C' | 'D' | 'E' | 'ALL';
  category:
    | 'PREMATURE_MODAL_DISMISSAL'
    | 'NAVIGATION_TIMEOUT'
    | 'PAYLOAD_UNDEFINED'
    | 'ELEMENT_NOT_FOUND'
    | 'UNRESPONSIVE_PAGE'
    | 'POPUP_REDIRECT_ON_DISMISS';
  description: string;
  triggerCondition: string;
  mitigationStrategy: string;
  active: boolean;
}

export interface PopupRollbackPolicy {
  detectRollbackOnClick: boolean;
  rollbackActionKeywords: string[];
  safeAlternativeDismissMethod: 'close_icon_or_escape' | 'click_with_auto_recovery';
  autoRecoverExpectedPage: boolean;
}

export interface NavigationPolicy {
  defaultTimeoutMs: number;
  navigationTimeoutMs: number;
  preferredWaitUntil: 'load' | 'domcontentloaded' | 'networkidle';
  fallbackWaitUntil: 'domcontentloaded' | 'load';
  /**
   * Jika route tertentu bermasalah/lambat, gunakan route alternatif atau penanganan khusus
   */
  routePolicies: Record<
    string,
    {
      timeoutMs?: number;
      waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
      skipIfUnavailable?: boolean;
      fallbackUrl?: string;
    }
  >;
}

export interface DialogPolicy {
  /**
   * Selector tombol close yang TIDAK boleh diklik saat dialog form aktif terbuka,
   * untuk mencegah form ter-dismiss secara tidak sengaja.
   */
  protectedModalSelectors: string[];
  /**
   * Selector popup umum yang aman untuk ditutup secara otomatis
   */
  safeDismissSelectors: string[];
}

export const DEFAULT_PAGE_AVOIDANCE_RULES: PageAvoidanceRule[] = [
  {
    id: 'AVOID-MODAL-CLOSE-ON-INPUT',
    moduleCode: 'A',
    category: 'PREMATURE_MODAL_DISMISSAL',
    description:
      'Hindari menutup dialog form usulan kebutuhan data secara prematur saat input nama kebutuhan sedang diisi.',
    triggerCondition: 'Modal form usulan kebutuhan (#button-kebutuhan-ajukan) sedang terbuka.',
    mitigationStrategy:
      'Nonaktifkan penutupan [role="dialog"] button:has-text("Close") saat modal form aktif terbuka.',
    active: true
  },
  {
    id: 'AVOID-NAVIGATION-TIMEOUT-DATASET-FORM',
    moduleCode: 'C',
    category: 'NAVIGATION_TIMEOUT',
    description:
      'Hindari hanging 30s pada navigasi form registrasi baru /dataset-form/baru/dummy-1 dengan networkidle.',
    triggerCondition: 'Navigasi ke /dataset-form/baru/[id] atau /registrasi/data.',
    mitigationStrategy:
      'Gunakan domcontentloaded dengan timeout 15s dan verifikasi ketersediaan halaman sebelum networkidle.',
    active: true
  },
  {
    id: 'AVOID-NAVIGATION-TIMEOUT-LAYANAN',
    moduleCode: 'D',
    category: 'NAVIGATION_TIMEOUT',
    description:
      'Hindari hanging 30s pada navigasi ke /registrasi/layanan akibat koneksi background / websocket.',
    triggerCondition: 'Navigasi ke /registrasi/layanan dengan status networkidle.',
    mitigationStrategy:
      'Gunakan timeout 15s dan domcontentloaded sebagai standard wait strategy.',
    active: true
  },
  {
    id: 'AVOID-PAYLOAD-UNDEFINED-PROPERTIES',
    moduleCode: 'E',
    category: 'PAYLOAD_UNDEFINED',
    description:
      'Hindari error Cannot read properties of undefined (reading namaSistem) pada Modul E.',
    triggerCondition: 'AI generator hanya menghasilkan sebagian skema data JSON.',
    mitigationStrategy:
      'Lakukan deep-merge secara otomatis dengan FALLBACK_FAKE_DATA untuk seluruh sub-objek payload.',
    active: true
  },
  {
    id: 'AVOID-POPUP-MENGERTI-BACKTRACK',
    moduleCode: 'ALL',
    category: 'POPUP_REDIRECT_ON_DISMISS',
    description:
      'Mendeteksi dan mencegah aksi klik tombol "Mengerti" pada popup alert yang memicu browser kembali ke halaman sebelumnya (router.back).',
    triggerCondition: 'Popup alertdialog dengan tombol "Mengerti" muncul dan memiliki handler redirect.',
    mitigationStrategy:
      'Prioritaskan penutupan dialog via tombol Escape atau ikon silang (✕) agar tidak memicu router.back. Jika terjadi rollback URL, catat ke report dan jalankan auto-recovery navigasi.',
    active: true
  }
];

export const POPUP_ROLLBACK_POLICY: PopupRollbackPolicy = {
  detectRollbackOnClick: true,
  rollbackActionKeywords: ['Mengerti', 'Kembali', 'Batal'],
  safeAlternativeDismissMethod: 'close_icon_or_escape',
  autoRecoverExpectedPage: true
};

export const NAVIGATION_POLICY: NavigationPolicy = {
  defaultTimeoutMs: 15000,
  navigationTimeoutMs: 20000,
  preferredWaitUntil: 'domcontentloaded',
  fallbackWaitUntil: 'load',
  routePolicies: {
    '/dataset-form/baru/dummy-1': {
      timeoutMs: 15000,
      waitUntil: 'domcontentloaded',
      skipIfUnavailable: true
    },
    '/registrasi/layanan': {
      timeoutMs: 15000,
      waitUntil: 'domcontentloaded'
    },
    '/pengajuan-akses/tambah': {
      timeoutMs: 15000,
      waitUntil: 'domcontentloaded'
    },
    '/perencanaan/kebutuhan-data': {
      timeoutMs: 20000,
      waitUntil: 'domcontentloaded'
    },
    '/registrasi/data': {
      timeoutMs: 20000,
      waitUntil: 'domcontentloaded'
    }
  }
};

export const DIALOG_POLICY: DialogPolicy = {
  protectedModalSelectors: [
    '#modal-kebutuhan',
    '[role="dialog"]:has(#input-kebutuhan-form-nama-data)',
    '[role="dialog"]:has(input)',
    '[role="dialog"]:has(form)'
  ],
  safeDismissSelectors: [
    'button[aria-label="Close"]:not([role="dialog"] button)',
    'button[aria-label="Tutup"]:not([role="dialog"] button)',
    '[role="alertdialog"] button:has-text("Mengerti")',
    '[role="alertdialog"] button:has-text("Tutup")',
    '.cookie-banner button',
    '.announcement-popup button'
  ]
};

