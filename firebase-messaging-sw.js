importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");
firebase.initializeApp({
  apiKey: "AIzaSyCHd0Ump_ifDXeL6ccoUv0t8N1T6ZbLtoo",
  authDomain: "my-life-tracker-47434.firebaseapp.com",
  projectId: "my-life-tracker-47434",
  storageBucket: "my-life-tracker-47434.firebasestorage.app",
  messagingSenderId: "102930800039",
  appId: "1:102930800039:web:0d298771dacc17b5e62a82"
});
firebase.messaging();
self.addEventListener("notificationclick", (e) => {
  const link = (e.notification.data && (e.notification.data.link || (e.notification.data.FCM_MSG && e.notification.data.FCM_MSG.fcmOptions && e.notification.data.FCM_MSG.fcmOptions.link))) || self.registration.scope;
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((ws) => { for (const w of ws) { if ("navigate" in w) return w.navigate(link).then((c) => c && c.focus()); } return clients.openWindow(link); }));
});
