# Nerkanal — HRMS + ATS + Candidate Portal

**Stack:** NestJS 11 · TypeScript · TypeORM (SQLite out of the box, PostgreSQL for production) · JWT auth · Socket.IO (live notifications + built-in WebRTC "Nerkanal Meet") · `@nestjs/schedule` (all reminders/escalations) · Swagger · Nodemailer / Twilio · Anthropic API (Jarvis).

All 15 modules, their internal endpoints, the approvals engine, cron jobs and seed data live in **one file: `src/main.ts`** (about 1,470 lines). Search for `§1` … `§15` to jump between modules.

---

## 1. Run it in 4 steps

```bash
mkdir nerkanal && cd nerkanal
# put: src/main.ts, package.json, tsconfig.json, .env.example (→ .env), public/logo.png
npm install
cp .env.example .env
npm start
```

- API console (every endpoint, try-it-out): **http://localhost:3000/docs**
- Home: http://localhost:3000 · Meet room pages: `/meet/<roomId>`
- First run creates a demo company with **all modules** and these users (password **`Nerkanal@123`**):

| Role | Login |
|---|---|
| Super Admin / Admin | superadmin@nerkanal.app / admin@nerkanal.app |
| HR Manager / HRBP / HR | hrmanager@ / hrbp@ / hr@ `nerkanal.app` |
| Recruiter / Panel / Finance / Dept Head | recruiter@ / panel@ / finance@ / depthead@ |
| Reporting Manager / Employee | rm@nerkanal.app / employee@nerkanal.app |
| Candidate | candidate@nerkanal.app |

In Swagger: `POST /auth/login` → copy `token` → **Authorize**.
In development the OTP is returned in the response as `devOtp` (and logged); in production it is only emailed.

---

## 2. Module map (15 modules + cross-cutting)

| § | Module | Key endpoints | Rules implemented from your workflow |
|---|---|---|---|
| 1 | **Candidate Portal** (free) | `/auth/register` `/auth/verify` `/candidate/profile` `/candidate/video` `/jobs/search` `/jobs/:id/apply` `/candidate/applications` `/candidate/interviews` `/candidate/feedback` `/candidate/offers` `/candidate/mock-interview/*` | E-mail code verification · profile ≥ 60 % to apply · video self-intro with face check + communication / confidence / passion score · max 5 attempts · score frozen 3 months · internal (recruiter) jobs listed first, external jobs fetched via open APIs with apply-link redirect · mock interview with improvement feedback · accept/decline offer → pushed to HRBP |
| 2 | **Recruiter ATS** | `/ats/requisitions` `/ats/jobs` `/ats/pool` `/ats/interviews` `/ats/feedback/:id/publish` `/ats/offers` | Manpower request by Dept Head → HR Manager approval → assign recruiter → job post (Free: 2 posts, Premium: 5 + candidate pool) → screen → schedule interview in built-in Meet; link sent by in-app + e-mail + SMS to candidate, recruiter, panel → panel feedback → recruiter verifies & publishes → documents verified → offer → status → accepted offer pushed to HRBP |
| 3 | **Onboarding** | `/onboarding/join` `/onboarding/me` `/onboarding/complete` `/onboarding/probation` | "Joined" trigger converts candidate ID → employee ID in the right series, appointment letter from fixed template, new login, profile pulled from candidate portal, 100 % profile + docs + digitally signed policies to finish, probation (HR-defined) with 2-day alert → confirm / extend / separate |
| 4 | **Attendance** | `/attendance/punch` `/attendance/device` `/attendance/requests` `/attendance/team` `/attendance/mood-report` | Present / Late / WFH / Out-of-geofence / Absent / Leave · exceptions go to RM with lat-lng + Google-Maps preview · modes: geo-fence, app button, face (score from your face model), biometric / door-face / CCTV via device API key · **mood bot** on punch-in + daily mood report to RM & HR · 3-day uninformed absence → day-4 show-cause → no reply in 7 days → termination initiated |
| 5 | **Leave** | `/leave/types` `/leave/apply` `/leave/compoff` `/leave/balances` `/approvals/*` | HRBP defines leave types & who they apply to · comp-off · regularisation · RM → HR → Admin chain · proof mandatory for ≥ 3 days |
| 6 | **Payroll** | `/payroll/structures` `/payroll/assign` `/payroll/runs` `/payroll/runs/:id/report/:kind` `/payroll/payslip` `/payroll/compliance` | Any structure: fixed, % of another component, or formula (`MAX(CTC-BASIC-HRA,0)`) · imports attendance or uploaded attendance (payroll-only clients) · state/country labour-law rules shown at configuration · violation requires **HR/Admin/Super-Admin digital attestation** · PF (ECR text), ESI, PT, LWF, bonus, gratuity and bank-advice downloads |
| 7 | **Live Tracking & Claims** | `/tracking/start` `/tracking/ping` `/tracking/stop` `/tracking/live` `/claims/*` | Distance tracking · idle > 5 min recorded · location-off → RM instantly, still off after 30 min → HR · travel claim auto = km × rate · bills added as reimbursement · RM → HR → Finance, "pending with whom" visible · HR/Admin edit rules (all employees notified) · over-limit claims notify RM & HR |
| 8 | **Performance** | `/performance/kpi` `/performance/pip` | RM sets KPIs on day 1 (or "same as previous"), day 2 auto-forward to HR · employee updates achievements, RM verifies · < 50 % for 3 consecutive months → HR alert → PIP with meeting, e-signature, end-date alert 2 days before, outcome (success / extend / separate) |
| 9 | **Engagement & Feed** | `/feed` `/engagement/recognition` `/engagement/water` `/engagement/idle` `/engagement/one-on-ones` | Feed with daily **horoscope** (zodiac captured at registration), awards on feed, monetary rewards HR → Finance, water reminders with snooze, idle-phone mini-activity, automatic monthly 5-min 1:1 with HRBP + feedback |
| 10 | **Training** | `/training/skill-gap` `/training/enroll` `/training/calendar` `/training/suggestions` `/training/brainstorm` | Bi-monthly skill-gap → Coursera / LinkedIn Learning (paid) + NPTEL (free) suggestions · certificate upload · POSH calendar alerts to HR 7 days before · self-chosen courses · anonymous cross-team suggestions · RM brainstorm topics |
| 11 | **Complaints** | `/complaints` `/complaints/mine` `/complaints/:id/update` | Anonymous (HR cannot see the author), tracking code, status timeline, investigation-meeting notes uploaded by HR |
| 12 | **Exit** | `/exit/resign` `/exit/:id/notice` `/exit/:id/clear` `/exit/:id/close` | Resignation → RM approval → exit interview auto-scheduled → HRBP sets LWD → clearance: KT (RM), assets (HR), access (Admin) → experience + relieving letters → account closed |
| 13 | **HR Handbook** | `/handbook/policies` `/handbook/policies/:id/ack` | New policies go to everyone first for **digitally signed acknowledgement**; HR sees who is pending |
| 14 | **Reports** | `/reports/:name?format=csv` | headcount, attendance, attrition, hiring-funnel, payroll-cost, mood, leave-utilisation, claims, kpi, training, policy-acks |
| 15 | **Settings & Plans** | `/settings` `/settings/subscribe` `/settings/users` | Buyers pick modules (payroll-only, ATS-only…) · ATS Free/Premium · geofences, shift, probation, ID series, claim rates, statutory switches · user & role management |
| — | **Jarvis** | `POST /jarvis/chat` | Natural-language actions with the caller's own permissions: apply leave, punch in/out, approvals, search/apply jobs, raise requisition, payslip, complaint, schedule meeting… (needs `ANTHROPIC_API_KEY`; limited rule-based mode without it) |
| — | **Notifications** | `/notifications` + Socket.IO `notify` | One `Notifier`: in-app + live push + e-mail + SMS, idempotent via `dedupe` keys so cron never double-sends |

