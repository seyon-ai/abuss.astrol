# ⟁ ASTROLABUSS — Setup Guide

## File Structure
```
astrolabuss-full/
├── index.html                  ← Landing page (entry point)
├── css/
│   └── astro.css               ← Global styles (shared by all pages)
├── js/
│   └── firebase.js             ← Firebase core + all utilities
└── pages/
    ├── signup.html             ← 10-step account creation
    ├── login.html              ← 8-gate login verification
    ├── dashboard.html          ← Main account dashboard
    ├── devices.html            ← Trusted device management
    ├── security-log.html       ← Full security audit log
    ├── id-card.html            ← Digital identity card
    ├── settings.html           ← Account settings + danger zone
    └── recovery.html           ← 3-method account recovery
```

---

## Step 1 — Firebase Project Setup

1. Go to https://console.firebase.google.com
2. Create a new project (e.g. "astrolabuss")
3. Enable these services:
   - **Authentication** → Sign-in Methods:
     - ✅ Email/Password
     - ✅ Phone
   - **Firestore Database** → Start in production mode
4. Go to Project Settings → General → Your apps → Add Web App
5. Copy your config object

---

## Step 2 — Paste Firebase Config

Open `js/firebase.js` and replace:

```js
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_AUTH_DOMAIN",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId:             "YOUR_APP_ID"
};
```

---

## Step 3 — Firestore Security Rules

In Firebase Console → Firestore → Rules, paste:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /astrolabuss_users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;

      match /security_log/{logId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

---

## Step 4 — Deploy

**Option A — Vercel (Recommended)**
```bash
# Install Vercel CLI
npm i -g vercel

# From the astrolabuss-full/ folder
vercel --prod
```

**Option B — GitHub Pages**
- Push to GitHub repo
- Settings → Pages → Deploy from main branch
- Note: Phone Auth requires HTTPS — GitHub Pages works ✅

**Option C — Firebase Hosting**
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
# Set public dir to: astrolabuss-full
firebase deploy
```

---

## Step 5 — Enable Phone Auth (reCAPTCHA)

Firebase Phone Auth uses invisible reCAPTCHA. It works automatically on HTTPS.
For localhost testing:
- Firebase Console → Authentication → Settings → Authorized domains
- Add `localhost`

---

## The 8 Security Gates

| Gate | Method | Technology |
|------|--------|-----------|
| 1 | Master Password | Firebase Auth |
| 2 | Email Verification | Firebase Email |
| 3 | SMS OTP | Firebase Phone Auth |
| 4 | Authenticator App | TOTP (Web Crypto API) |
| 5 | Security Question | SHA-256 hashed answers |
| 6 | Image PIN | Order-based visual lock |
| 7 | Device Check | Fingerprint registry |
| 8 | Time Window | Hour-based access control |

---

## Astrolabuss ID Format

```
yourname.astrol.abussΩsecure.protocol
```

- `yourname` — chosen at signup (lowercase letters only)
- `.astrol.abuss` — fixed domain
- `Ω` — fixed sovereign symbol
- `secure.protocol` — fixed suffix

---

## Integrating With Your Other Sites

To use Astrolabuss auth in Xzora, Hidden Hydra, Zunitra etc:

```js
// In your other site's JS:
import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged } from "firebase/auth";

// Use THE SAME Firebase config as Astrolabuss
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

onAuthStateChanged(auth, user => {
  if (user) {
    // User is logged in via Astrolabuss
    console.log("Astrolabuss ID:", user.displayName);
  } else {
    // Redirect to Astrolabuss login
    window.location.href = "https://your-astrolabuss-domain.com/pages/login.html";
  }
});
```

Since all your sites share the same Firebase project, the session is recognized automatically. ✅

---

## Data Stored in Firestore

```
astrolabuss_users/{uid}/
  ├── astroId          → "username.astrol.abussΩsecure.protocol"
  ├── username         → "username"
  ├── email            → "user@example.com"
  ├── phone            → "+1234567890"
  ├── totpKey          → "JBSW Y3DP..." (base32 TOTP secret)
  ├── securityQuestions → [{question, answerHash}] × 3
  ├── imagePinOrder    → [3, 7, 0, 5] (tile indices)
  ├── loginWindow      → {start: "09:00", end: "23:00"}
  ├── trustedDevices   → ["{ua, platform, ...}"]
  ├── createdAt        → Timestamp
  ├── lastLogin        → Timestamp
  ├── loginCount       → Number
  └── security_log/
      └── {auto-id}/
          ├── action   → "LOGIN_SUCCESS"
          ├── status   → "success"
          ├── details  → "All 8 gates passed"
          └── timestamp
```
