import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 8080;
const distDir = path.join(__dirname, 'dist');
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'firebase-applet-config.json'), 'utf8'));
const adminEmails = new Set([
  'christinalucas1216@gmail.com',
  'tryonapptestuser@gmail.com',
  'tryonapptesteruser@gmail.com'
]);

app.use(express.json());

function firestoreBase() {
  const databaseId = encodeURIComponent(firebaseConfig.firestoreDatabaseId || '(default)');
  return `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${databaseId}`;
}

function fieldValue(field) {
  if (!field) return '';
  if (Object.prototype.hasOwnProperty.call(field, 'stringValue')) return field.stringValue;
  if (Object.prototype.hasOwnProperty.call(field, 'integerValue')) return Number(field.integerValue || 0);
  if (Object.prototype.hasOwnProperty.call(field, 'doubleValue')) return Number(field.doubleValue || 0);
  if (Object.prototype.hasOwnProperty.call(field, 'timestampValue')) return field.timestampValue;
  if (Object.prototype.hasOwnProperty.call(field, 'booleanValue')) return Boolean(field.booleanValue);
  return '';
}

function documentId(documentName) {
  return String(documentName || '').split('/').pop() || '';
}

async function fetchServiceAccessToken() {
  const response = await fetch(
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
    { headers: { 'Metadata-Flavor': 'Google' } }
  );
  if (!response.ok) {
    throw new Error(`Metadata token request failed: ${response.status}`);
  }
  const payload = await response.json();
  return payload.access_token;
}

async function verifyFirebaseUser(idToken) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    }
  );
  if (!response.ok) {
    throw new Error(`Firebase token verification failed: ${response.status}`);
  }
  const payload = await response.json();
  const user = payload.users?.[0];
  if (!user?.email) {
    throw new Error('Firebase token did not include an email user.');
  }
  return user;
}

async function listFirestoreDocuments(collectionPath, accessToken) {
  const documents = [];
  let pageToken = '';

  do {
    const url = new URL(`${firestoreBase()}/documents/${collectionPath}`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (response.status === 404) {
      return documents;
    }
    if (!response.ok) {
      throw new Error(`Firestore list failed for ${collectionPath}: ${response.status} ${await response.text()}`);
    }

    const payload = await response.json();
    documents.push(...(payload.documents || []));
    pageToken = payload.nextPageToken || '';
  } while (pageToken);

  return documents;
}

app.get('/api/admin/user-download-summaries', async (request, response) => {
  try {
    const authHeader = request.get('authorization') || '';
    const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!idToken) {
      response.status(401).json({ error: 'Missing authorization token.' });
      return;
    }

    const user = await verifyFirebaseUser(idToken);
    const email = String(user.email || '').trim().toLowerCase();
    if (!adminEmails.has(email)) {
      response.status(403).json({ error: 'Admin access is required.' });
      return;
    }

    const accessToken = await fetchServiceAccessToken();
    const userDocuments = await listFirestoreDocuments('users', accessToken);
    const summaries = await Promise.all(userDocuments.map(async (userDocument) => {
      const userId = documentId(userDocument.name);
      const fields = userDocument.fields || {};
      const downloads = await listFirestoreDocuments(`users/${encodeURIComponent(userId)}/downloads`, accessToken);
      let lastDownloadAt = '';

      for (const download of downloads) {
        const savedAt = String(fieldValue(download.fields?.savedAt) || '');
        if (savedAt && (!lastDownloadAt || savedAt > lastDownloadAt)) {
          lastDownloadAt = savedAt;
        }
      }

      const storedEmail = String(fieldValue(fields.email) || '');
      return {
        userId,
        email: storedEmail,
        displayName: String(fieldValue(fields.displayName) || storedEmail || 'Unknown user'),
        downloadCount: downloads.length,
        lastDownloadAt
      };
    }));

    summaries.sort((a, b) => {
      if (b.downloadCount !== a.downloadCount) return b.downloadCount - a.downloadCount;
      if (b.lastDownloadAt !== a.lastDownloadAt) return b.lastDownloadAt.localeCompare(a.lastDownloadAt);
      return a.email.localeCompare(b.email);
    });

    response.json({
      projectId: firebaseConfig.projectId,
      databaseId: firebaseConfig.firestoreDatabaseId,
      users: summaries
    });
  } catch (error) {
    console.error('Admin user download summary failed:', error);
    response.status(500).json({
      error: 'Unable to load admin download activity.',
      detail: error instanceof Error ? error.message : String(error)
    });
  }
});

app.use(
  express.static(distDir, {
    index: false,
    maxAge: '1h',
  })
);

app.get('*', (_request, response) => {
  response.sendFile(path.join(distDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`Message Backup web dashboard listening on ${port}`);
});
