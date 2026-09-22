// 🔧 Configuración de tu proyecto de Firebase (lineablanca-ef10c).
const firebaseConfig = {
  apiKey: "AIzaSyD37OwbQsitBznJWICt3L6SlW-mVxI38yM",
  authDomain: "lineablanca-ef10c.firebaseapp.com",
  databaseURL: "https://lineablanca-ef10c.firebaseio.com",
  projectId: "lineablanca-ef10c",
  storageBucket: "lineablanca-ef10c.firebasestorage.app",
  messagingSenderId: "1021529393543",
  appId: "1:1021529393543:web:8ae0cb445caa5d9293eb22"
};

// ✏️ FALTA: pon aquí el correo con el que vas a entrar (el mismo que
// diste de alta en Authentication -> Users). Debe coincidir EXACTO con
// la lista de firestore.rules y storage.rules -- si agregas otro correo,
// actualízalo en los tres lugares.
const CORREOS_AUTORIZADOS = [
  "roesve@gmail.com"
];

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
