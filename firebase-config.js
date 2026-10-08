// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCBOEYN9LP1oKpZ6c5Ear7Q1mysEZzgFng",
  authDomain: "zerogravity-ab52d.firebaseapp.com",
  databaseURL: "https://zerogravity-ab52d-default-rtdb.firebaseio.com",
  projectId: "zerogravity-ab52d",
  storageBucket: "zerogravity-ab52d.firebasestorage.app",
  messagingSenderId: "835959853717",
  appId: "1:835959853717:web:40cd726afc46ba29bd819c",
  measurementId: "G-Z07CZMHQ98"
};

const appNickname = "Poor Man Ai";

// One Hosting site. A deploy to "poorman" publishes all three.
const hostingSites = [
  { host: "poorman.web.app", kind: "default" },
  { host: "poorman.firebaseapp.com", kind: "default" },
  { host: "ai.usavisible.com", kind: "custom" }
];

// App Check for the registered web app. Not initialized yet.
const appCheckConfig = {
  appNickname: "Poor Man Ai",
  platform: "web",
  status: "registered",
  provider: "recaptcha-enterprise",
  providerLabel: "Fraud Defense (formerly known as reCAPTCHA Enterprise)",
  siteKey: "6LcgaN8tAAAAALpOKsbFih4QEbqmUbR44FFspk75",
  tokenTtlMillis: 60 * 60 * 1000
};

export { firebaseConfig, appNickname, hostingSites, appCheckConfig };
