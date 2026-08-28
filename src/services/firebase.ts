import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, FacebookAuthProvider, signInWithPopup } from 'firebase/auth';

console.log("API Key carregada:", import.meta.env.VITE_FIREBASE_API_KEY);
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: "vamos018.firebaseapp.com",
    projectId: "vamos018",
    storageBucket: "vamos018.firebasestorage.app",
    messagingSenderId: "1005911596835",
    appId: "1:1005911596835:web:3c71d05c14d51833deb696"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
export const facebookProvider = new FacebookAuthProvider();

export const signInWithGoogle = async () => {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        return result.user;
    } catch (error) {
        console.error('Erro no login Google:', error);
        throw error;
    }
};

export const signInWithFacebook = async () => {
    try {
        const result = await signInWithPopup(auth, facebookProvider);
        return result.user;
    } catch (error) {
        console.error('Erro no login Facebook:', error);
        throw error;
    }
};