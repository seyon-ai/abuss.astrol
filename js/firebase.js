// ═══════════════════════════════════════
//  ASTROLABUSS — Firebase Core + Utils
// ═══════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  onAuthStateChanged,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  sendEmailVerification,
  EmailAuthProvider,
  reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc, setDoc, getDoc, updateDoc, addDoc,
  collection, query, where, orderBy, limit,
  getDocs, serverTimestamp, arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── PASTE YOUR FIREBASE CONFIG HERE ──────────────────────────
export const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_AUTH_DOMAIN",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId:             "YOUR_APP_ID"
};
// ─────────────────────────────────────────────────────────────

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

// ── CONSTANTS ──
export const DOMAIN_SUFFIX = ".astrol.abussΩsecure.protocol";
export const ASTRO_ID = (username) => `${username}${DOMAIN_SUFFIX}`;

export const SECURITY_QUESTIONS = [
  "What was the name of your first pet?",
  "What city were you born in?",
  "What is your mother's maiden name?",
  "What was the name of your first school?",
  "What was your childhood nickname?",
  "What is the name of the street you grew up on?",
  "What was the make of your first car?",
  "What is your oldest sibling's middle name?"
];

export const IMAGE_TILES = ['🌙','⚡','🔥','🌊','🦅','💎','🗝️','⚔️','🌹'];

// ── TOTP (otplib-compatible via hotp-totp) ──
// Uses Web Crypto for HMAC-SHA1 TOTP generation
export async function generateTOTPKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let key = '';
  const arr = new Uint8Array(20);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 20; i++) key += chars[arr[i] % 32];
  return key;
}

export function formatTOTPKey(key) {
  return key.match(/.{1,4}/g)?.join(' ') || key;
}

// Base32 decode for TOTP
function base32Decode(str) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  str = str.replace(/\s/g,'').toUpperCase();
  let bits = 0, value = 0;
  const output = [];
  for (const c of str) {
    const idx = alphabet.indexOf(c);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { output.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(output);
}

export async function verifyTOTP(key, token) {
  try {
    const keyBytes = base32Decode(key);
    const counter = Math.floor(Date.now() / 1000 / 30);
    // Check ±1 window
    for (let delta = -1; delta <= 1; delta++) {
      const c = counter + delta;
      const buf = new ArrayBuffer(8);
      new DataView(buf).setUint32(4, c, false);
      const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name:'HMAC', hash:'SHA-1' }, false, ['sign']);
      const sig = await crypto.subtle.sign('HMAC', cryptoKey, buf);
      const arr = new Uint8Array(sig);
      const offset = arr[19] & 0xf;
      const code = ((arr[offset] & 0x7f) << 24 | arr[offset+1] << 16 | arr[offset+2] << 8 | arr[offset+3]) % 1000000;
      if (String(code).padStart(6,'0') === token.trim()) return true;
    }
    return false;
  } catch { return false; }
}

// ── FIRESTORE HELPERS ──
export async function getUserDoc(uid) {
  const snap = await getDoc(doc(db, 'astrolabuss_users', uid));
  return snap.exists() ? snap.data() : null;
}

export async function getUserByUsername(username) {
  const q = query(collection(db, 'astrolabuss_users'), where('username','==',username), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

export async function logSecurityEvent(uid, event) {
  await addDoc(collection(db, 'astrolabuss_users', uid, 'security_log'), {
    ...event,
    timestamp: serverTimestamp(),
    userAgent: navigator.userAgent,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  });
}

export async function updateUserDoc(uid, data) {
  await updateDoc(doc(db, 'astrolabuss_users', uid), data);
}

// ── PASSWORD STRENGTH ──
export function checkPasswordStrength(pw) {
  const rules = {
    len12:    pw.length >= 12,
    upper:    /[A-Z]/.test(pw),
    lower:    /[a-z]/.test(pw),
    num:      /[0-9]/.test(pw),
    sym:      /[^a-zA-Z0-9]/.test(pw),
    noDict:   !['password','qwerty','letmein','welcome','admin','123456'].some(w => pw.toLowerCase().includes(w)),
    noRepeat: !/(.)\1{2,}/.test(pw),
    len16:    pw.length >= 16,
  };
  const score = Object.values(rules).filter(Boolean).length;
  const level = score <= 2 ? 'weak' : score <= 4 ? 'fair' : score <= 6 ? 'strong' : 'extreme';
  return { rules, score, level };
}

// ── OTP HELPERS ──
export function setupOTPInputs(prefix, count, onComplete) {
  for (let i = 0; i < count; i++) {
    const el = document.getElementById(`${prefix}${i}`);
    if (!el) continue;
    el.addEventListener('input', () => {
      el.value = el.value.replace(/\D/g,'').slice(-1);
      el.classList.toggle('filled', !!el.value);
      if (el.value && i < count - 1) document.getElementById(`${prefix}${i+1}`)?.focus();
      if (el.value && i === count - 1 && onComplete) {
        const code = Array.from({length: count}, (_,j) => document.getElementById(`${prefix}${j}`)?.value || '').join('');
        if (code.length === count) onComplete(code);
      }
    });
    el.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !el.value && i > 0) document.getElementById(`${prefix}${i-1}`)?.focus();
    });
    el.addEventListener('paste', e => {
      e.preventDefault();
      const paste = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g,'');
      for (let j = 0; j < count && j < paste.length; j++) {
        const cell = document.getElementById(`${prefix}${j}`);
        if (cell) { cell.value = paste[j]; cell.classList.add('filled'); }
      }
    });
  }
}

