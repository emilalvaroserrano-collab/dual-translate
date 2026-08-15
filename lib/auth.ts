/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { create } from 'zustand';
import { ConversationTurn } from './state';
import { auth, db } from './firebase';
import { ref, update, push, remove, set, get } from 'firebase/database';
import {
  GoogleAuthProvider,
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail as fbSendPasswordResetEmail,
  signOut as fbSignOut,
  onAuthStateChanged,
} from 'firebase/auth';

// --- AUTH STORE ---

export interface AuthUser {
  id: string;
  email: string;
  displayName?: string;
  photoURL?: string;
}

interface AuthState {
  session: User | null;
  user: AuthUser | null;
  isSuperAdmin: boolean;
  loading: boolean;
  loadingData: boolean;
  signOut: () => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  sendPasswordResetEmail: (email: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
}

const SUPERADMIN_EMAILS = ['master@eburon.ai', 'martijn@eburon.ai'];

function isSuperAdminEmailAuth(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = String(email).toLowerCase().trim();
  return SUPERADMIN_EMAILS.some((s) => s.toLowerCase() === lower);
}

const googleProvider = new GoogleAuthProvider();

export const useAuth = create<AuthState>((set) => ({
  session: null,
  user: null,
  isSuperAdmin: false,
  loading: true,
  loadingData: false,
  signOut: async () => {
    try {
      await fbSignOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
    }
    set({ session: null, user: null, isSuperAdmin: false });
  },
  signInWithPassword: async (email: string, password: string) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      await ensureUserRecord(userCredential.user, false);
      await Promise.allSettled([
        logAuthActivity(userCredential.user.email, 'Email Sign In', 'Auth'),
        broadcastAuthNotification({
          title: 'User Signed In',
          message: `${userCredential.user.email} signed in — realtime sync to admin`,
          email: userCredential.user.email,
          type: isSuperAdminEmailAuth(userCredential.user.email) ? 'superadmin' : 'auth',
        }),
      ]);
    } catch (error) {
      throw new Error(cleanFirebaseError(error));
    }
  },
  signUp: async (email: string, password: string) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const record = await ensureUserRecord(userCredential.user, true);
      await Promise.allSettled([
        logAuthActivity(userCredential.user.email, 'New User Registration (Sign Up)', 'Signup'),
        broadcastAuthNotification({
          title: 'New User Signed Up',
          message: `${userCredential.user.email} just created an account — ${record.credits} credits assigned. Live in admin now!`,
          email: userCredential.user.email,
          type: 'auth',
        }),
      ]);
    } catch (error) {
      throw new Error(cleanFirebaseError(error));
    }
  },
  sendPasswordResetEmail: async (email: string) => {
    try {
      await fbSendPasswordResetEmail(auth, email);
    } catch (error) {
      throw new Error(cleanFirebaseError(error));
    }
  },
  signInWithGoogle: async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const fbUser = result.user;
      const wasNew = !(await get(ref(db, 'users/' + fbUser.uid))).exists();
      const record = await ensureUserRecord(fbUser, true);
      await Promise.allSettled([
        logAuthActivity(
          fbUser.email,
          wasNew ? 'New User Registration (Google)' : 'Google OAuth Sign In',
          wasNew ? 'Signup' : 'Auth'
        ),
        broadcastAuthNotification({
          title: wasNew ? 'New User Registration (Google)' : 'Google OAuth Sign In',
          message: `${fbUser.email} ${wasNew ? 'just signed up' : 'signed in'} via Google — credits: ${record.credits}`,
          email: fbUser.email,
          type: isSuperAdminEmailAuth(fbUser.email) ? 'superadmin' : 'auth',
        }),
      ]);
    } catch (error) {
      throw new Error(cleanFirebaseError(error));
    }
  },
}));

// Keep the zustand store in sync with Firebase auth state.
onAuthStateChanged(auth, (fbUser) => {
  if (fbUser) {
    useAuth.setState({
      session: fbUser,
      user: {
        id: fbUser.uid,
        email: fbUser.email || '',
        displayName: fbUser.displayName || undefined,
        photoURL: fbUser.photoURL || undefined,
      },
      isSuperAdmin: isSuperAdminEmailAuth(fbUser.email),
      loading: false,
    });
    // Refresh lastLogin info in the user record on session restore (non-blocking).
    ensureUserRecord(fbUser, false).catch(() => {});
  } else {
    useAuth.setState({ session: null, user: null, isSuperAdmin: false, loading: false });
  }
});

