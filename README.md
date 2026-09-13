# Push Notification Platform

An admin/staff operator onboards **Members** (individually or via CSV import), organizes them into **Groups**, and sends **push notification Campaigns** — targeted at all members, a group, or a hand-picked selection — with a live send progress view and a full audit trail. Members receive campaigns on their phone through the **soko** mobile app, which pairs itself to a Member record by phone number and registers for Firebase Cloud Messaging (FCM).

Three parts:

- **Backend:** [backend/](backend/) — Node.js + Express 5 + TypeScript, PostgreSQL via Prisma, JWT auth, Socket.io for live campaign progress, `firebase-admin` for sending push.
- **Frontend (admin panel):** [frontend/](frontend/) — React 19 + TypeScript + Vite, Tailwind CSS, React Router, TanStack Query, Zustand.
- **soko (mobile app):** [soko/](soko/) — Flutter + `firebase_messaging` + `flutter_local_notifications`. What Members install to actually receive campaigns.

## Features

- **Member onboarding**: add members one at a time or bulk-import a CSV (`name`, `phone`, optional `email`/`groups`), with phone numbers normalized and duplicates skipped.
- **Groups**: organize members into named segments to target a send at.
- **Phone check-in (soko app)**: on first launch, a member types the phone number staff already onboarded them with; the app pairs its FCM device token to that `Member` record. No separate login/signup — the phone number *is* the pairing key.
- **Push campaigns**: compose a title + body, pick an audience (all members / a group / a selection), preview how many members are actually reachable (i.e. have the app installed) vs. just matching the audience, and send. Sends run in the background in batches through Firebase.
- **Live delivery progress**: a campaign's detail page shows a live progress bar and a per-device delivery log (sent/failed/pending) over Socket.io, plus a "retry failed" action.
- **Admin**: operator account management (Super Admin/Admin/Staff), org-wide audit log of every create/update/delete/login.
- Opt-out support: a member can be marked unsubscribed and is excluded from every future send without losing their record.

## Tech stack

| | Backend | Frontend | soko |
|---|---|---|---|
| Language | TypeScript | TypeScript | Dart |
| Framework | Express 5 | React 19 + Vite | Flutter |
| Data | PostgreSQL + Prisma ORM (`pg` driver adapter) | TanStack Query, Axios | `shared_preferences` (remembers the checked-in phone) |
| Auth | JWT (`jsonwebtoken`), bcrypt | Zustand session store | phone check-in only (no login) |
| Realtime | Socket.io (campaign send progress) | socket.io-client | - |
| Push gateway | Firebase Admin SDK (`firebase-admin`) | - | `firebase_messaging` + `flutter_local_notifications` |
| Styling | n/a | Tailwind CSS v4 + a custom CSS design system | Material |
| Other | Zod validation, Multer + csv-parse for CSV import, Pino logging | React Hook Form + Zod resolvers, React Router, Recharts, SweetAlert2 | `http` for the check-in call |

## Roles

`SUPER_ADMIN`, `ADMIN`, `STAFF` — operator accounts that sign into the admin panel, enforced both by backend route guards (`requireRole`) and frontend route guards (`RoleGuard`). Operators manage everyone; `SUPER_ADMIN`/`ADMIN` additionally manage other operator accounts and the audit log. `SUPER_ADMIN` alone can edit the Firebase push gateway credentials.

Not to be confused with **Members** (the push notification recipients), who never sign into anything — their only interaction is the soko app's one-time phone check-in.

## Project structure

```
backend/
  src/
    modules/          # auth, admin, members (incl. device-token check-in), groups, campaigns, push, settings, audit
    middleware/        # auth, error handling, CSV upload
    lib/                # env validation, JWT, logging, Prisma client, Socket.io
    shared/             # error classes, guards, schemas, types, utils
  prisma/schema.prisma  # data model
frontend/
  src/
    pages/             # dashboards, members, groups, campaigns, admin, auth, settings, shared
    components/        # layout and shared components
    api/                # Axios client + typed API calls
    stores/             # Zustand stores (auth, notifications)
    router/index.tsx    # route table + role guards
soko/
  lib/
    main.dart               # app entry - StartupGate decides check-in vs. home
    phone_entry_page.dart   # one-time phone check-in screen
    device_registration.dart # calls POST /public/device-tokens, remembers the phone
    push_notifications.dart # FCM setup, foreground display, token (re)sync
    home_page.dart          # placeholder home screen (swap for your real app UI)
```

## Data model

Defined in [backend/prisma/schema.prisma](backend/prisma/schema.prisma):

