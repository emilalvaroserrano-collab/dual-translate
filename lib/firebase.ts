/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const REQUIRED_FIREBASE_ENV = [
  'FIREBASE_API_KEY',
  'FIREBASE_AUTH_DOMAIN',
  'FIREBASE_DATABASE_URL',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_STORAGE_BUCKET',
  'FIREBASE_MESSAGING_SENDER_ID',
  'FIREBASE_APP_ID',
] as const;

const missing = REQUIRED_FIREBASE_ENV.filter((key) => !process.env[key]);
if (missing.length > 0) {
  const message = `Missing required environment variable(s): ${missing.join(', ')}`;
  console.error('[Multilinguahe] ' + message);
  if (typeof document !== 'undefined') {
    document.body.innerHTML =
      '<div style="position:fixed;inset:0;z-index:99999;background:#0b0f1a;color:#e5e7eb;' +
      'display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;padding:24px">' +
      '<div style="max-width:520px"><h2 style="color:#f43f5e;margin:0 0 8px">Not configured</h2>' +
      '<p style="margin:0 0 4px">' + message + '.</p>' +
      '<p style="color:#9ca3af;margin:0">Add these to your build environment ' +
      '(Vercel &rarr; Settings &rarr; Environment Variables) and redeploy.</p></div></div>';
  }
  throw new Error(message + '. Check build environment variables.');
}

// Injected at build time via `define` in vite.config.ts
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);

export const db = getDatabase(app);
export const auth = getAuth(app);