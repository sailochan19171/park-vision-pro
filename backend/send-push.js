// Simple Node script to send Web Push via FCM HTTP v1
// Usage: node backend/send-push.js "Title" "Body" "/optional-path"
// Requires a service account JSON and a Firebase project.

const { google } = require('googleapis');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// Load .env from backend folder if present
try {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch (e) {
  // ignore if dotenv not available
}

// Resolve service account path robustly
const DEFAULT_SERVICE_ACCOUNT_PATH = path.join(__dirname, 'service-account.json');
let SERVICE_ACCOUNT_PATH = process.env.FB_SERVICE_ACCOUNT || DEFAULT_SERVICE_ACCOUNT_PATH;
if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.warn(`Service account not found at ${SERVICE_ACCOUNT_PATH}, falling back to ${DEFAULT_SERVICE_ACCOUNT_PATH}`);
  SERVICE_ACCOUNT_PATH = DEFAULT_SERVICE_ACCOUNT_PATH;
}

// Never allow external GOOGLE_APPLICATION_CREDENTIALS to override this script's auth
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.warn('Ignoring GOOGLE_APPLICATION_CREDENTIALS from environment for this script.');
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
}

// Resolve project id: prefer env, else try service account file
let PROJECT_ID = process.env.FB_PROJECT_ID || 'YOUR_PROJECT_ID';
try {
  if (PROJECT_ID === 'YOUR_PROJECT_ID') {
    const keyTmp = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
    if (keyTmp && keyTmp.project_id) {
      PROJECT_ID = keyTmp.project_id;
    }
  }
} catch (e) {
  // ignore; if invalid, FCM call will error with a clear message
}

console.log(`[push] Using service account: ${SERVICE_ACCOUNT_PATH}`);
console.log(`[push] Using project: ${PROJECT_ID}`);

async function getAccessToken() {
  const key = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
  const jwtClient = new google.auth.JWT(
    key.client_email,
    null,
    key.private_key,
    ['https://www.googleapis.com/auth/firebase.messaging'],
    null
  );
  const tokens = await jwtClient.authorize();
  return tokens.access_token;
}

async function sendFcmMessage(token, title, body, clickAction) {
  const accessToken = await getAccessToken();
  const url = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;

  const message = {
    message: {
      token,
      notification: { title, body },
      webpush: {
        fcm_options: {
          link: clickAction || '/',
        },
      },
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`FCM error: ${txt}`);
  }
  return res.json();
}

(async () => {
  const title = process.argv[2] || 'VayAccess Update';
  const body = process.argv[3] || 'New updates are live on the site.';
  const link = process.argv[4] || '/';

  // For demo: read tokens from a file you export from Firestore or inject via env
  // Better: build a small script to read tokens from Firestore Admin SDK.
  const tokensFile = process.env.FCM_TOKENS_FILE || path.join(__dirname, 'tokens.txt');
  if (!fs.existsSync(tokensFile)) {
    console.error('tokens.txt not found. Provide a newline-delimited list of FCM tokens.');
    process.exit(1);
  }
  const tokens = fs.readFileSync(tokensFile, 'utf8').split(/\r?\n/).filter(Boolean);

  console.log(`Sending to ${tokens.length} tokens...`);
  for (const t of tokens) {
    try {
      const r = await sendFcmMessage(t, title, body, link);
      console.log('OK', r.name);
    } catch (e) {
      console.error('ERR', e.message);
    }
  }
})();