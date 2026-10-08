export const ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'HR_MANAGER',
  'HRBP',
  'HR',
  'RM',
  'DEPT_HEAD',
  'RECRUITER',
  'PANEL',
  'FINANCE',
  'EMPLOYEE',
  'CANDIDATE',
];

export const HRS = ['HR', 'HRBP', 'HR_MANAGER'];
export const ADMINS = ['ADMIN', 'SUPER_ADMIN'];

export const MODULE_KEYS = [
  'ats',
  'onboarding',
  'attendance',
  'leave',
  'payroll',
  'tracking',
  'performance',
  'engagement',
  'training',
  'complaints',
  'exit',
  'handbook',
  'reports',
];

export const DEF_SETTINGS = {
  probationDays: 90,
  shiftStart: '09:30',
  graceMin: 10,
  weekOff: [0],
  geofences: [] as any[],
  faceThreshold: 0.8,
  moodBot: true,
  ratePerKm: 8,
  claimLimit: 5000,
  idleMinutes: 5,
  locationOffEscalateMin: 30,
  requiredDocs: [
    'ID_PROOF',
    'ADDRESS_PROOF',
    'EDUCATION',
    'PREV_EMPLOYMENT',
    'PHOTO',
  ],
  series: {
    EMP: { prefix: 'NK', next: 1 },
    CON: { prefix: 'NKC', next: 1 },
  } as any,
  statutory: {
    pf: true,
    esi: true,
    pt: true,
    lwf: true,
    pfCeiling: 15000,
    bonusCeiling: 7000,
    bonusPct: 8.33,
  },
};

export const cfg = (c: any) => ({ ...DEF_SETTINGS, ...(c?.settings || {}) });

export const PLAN: Record<string, { jobs: number; pool: boolean }> = {
  FREE: { jobs: 2, pool: false },
  PREMIUM: { jobs: 5, pool: true },
};

export const QBANK = [
  'Tell me about yourself.',
  'Why do you want this role and what excites you about it?',
  'Describe a challenging situation you handled and what the result was.',
  'What are your key strengths, and one area you are improving?',
  'Tell me about a conflict in a team and how you resolved it.',
  'Where do you see yourself in three years?',
  'Why should we hire you over other candidates?',
];

export const MOODS: Record<string, number> = {
  EXCITED: 5,
  GOOD: 4,
  OKAY: 3,
  STRESSED: 2,
  TIRED: 2,
};

export const PROFILE_FIELDS = [
  'headline',
  'location',
  'skills',
  'experienceYears',
  'education',
  'experience',
  'resumeUrl',
  'expectedCtc',
  'noticePeriod',
  'languages',
];

export const EMP_FIELDS = [
  'address',
  'emergencyContact',
  'bankAccount',
  'ifsc',
  'pan',
  'uan',
  'bloodGroup',
  'maritalStatus',
  'fatherName',
  'education',
];

export const ACTIVITIES = [
  { type: 'GAME', title: 'Memory Match (2 min)', url: '/games/memory' },
  { type: 'STRETCH', title: 'Desk stretch: roll shoulders ×10, neck tilt ×5 each side' },
  { type: 'QUIZ', title: 'Quick quiz: Which planet has the most moons?', answer: 'Saturn' },
  { type: 'BREATHE', title: '4-7-8 breathing, 4 rounds' },
  { type: 'GRATITUDE', title: 'Send a thank-you to a teammate on the feed' },
];

export const SEED_LAWS = [
  { country: 'IN', kind: 'PF', employeeRate: 12, employerRate: 12, epsRate: 8.33, wageCeiling: 15000, note: 'EPF: 12% + 12%; EPS 8.33% on wages up to ₹15,000' },
  { country: 'IN', kind: 'ESI', employeeRate: 0.75, employerRate: 3.25, wageCeiling: 21000, note: 'ESI applicable where monthly gross ≤ ₹21,000' },
  { country: 'IN', kind: 'BONUS', pct: 8.33, wageCeiling: 21000, calcCeiling: 7000, note: 'Payment of Bonus Act: min 8.33%, eligibility wage ≤ ₹21,000' },
  { country: 'IN', kind: 'GRATUITY', days: 15, perDays: 26, minYears: 5, note: 'Payment of Gratuity Act: 15/26 × last basic × years (≥5)' },
  { country: 'IN', state: 'Karnataka', kind: 'PT', mult: 1, slabs: [{ from: 0, to: 24999, amt: 0 }, { from: 25000, to: 1e12, amt: 200 }], sample: true },
  { country: 'IN', state: 'Maharashtra', kind: 'PT', mult: 1, slabs: [{ from: 0, to: 7500, amt: 0 }, { from: 7501, to: 10000, amt: 175 }, { from: 10001, to: 1e12, amt: 200 }], sample: true },
  { country: 'IN', state: 'Telangana', kind: 'PT', mult: 1, slabs: [{ from: 0, to: 15000, amt: 0 }, { from: 15001, to: 20000, amt: 150 }, { from: 20001, to: 1e12, amt: 200 }], sample: true },
  { country: 'IN', state: 'Tamil Nadu', kind: 'PT', mult: 6, months: [3, 9], slabs: [{ from: 0, to: 21000, amt: 0 }, { from: 21001, to: 30000, amt: 135 }, { from: 30001, to: 45000, amt: 315 }, { from: 45001, to: 60000, amt: 690 }, { from: 60001, to: 75000, amt: 1025 }, { from: 75001, to: 1e12, amt: 1250 }], note: 'Half-yearly slab on 6× monthly gross, deducted in Mar & Sep', sample: true },
  { country: 'IN', state: 'Tamil Nadu', kind: 'MIN_WAGE', monthly: 10000, sample: true, note: 'SAMPLE minimum wage — replace with notified rate for the scheduled employment' },
  { country: 'IN', state: 'Karnataka', kind: 'MIN_WAGE', monthly: 12000, sample: true, note: 'SAMPLE minimum wage — replace with notified rate' },
  { country: 'IN', state: 'Maharashtra', kind: 'MIN_WAGE', monthly: 11000, sample: true, note: 'SAMPLE minimum wage — replace with notified rate' },
  { country: 'IN', state: 'Telangana', kind: 'MIN_WAGE', monthly: 11000, sample: true, note: 'SAMPLE minimum wage — replace with notified rate' },
];

export const SAMPLE_STRUCT = [
  { code: 'BASIC', name: 'Basic', type: 'EARNING', calc: 'PERCENT', of: 'CTC', value: 50 },
  { code: 'HRA', name: 'HRA', type: 'EARNING', calc: 'PERCENT', of: 'BASIC', value: 40 },
  { code: 'CONV', name: 'Conveyance', type: 'EARNING', calc: 'FIXED', value: 1600 },
  { code: 'SPL', name: 'Special Allowance', type: 'EARNING', calc: 'FORMULA', formula: 'MAX(CTC - BASIC - HRA - CONV, 0)' },
];