- `User` — an operator account.
- `Member` — a push notification recipient (name, normalized phone, optional email/notes, subscribed flag), onboarded by a `User`, belonging to zero or more `Group`s. `phone` is the key a soko install pairs itself against.
- `DeviceToken` — an FCM registration token linking one soko install to the `Member` it belongs to. Created by the check-in flow; a member can hold several (multiple phones).
- `Group` — a named member segment a campaign can target.
- `Campaign` — one push send (name, title, body, audience type, recipient/sent/failed counts, status) + its `CampaignRecipient` rows, one per targeted device, snapshotting name/phone/token/status/error so the delivery log stays accurate even if the member or device token is later edited/removed.
- `PushGateway` — the single row holding the encrypted Firebase service-account JSON campaigns send through, and whether it's active.
- `AuditLog` — every create/update/delete/login across the system.

## API

All routes are mounted in [backend/src/app.ts](backend/src/app.ts). Base path is the API root (e.g. `http://localhost:3000`).

| Prefix | Routes | Auth | Purpose |
|---|---|---|---|
| `/auth` | `POST /login`, `GET /me`, `PATCH /me` | Operator JWT | Operator login, profile |
| `/admin` | `GET/POST /users`, `GET/PATCH/DELETE /users/:id`, `GET /audit-logs` | Admin/Super Admin | Operator account management, audit log |
| `/members` | `GET /`, `GET/PATCH/DELETE /:id`, `POST /`, `POST /import` | Operator JWT | Member CRUD, CSV bulk import |
| `/public/device-tokens` | `POST /` | **None** | soko's phone check-in - pairs `{ phone, token, platform }` to an existing Member |
| `/groups` | `GET /`, `GET/PATCH/DELETE /:id`, `POST /` | Operator JWT | Group CRUD, group member listing |
| `/campaigns` | `POST /preview`, `GET /`, `GET /:id`, `GET /:id/recipients`, `POST /`, `POST /:id/retry-failed` | Operator JWT | Audience preview, campaign CRUD, delivery log, retry |
| `/settings` | `GET/PUT /push-gateway`, `POST /push-gateway/activate`, `/deactivate`, `/test` | Super Admin | Firebase credentials |

## Getting started

### Prerequisites
- Node.js 20+
- A PostgreSQL database
- A Firebase project with Cloud Messaging enabled — see **3. Set up Firebase** below for the full walkthrough; needed to actually send campaigns, everything else works without one
- Flutter SDK + an Android emulator (or a physical device on the same network) to run soko

### 1. Backend

```bash
cd backend
cp .env.example .env   # fill in DATABASE_URL and JWT_SECRET at minimum
npm install
npx prisma generate
npx prisma db push     # or migrate, once you have migrations
npm run dev             # http://localhost:3000
```

Required env vars: `DATABASE_URL`, `JWT_SECRET` — see [backend/.env.example](backend/.env.example). Firebase credentials are **not** an env var; they're pasted into the admin panel (step 3 below) and stored encrypted in the database.

Seed a super admin + sample groups/members: `npx tsx prisma/seed.ts` (creates `admin@example.com` / `Admin@123!`).

### 2. Frontend (admin panel)

```bash
cd frontend
cp .env.example .env    # set VITE_API_BASE_URL and VITE_SOCKET_URL to the backend URL
npm install
npm run dev              # Vite dev server, http://localhost:5173
```

### 3. Set up Firebase

This repo's soko app already ships configured for one Firebase project (`soko-b97c0` — `google-services.json`, `GoogleService-Info.plist`, `firebase_options.dart` are all checked in). If you're just running this repo as-is, skip to **3d**. If you're forking this as a boilerplate for a **new** project, do all of 3a–3d against your own Firebase project.