**Approvals engine** (`/approvals/inbox`, `/approvals/:id/act`) powers leave, attendance requests, requisitions, claims, rewards, resignation and termination with configurable chains (`RM → HR → ADMIN → FINANCE`).

---

## 3. Using it from web / mobile

- **Auth:** `Authorization: Bearer <token>`.
- **Live:** connect Socket.IO with `io(BASE_URL, { auth: { token } })` and listen to `notify`.
- **Meet:** open `/meet/<roomId>?token=<jwt>` (WebView on mobile). Mesh WebRTC suits small interviews; add a TURN server (coolify/coturn) for restrictive networks and an SFU (LiveKit) for large rooms.
- **Tracking (mobile):** send `POST /tracking/ping` every ~30 s; send `enabled:false` when the OS location switch is turned off.
- **Biometric / door-face / CCTV:** device posts `{deviceKey, empId, ts, mode}` to `POST /attendance/device`. Device key is in `GET /settings` (admin).

Front-end plan for "web + Android + iOS": **Next.js** (web) and **Expo React Native** (Android/iOS) both calling this API; or a single React app wrapped with **Capacitor**.

---

## 4. Deploy

```bash
docker build -t nerkanal . && docker run -p 3000:3000 --env-file .env nerkanal
```
Works on Render / Railway / AWS ECS / Azure App Service. Set `DATABASE_URL` (Postgres), a strong `JWT_SECRET`, `BASE_URL` (your public https URL), SMTP, `DB_SYNC=false` after the first run and move to TypeORM migrations. Put uploads on S3/Blob (the file stores to `./uploads` today).

---

## 5. Be aware (honest limits of this build)

1. **Not yet run against live dependencies.** The file was syntax-checked and its helpers (zodiac, formula evaluator, date maths) unit-tested, but I could not `npm install` in my environment, so the first `npm install && npm start` may surface small type/version fixes.
2. **No front-end screens in this package** — this is the complete backend/API with a Swagger console and the Meet page. Web (Next.js) and mobile (Expo) apps are the next deliverable; screenshots need a running UI.
3. **Video AI is a DEMO scorer** until you set `VIDEO_AI_URL` (AWS Rekognition / Azure Face / a Gemini-style video model). Face-recognition attendance likewise expects `faceScore` from your face model.
4. **LinkedIn has no public job-search API; scraping breaks its terms.** The code uses Remotive (free) and JSearch/RapidAPI (licensed aggregator that includes LinkedIn/Indeed/Glassdoor listings). Adzuna etc. can be added in `ExternalJobs`.
5. **Statutory data are seeded samples** (`sample:true`: minimum wages, PT slabs). Statutory rules change — verify every value and edit via `PUT /payroll/laws`. Report layouts (ECR `#~#` file, ESI, PT) follow common formats; check against the current portal templates before filing. TDS/income-tax is not included (add a `TDS` deduction component or extend `computePay`).
6. **Security before go-live:** rate limiting (`@nestjs/throttler`), helmet, virus-scan/size limits on uploads, refresh tokens, audit log, multi-tenant row-level checks review, encryption of PAN/bank data at rest, privacy consent for location & video. Anonymous complaints rely on a keyed hash + server-side encrypted notify target — a DB administrator with the secret could still re-identify.
7. Horoscope text is generated deterministically for entertainment; swap in a licensed horoscope API if desired.
8. Controllers hold the logic for compactness; as the codebase grows, split into the usual `module/service/controller` folders (section banners map 1-to-1).