// --- FIREBASE HELPERS (shared with the standalone auth.html / admin dashboard) ---

export function cleanFirebaseError(error: unknown): string {
  const code = (error as { code?: string })?.code || '';

  const messages: Record<string, string> = {
    'auth/invalid-email': 'Invalid email address.',
    'auth/user-disabled': 'This user account has been disabled.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/invalid-credential': 'Invalid email or password.',
    'auth/email-already-in-use': 'This email is already registered.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/popup-closed-by-user': 'Google sign-in was closed before completion.',
    'auth/cancelled-popup-request': 'Google sign-in was cancelled.',
    'auth/unauthorized-domain': 'This domain is not authorized in Firebase Authentication settings.',
  };

  return messages[code] || (error as Error)?.message || 'Something went wrong. Please try again.';
}

function sanitizeForLog(text: string | null | undefined): string {
  return String(text || '').slice(0, 300);
}

async function logAuthActivity(userEmail: string | null | undefined, action: string, category = 'Auth') {
  try {
    const logsRef = ref(db, 'activity_logs');
    const newLogRef = push(logsRef);
    await set(newLogRef, {
      id: newLogRef.key,
      userEmail: userEmail || '',
      action: sanitizeForLog(action),
      category,
      timestamp: new Date().toISOString(),
      ip: '0.0.0.0',
      device: navigator.userAgent.includes('Mobile') ? 'Mobile Device' : 'Desktop Browser',
      source: 'dual-translate-app',
      app_name: 'dualtranslator',
    });
  } catch (e) {
    console.warn('[auth] logAuthActivity failed', e);
  }
}

async function broadcastAuthNotification(payload: {
  title: string;
  message: string;
  email: string | null | undefined;
  type: string;
}) {
  try {
    const notifsRef = ref(db, 'notifications');
    const newNotifRef = push(notifsRef);
    await set(newNotifRef, {
      id: newNotifRef.key,
      title: sanitizeForLog(payload.title),
      message: sanitizeForLog(payload.message),
      email: payload.email || '',
      timestamp: new Date().toISOString(),
      type: payload.type,
      source: 'dual-translate-app',
    });
  } catch (e) {
    console.warn('[auth] broadcastAuthNotification failed', e);
  }
}

function normalizeExistingRole(existingRole: string | null | undefined): string | null {
  if (!existingRole) return null;
  const r = String(existingRole).toLowerCase();
  if (r === 'user') return 'member';
  if (['superadmin', 'admin', 'member'].includes(r)) return r;
  return 'member';
}