**3a. Create the Firebase project and register your apps**
1. [Firebase Console](https://console.firebase.google.com/) → **Add project** (or reuse an existing GCP project).
2. Add an **Android app**: use the same package name as `applicationId` in [soko/android/app/build.gradle.kts](soko/android/app/build.gradle.kts) (currently the placeholder `com.example.soko` — change it to something real before you register). Download the generated `google-services.json` and drop it into `soko/android/app/`.
3. Add an **iOS app** if you need iOS: use the bundle ID from the Xcode project. Download `GoogleService-Info.plist` into `soko/ios/Runner/`.
4. Regenerate `soko/lib/firebase_options.dart` for your project - easiest via the [FlutterFire CLI](https://firebase.google.com/docs/flutter/setup): `dart pub global activate flutterfire_cli`, then `flutterfire configure` from `soko/`, picking your Firebase project and platforms.

**3b. Turn on Cloud Messaging**

Project Settings → **Cloud Messaging** tab. Confirm the **Firebase Cloud Messaging API (V1)** is enabled (it's what `firebase-admin`'s `sendEachForMulticast` actually calls) - the older legacy HTTP API being disabled doesn't matter, this project never uses it.

**3c. iOS only: upload an APNs key**

Android needs nothing beyond `google-services.json` to receive pushes. iOS additionally needs Apple Push Notification service (APNs) wired up, or Firebase has no way to actually reach the device:
1. [Apple Developer](https://developer.apple.com/account) → Certificates, IDs & Profiles → Keys → create an **APNs Authentication Key** (one key covers every app for your whole Apple team).
2. Firebase Console → Project Settings → Cloud Messaging → **Apple app configuration** → upload that key (`.p8` file) + its Key ID + your Team ID.
3. Check `soko/ios/Runner/Runner.entitlements` has `aps-environment` set to `development` while testing, `production` for a real TestFlight/App Store build.

**3d. Generate the service-account key the *backend* sends through**

This is the one every run of this repo needs, regardless of whether you did 3a–3c:
1. Firebase Console → Project Settings → **Service Accounts** tab → **Generate new private key**. This downloads a JSON file - treat it like a password, it grants full send access to your project. Don't commit it, don't paste it into a chat/issue/PR.
2. Log into the admin panel (seeded super admin creds above) → **Settings** → paste the **entire contents** of that JSON file (open it in a text editor, select all, copy - not just one field) into the textarea → **Save** → **Set as active**.
3. Optional but recommended: click **Test connection** right after saving - it calls `verifyCredentials()` ([push-gateway.service.ts](backend/src/modules/settings/push-gateway.service.ts)) to confirm Firebase actually accepts the key before you rely on it, without sending a real notification to anyone.

If you ever suspect a service-account key leaked (pasted somewhere it shouldn't have been, checked into git, etc.), revoke it from the same Service Accounts tab and generate a fresh one - the old key stops working the instant you do.

### 4. soko (mobile app)

```bash
cd soko
flutter pub get
flutter run   # pick an Android emulator/device
```

Before running, point it at your backend in [soko/lib/device_registration.dart](soko/lib/device_registration.dart#L17) (`apiBaseUrl`):
- **Android emulator**: `http://10.0.2.2:3000` (default in this repo) - the emulator's alias for the host machine's own localhost.
- **Physical device**: your machine's LAN IP, e.g. `http://192.168.1.20:3000` - the phone can't reach "localhost" meaning itself. Make sure the phone is on the same Wi-Fi as your machine, and that Windows Firewall allows inbound connections to Node on that network profile.
- **iOS simulator**: `http://localhost:3000` works as-is.

On first launch, soko asks for a phone number - use one already onboarded as a Member (a seeded one, or one you added via the admin panel). This pairs the device's FCM token to that Member.

### 5. Send a test push

Admin panel → **New Campaign** → target the member you just checked in with (by group, or Selected) → write a title/body → **Send**. Watch it arrive on the device, and the campaign detail page update live.

## Known limitations (boilerplate starting point, not finished product)

- `apiBaseUrl` in soko is a hardcoded constant, not a build-time config - fine for local dev, swap for an env-based config before shipping to real devices.
- Web push is scaffolded (`_webVapidKey` in [push_notifications.dart](soko/lib/push_notifications.dart)) but the VAPID key is a placeholder - fill it in from Firebase Console if you need web support.
- `onMessageTapped` in `PushNotificationService` is declared but nothing assigns it yet - wire it up to your navigator if tapping a notification should deep-link somewhere.
- Phone check-in never creates a new `Member` - a phone the backend doesn't recognize is rejected. That's deliberate (staff onboards first), but change it in [device-token.routes.ts](backend/src/modules/members/device-token.routes.ts) if you want self-service signup instead.
- soko's `home_page.dart` is still the stock Flutter counter demo - replace it with your actual app.

## Scripts

**Backend** (`backend/package.json`): `npm run dev` (nodemon + tsx), `npm run build` (Prisma generate + tsc), `npm start` (run compiled build). `backend/scripts/create-user.ts` and `set-super-admin.ts` manage operator accounts directly against the database.
**Frontend** (`frontend/package.json`): `npm run dev`, `npm run build` (tsc -b + vite build), `npm run lint`, `npm run preview`.
**soko**: standard Flutter (`flutter pub get`, `flutter run`, `flutter analyze`).
