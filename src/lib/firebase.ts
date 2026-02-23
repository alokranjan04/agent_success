import { initializeApp } from 'firebase/app'
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore'

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)

// ─── Admin Settings Helpers ───

const SETTINGS_COLLECTION = 'admin_configuration'
const SETTINGS_DOC = 'agent_settings'

export async function getAdminTheme(): Promise<'dark' | 'light'> {
    try {
        const snap = await getDoc(doc(db, SETTINGS_COLLECTION, SETTINGS_DOC))
        if (snap.exists() && snap.data().theme) {
            return snap.data().theme as 'dark' | 'light'
        }
    } catch (e) {
        console.warn('[Firebase] Could not read theme:', e)
    }
    return 'dark' // default
}

export async function setAdminTheme(theme: 'dark' | 'light'): Promise<void> {
    try {
        await setDoc(doc(db, SETTINGS_COLLECTION, SETTINGS_DOC), { theme }, { merge: true })
    } catch (e) {
        console.warn('[Firebase] Could not save theme:', e)
    }
}