/** Creates/updates the RTDB record under users/{uid} — compatible with the admin dashboard schema. */
async function ensureUserRecord(user: User, isNewSignup = false) {
  try {
    const userRef = ref(db, 'users/' + user.uid);
    const snapshot = await get(userRef);
    const now = Date.now();
    const nowISO = new Date(now).toISOString();
    const providerData = user.providerData?.[0];
    const rawPhoto = user.photoURL || providerData?.photoURL || '';
    const photoURL =
      rawPhoto ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(user.email || 'User')}&background=6366f1&color=fff`;
    const phoneNumber = providerData?.phoneNumber || '';

    const existing = snapshot.val() || {};
    const emailLower = (user.email || '').toLowerCase();
    const isSuper = isSuperAdminEmailAuth(user.email);
    const existingRoleNorm = normalizeExistingRole(existing.role);

    let normalizedStatus = 'Active';
    if (existing.status) {
      const s = String(existing.status).toLowerCase();
      if (s === 'active') normalizedStatus = 'Active';
      else if (s === 'pending') normalizedStatus = 'Pending';
      else if (s === 'suspended') normalizedStatus = 'Suspended';
      else normalizedStatus = existing.status;
    }

    const adminCompatibleFields = {
      uid: user.uid,
      email: user.email || '',
      Email: user.email || '',
      displayName: user.displayName || existing.displayName || user.email?.split('@')[0] || 'User',
      name: user.displayName || existing.name || user.email?.split('@')[0] || 'User',
      photoURL,
      phone: existing.phone || phoneNumber || '',
      country: existing.country || 'Philippines',
      Appname: existing.Appname || 'DualTranslator',
      app_name: existing.app_name || 'dualtranslator',
      credits: existing.credits != null ? existing.credits : 100000,
      role: isSuper ? 'superadmin' : existingRoleNorm || 'member',
      plan: isSuper ? 'Enterprise' : existing.plan || 'Free',
      status: normalizedStatus,
      lastLogin: nowISO,
      lastLoginAt: nowISO,
      lastLoginTs: now,
      lastActiveAt: nowISO,
      createdAt: existing.createdAt
        ? typeof existing.createdAt === 'number'
          ? new Date(existing.createdAt).toISOString()
          : existing.createdAt
        : nowISO,
      createdAtTs: typeof existing.createdAt === 'number' ? existing.createdAt : existing.createdAtTs || now,
      updatedAt: now,
      updatedAtISO: nowISO,
    };

    if (!snapshot.exists()) {
      await set(userRef, adminCompatibleFields);
      console.log('[auth] User record CREATED for', user.email);
      await ensureUserChildNodes(user.uid);
      return adminCompatibleFields;
    }

    const merged = {
      ...existing,
      ...adminCompatibleFields,
      createdAt: existing.createdAt || adminCompatibleFields.createdAt,
      createdAtTs: existing.createdAtTs || existing.createdAt || adminCompatibleFields.createdAtTs,
    };
    await update(userRef, merged);
    console.log('[auth] User record UPDATED for', user.email);
    await ensureUserChildNodes(user.uid);
    return merged;
  } catch (err) {
    console.error('[auth] ensureUserRecord FAILED:', err);
    throw err;
  }
}

/** Guarantees the per-user data nodes (translations = the history table, settings) exist, even before the first exchange. NOTE: RTDB drops empty `{}` nodes, so a `_meta` marker keeps the node alive; views filter out keys starting with `_`. */
async function ensureUserChildNodes(userId: string) {
  try {
    const nowISO = new Date().toISOString();
    await Promise.all(
      ['settings', 'translations'].map(async (childName) => {
        const childRef = ref(db, `users/${userId}/${childName}`);
        if (!(await get(childRef)).exists()) {
          await set(childRef, { _meta: { createdAt: nowISO } });
          console.log(`[auth] Created ${childName} node for`, userId);
        }
      })
    );
  } catch (err) {
    console.error('[auth] ensureUserChildNodes FAILED:', err);
  }
}

// --- DATABASE HELPERS ---
export const updateUserSettings = async (userId: string, newSettings: Partial<{ systemPrompt: string; voice: string }>) => {
  try {
    await update(ref(db, `users/${userId}/settings`), newSettings);
  } catch (error) {
    console.error('Error saving settings:', error);
  }
};

export const updateUserConversations = async (
  userId: string,
  userEmail: string,
  turns: ConversationTurn[],
  pair: { lang1: string; lang2: string }
) => {
  const lastTurn = turns[turns.length - 1];
  if (!lastTurn || !lastTurn.isFinal || lastTurn.role !== 'agent') return;

  let sourceTurn: ConversationTurn | null = null;
  for (let i = turns.length - 2; i >= 0; i--) {
    if (turns[i].role === 'user') {
      sourceTurn = turns[i];
      break;
    }
  }
  if (!sourceTurn) return;

  const translatedText = (lastTurn.translation || lastTurn.text || '').trim();
  const sourceText = (sourceTurn.text || '').trim();
  if (!translatedText || !sourceText) return;

  try {
    const translationProm = push(ref(db, `users/${userId}/translations`), {
      userId,
      userEmail,
      sourceText,
      translatedText,
      lang1: pair.lang1,
      lang2: pair.lang2,
      timestamp: new Date().toISOString(),
    });

    // best-effort mirror into activity_logs so the admin dashboard's live stream/audit tab records it
    const logProm = push(ref(db, 'activity_logs'), {
      userEmail,
      action: `${pair.lang1} → ${pair.lang2}: ${truncate(sourceText, 60)} ⇢ ${truncate(translatedText, 60)}`,
      category: 'Translation',
      timestamp: new Date().toISOString(),
      device: 'Desktop Browser',
    }).catch((error) => {
      console.warn('Translation activity log not recorded:', error);
    });

    await Promise.all([translationProm, logProm]);
  } catch (error) {
    console.error('Error saving translation to Firebase:', error);
  }
};

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max - 1) + '…' : value;
}

export const clearUserConversations = async (userId: string) => {
  try {
    await remove(ref(db, `users/${userId}/translations`));
  } catch (error) {
    console.error('Error clearing history:', error);
  }
};