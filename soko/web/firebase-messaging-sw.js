// Service worker that lets Firebase Cloud Messaging show notifications while
// the web app is closed or in a background tab. Must live at this exact path
// (web root) — firebase_messaging_web registers it under this name by default.

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

// These values are the public Firebase web config (safe to expose client-side)
// — copied from lib/firebase_options.dart's `web` FirebaseOptions. Keep the two
// in sync if you ever re-run `flutterfire configure`.
firebase.initializeApp({
  apiKey: 'AIzaSyB3Y8Tfx53oXiqwvcn6tQpjaK0U3bBodWc',
  appId: '1:329166541514:web:03a09deca3629c89515a33',
  messagingSenderId: '329166541514',
  projectId: 'soko-b97c0',
  authDomain: 'soko-b97c0.firebaseapp.com',
  storageBucket: 'soko-b97c0.firebasestorage.app',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? 'New notification';
  const options = {
    body: payload.notification?.body,
    icon: '/icons/Icon-192.png',
  };
  self.registration.showNotification(title, options);
});
