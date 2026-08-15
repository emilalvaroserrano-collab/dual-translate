import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, deleteUser } from 'firebase/auth';
import { getDatabase, ref, set, push, get } from 'firebase/database';

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const app = initializeApp({ apiKey: env.FIREBASE_API_KEY, authDomain: env.FIREBASE_AUTH_DOMAIN, databaseURL: env.FIREBASE_DATABASE_URL, projectId: env.FIREBASE_PROJECT_ID, storageBucket: env.FIREBASE_STORAGE_BUCKET, messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID, appId: env.FIREBASE_APP_ID });
const auth = getAuth(app);
const db = getDatabase(app);
const email = 'e2e-test@eburon.ai', pw = 'e2e-test-123456';

try {
  const cred = await signInWithEmailAndPassword(auth, email, pw);
  const uid = cred.user.uid;
  console.log('uid', uid);
  const probes = [
    ['users/{uid}/settings', ref(db, `users/${uid}/settings`)],
    ['users/{uid}/translations', ref(db, `users/${uid}/translations`)],
    ['users/{uid}', ref(db, `users/${uid}`)],
    ['activity_logs', ref(db, 'activity_logs')],
    ['notifications', ref(db, 'notifications')],
    ['users (read)', ref(db, 'users')],
  ];
  for (const [name, r] of probes) {
    try {
      if (name.startsWith('users (read)')) { await get(r); console.log(name, 'OK'); continue; }
      await set(r, { __probe: Date.now() });
      console.log(name, 'WRITE-OK');
    } catch (e) { console.log(name, 'DENIED:', e.code || e.message); }
  }
  // cleanup user data (ignore rule failures) then delete account
  for (const p of [`users/${uid}/settings`, `users/${uid}/translations`, `users/${uid}`]) {
    try { await set(ref(db, p), null); } catch {}
  }
  await deleteUser(cred.user);
  console.log('CLEANUP-OK');
} catch (e) { console.error('AUTH-FAIL:', e.code || '', e.message); }
