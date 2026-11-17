'use client';

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  Auth,
  GoogleAuthProvider,
} from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getMessaging, Messaging, isSupported } from 'firebase/messaging';
import { publicEnv } from '../env';

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let firestoreDisabled = false;

export function isFirebaseClientConfigured(): boolean {
  const c = publicEnv.firebase;
  return Boolean(c.apiKey && c.authDomain && c.projectId && c.appId);
}

export function getFirebaseClientApp(): FirebaseApp {
  if (appInstance) return appInstance;
  if (getApps().length > 0) {
    appInstance = getApp();
    return appInstance;
  }

  if (!isFirebaseClientConfigured()) {
    throw new Error('Firebase Client SDK configuration (NEXT_PUBLIC_FIREBASE_*) is missing.');
  }

  appInstance = initializeApp({
    apiKey: publicEnv.firebase.apiKey,
    authDomain: publicEnv.firebase.authDomain,
    projectId: publicEnv.firebase.projectId,
    storageBucket: publicEnv.firebase.storageBucket,
    messagingSenderId: publicEnv.firebase.messagingSenderId,
    appId: publicEnv.firebase.appId,
  });

  return appInstance;
}

export function getFirebaseClientAuth(): Auth {
  if (authInstance) return authInstance;
  const app = getFirebaseClientApp();
  if (typeof window !== 'undefined') {
    try {
      authInstance = initializeAuth(app, {
        persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      });
      return authInstance;
    } catch {
      // If already initialized, getAuth returns the existing instance
    }
  }
  authInstance = getAuth(app);
  return authInstance;
}

export const googleAuthProvider = new GoogleAuthProvider();

export async function getFirebaseClientMessaging(): Promise<Messaging | null> {
  if (typeof window === 'undefined') return null;
  const supported = await isSupported();
  if (!supported) return null;
  return getMessaging(getFirebaseClientApp());
}

export function getFirebaseClientFirestore(): Firestore | null {
  if (typeof window === 'undefined' || !isFirebaseClientConfigured() || firestoreDisabled) {
    return null;
  }
  try {
    return getFirestore(getFirebaseClientApp());
  } catch {
    return null;
  }
}

export function markFirestoreDisabled(): void {
  firestoreDisabled = true;
}