export function getOTPValue(prefix, count) {
  return Array.from({length: count}, (_,i) => document.getElementById(`${prefix}${i}`)?.value || '').join('');
}

// ── DEVICE FINGERPRINT ──
export function getDeviceFingerprint() {
  return {
    platform:   navigator.platform,
    vendor:     navigator.vendor,
    language:   navigator.language,
    timezone:   Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen:     `${screen.width}x${screen.height}`,
    ua:         navigator.userAgent.substring(0, 80),
    isChrome:   navigator.userAgent.includes('Chrome'),
    isMobile:   /Mobi|Android/i.test(navigator.userAgent)
  };
}

export function getDeviceLabel() {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return '📱 Android Device';
  if (/iPhone|iPad/i.test(ua)) return '📱 iOS Device';
  if (/Macintosh/i.test(ua)) return '💻 Mac';
  if (/Windows/i.test(ua)) return '🖥️ Windows PC';
  return '💻 Unknown Device';
}

// ── TIME WINDOW CHECK ──
export function isWithinLoginWindow(start, end) {
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  if (s <= e) return cur >= s && cur <= e;
  return cur >= s || cur <= e; // overnight
}

// ── HASH ──
export async function hashText(text) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text.toLowerCase().trim()));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// ── FORMAT DATE ──
export function fmtDate(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}
export function fmtTime(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
}
export function fmtDateTime(ts) { return `${fmtDate(ts)} ${fmtTime(ts)}`; }
export function timeAgo(ts) {
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  const secs = Math.floor((Date.now() - d) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs/60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs/3600)}h ago`;
  return `${Math.floor(secs/86400)}d ago`;
}

// ── TOAST ──
export function toast(msg, type = 'info') {
  const existing = document.getElementById('astro-toast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.id = 'astro-toast';
  el.style.cssText = `
    position:fixed; bottom:28px; right:28px; z-index:9999;
    background:${type==='success'?'rgba(78,203,140,0.12)':type==='danger'?'rgba(224,85,85,0.12)':'rgba(201,168,76,0.1)'};
    border:1px solid ${type==='success'?'rgba(78,203,140,0.3)':type==='danger'?'rgba(224,85,85,0.3)':'rgba(201,168,76,0.3)'};
    color:${type==='success'?'#4ecb8c':type==='danger'?'#e05555':'#c9a84c'};
    padding:12px 20px; border-radius:10px; font-size:13px;
    font-family:'Outfit',sans-serif;
    box-shadow:0 8px 32px rgba(0,0,0,0.4);
    animation:fadeUp 0.3s ease both;
    display:flex; align-items:center; gap:8px;
    max-width:320px;
  `;
  const icon = type==='success'?'✓':type==='danger'?'✕':'ⓘ';
  el.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ── LOADER ──
export function setLoading(btn, loading, text) {
  if (!btn) return;
  btn.disabled = loading;
  btn.innerHTML = loading ? `<span class="spinner"></span>` : text;
}

// ── AUTH STATE ──
export { onAuthStateChanged, signOut, RecaptchaVerifier, signInWithPhoneNumber,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification,
  updateProfile, EmailAuthProvider, reauthenticateWithCredential,
  setDoc, getDoc, updateDoc, addDoc, collection, serverTimestamp, arrayUnion, arrayRemove, doc };
