const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }

    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function normalizeConfig(config) {
  if (!config || typeof config !== 'object') {
    return null;
  }

  const apiKey = String(config.apiKey || '').trim();
  const projectId = String(config.projectId || '').trim();
  const firestoreDatabaseId = String(config.firestoreDatabaseId || '').trim() || '(default)';

  if (!apiKey || !projectId || apiKey.includes('YOUR_') || projectId.includes('YOUR_')) {
    return null;
  }

  return {
    apiKey,
    projectId,
    firestoreDatabaseId,
    authDomain: String(config.authDomain || '').trim(),
    appId: String(config.appId || '').trim(),
    storageBucket: String(config.storageBucket || '').trim(),
    messagingSenderId: String(config.messagingSenderId || '').trim()
  };
}

function mapFirebaseAuthError(message) {
  const code = String(message || '').replace(/^Firebase:\s*/, '');
  const shortCode = code.split(' ')[0];

  switch (shortCode) {
    case 'EMAIL_EXISTS':
      return 'That email address is already registered.';
    case 'INVALID_LOGIN_CREDENTIALS':
    case 'INVALID_PASSWORD':
    case 'EMAIL_NOT_FOUND':
      return 'Incorrect email or password.';
    case 'WEAK_PASSWORD':
      return 'Password must be at least 6 characters long.';
    case 'TOO_MANY_ATTEMPTS_TRY_LATER':
      return 'Too many login attempts. Try again later.';
    case 'USER_DISABLED':
      return 'This account has been disabled.';
    default:
      return code || 'Authentication failed.';
  }
}

function parseFirestoreInteger(field) {
  if (!field) return 0;
  if (field.integerValue !== undefined) return Number(field.integerValue) || 0;
  if (field.doubleValue !== undefined) return Number(field.doubleValue) || 0;
  return 0;
}

class AuthService {
  constructor({ userDataPath, configPath }) {
    this.sessionPath = path.join(userDataPath, 'auth-session.json');
    this.configPath = configPath;
    this.session = readJson(this.sessionPath, null);
  }

  readConfig() {
    return normalizeConfig(readJson(this.configPath, null));
  }

  saveSession(session) {
    this.session = session;
    if (session) {
      writeJson(this.sessionPath, session);
    } else if (fs.existsSync(this.sessionPath)) {
      fs.rmSync(this.sessionPath, { force: true });
    }
  }

  async requestJson(url, options = {}) {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const text = await response.text();
    let data = {};

    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
    }

    if (!response.ok) {
      const message = data?.error?.message || data?.raw || `Request failed with ${response.status}`;
      throw new Error(message);
    }

    return data;
  }

  getFirestoreBase(config) {
    const databaseId = encodeURIComponent(config.firestoreDatabaseId || '(default)');
    return `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/${databaseId}`;
  }

  async refreshFirebaseSessionIfNeeded() {
    if (!this.session || this.session.mode !== 'firebase') {
      return this.session;
    }

    const expiresAt = Number(this.session.expiresAt || 0);
    if (expiresAt > Date.now() + 60_000) {
      return this.session;
    }

    const config = this.readConfig();
    if (!config) {
      throw new Error('Firebase config is missing.');
    }

    const refreshResponse = await fetch(
      `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(config.apiKey)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.session.refreshToken
        }).toString()
      }
    );

    const text = await refreshResponse.text();
    let response = {};
    if (text) {
      try {
        response = JSON.parse(text);
      } catch {
        response = { raw: text };
      }
    }

    if (!refreshResponse.ok) {
      const message = response?.error?.message || response?.raw || 'Session refresh failed.';
      throw new Error(message);
    }

    const updatedSession = {
      ...this.session,
      idToken: response.id_token,
      refreshToken: response.refresh_token,
      userId: response.user_id || this.session.userId,
      expiresAt: Date.now() + (Number(response.expires_in || 3600) * 1000)
    };

    this.saveSession(updatedSession);
    return updatedSession;
  }

  async fetchUserProfile(userId, idToken) {
    const config = this.readConfig();
    if (!config) {
      throw new Error('Firebase config is missing.');
    }

    const response = await fetch(
      `${this.getFirestoreBase(config)}/documents/users/${encodeURIComponent(userId)}`,
      {
        headers: {
          Authorization: `Bearer ${idToken}`
        }
      }
    );

    if (response.status === 404) {
      return null;
    }

    const text = await response.text();
    let data = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
    }

    if (!response.ok) {
      const message = data?.error?.message || data?.raw || 'Failed to load user profile.';
      throw new Error(message);
    }

    return data;
  }

  async patchUserProfile(userId, idToken, fields) {
    const config = this.readConfig();
    if (!config) {
      throw new Error('Firebase config is missing.');
    }

    const url = new URL(`${this.getFirestoreBase(config)}/documents/users/${encodeURIComponent(userId)}`);
    Object.keys(fields).forEach((fieldPath) => {
      url.searchParams.append('updateMask.fieldPaths', fieldPath);
    });

    return this.requestJson(url.toString(), {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${idToken}`
      },
      body: {
        fields
      }
    });
  }

  async ensureUserProfile(session) {
    const existingDoc = await this.fetchUserProfile(session.userId, session.idToken);
    const now = new Date().toISOString();
    const existingCount = parseFirestoreInteger(existingDoc?.fields?.exportCount);

    await this.patchUserProfile(session.userId, session.idToken, {
      email: { stringValue: session.email },
      displayName: { stringValue: session.email.split('@')[0] || session.email },
      exportCount: { integerValue: String(existingCount) },
      updatedAt: { timestampValue: now },
      createdAt: existingDoc?.fields?.createdAt || { timestampValue: now }
    });

    return existingCount;
  }

  async getAuthState() {
    if (!this.session) {
      return {
        authenticated: false,
        authAvailable: !!this.readConfig()
      };
    }

    if (this.session.mode === 'firebase') {
      try {
        await this.refreshFirebaseSessionIfNeeded();
      } catch {
        this.saveSession(null);
        return {
          authenticated: false,
          authAvailable: !!this.readConfig(),
          error: 'Your saved session expired. Please sign in again.'
        };
      }
    }

    return {
      authenticated: true,
      authAvailable: !!this.readConfig(),
      mode: this.session.mode,
      email: this.session.email,
      userId: this.session.userId,
      exportCount: Number(this.session.exportCount || 0)
    };
  }

  async signUp(email, password) {
    const config = this.readConfig();
    if (!config) {
      throw new Error('Firebase login is not configured yet.');
    }

    const response = await this.requestJson(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(config.apiKey)}`,
      {
        method: 'POST',
        body: {
          email,
          password,
          returnSecureToken: true
        }
      }
    ).catch((error) => {
      throw new Error(mapFirebaseAuthError(error.message));
    });

    const session = {
      mode: 'firebase',
      email: response.email,
      userId: response.localId,
      idToken: response.idToken,
      refreshToken: response.refreshToken,
      expiresAt: Date.now() + (Number(response.expiresIn || 3600) * 1000),
      exportCount: 0
    };

    session.exportCount = await this.ensureUserProfile(session);
    this.saveSession(session);
    return this.getAuthState();
  }

  async signIn(email, password) {
    const config = this.readConfig();
    if (!config) {
      throw new Error('Firebase login is not configured yet.');
    }

    const response = await this.requestJson(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(config.apiKey)}`,
      {
        method: 'POST',
        body: {
          email,
          password,
          returnSecureToken: true
        }
      }
    ).catch((error) => {
      throw new Error(mapFirebaseAuthError(error.message));
    });

    const session = {
      mode: 'firebase',
      email: response.email,
      userId: response.localId,
      idToken: response.idToken,
      refreshToken: response.refreshToken,
      expiresAt: Date.now() + (Number(response.expiresIn || 3600) * 1000),
      exportCount: 0
    };

    session.exportCount = await this.ensureUserProfile(session);
    this.saveSession(session);
    return this.getAuthState();
  }

  async continueAsGuest() {
    const previousCount = this.session?.mode === 'guest' ? Number(this.session.exportCount || 0) : 0;
    this.saveSession({
      mode: 'guest',
      email: 'Guest account',
      userId: this.session?.mode === 'guest' ? this.session.userId : `guest-${randomUUID()}`,
      exportCount: previousCount
    });

    return this.getAuthState();
  }

  async signOut() {
    this.saveSession(null);
    return this.getAuthState();
  }

  async adoptRemoteSession(payload) {
    const email = String(payload?.email || '').trim();
    const userId = String(payload?.userId || '').trim();
    const idToken = String(payload?.idToken || '').trim();
    const refreshToken = String(payload?.refreshToken || '').trim();

    if (!userId || !idToken || !refreshToken) {
      throw new Error('Hosted login did not provide a usable session.');
    }

    const session = {
      mode: 'firebase',
      email: email || 'user@messagebackup.local',
      userId,
      idToken,
      refreshToken,
      expiresAt: Date.now() + (Number(payload?.expiresIn || 3600) * 1000),
      exportCount: 0,
      displayName: String(payload?.displayName || '').trim(),
      photoURL: String(payload?.photoURL || '').trim(),
      isAnonymous: !!payload?.isAnonymous
    };

    session.exportCount = await this.ensureUserProfile(session);
    this.saveSession(session);
    return this.getAuthState();
  }

  async recordExport() {
    if (!this.session) {
      throw new Error('Sign in or continue as guest before exporting.');
    }

    if (this.session.mode === 'guest') {
      this.session.exportCount = Number(this.session.exportCount || 0) + 1;
      this.saveSession(this.session);
      return this.getAuthState();
    }

    const session = await this.refreshFirebaseSessionIfNeeded();
    const existingDoc = await this.fetchUserProfile(session.userId, session.idToken);
    const nextCount = parseFirestoreInteger(existingDoc?.fields?.exportCount) + 1;

    await this.patchUserProfile(session.userId, session.idToken, {
      exportCount: { integerValue: String(nextCount) },
      updatedAt: { timestampValue: new Date().toISOString() }
    });

    session.exportCount = nextCount;
    this.saveSession(session);
    return this.getAuthState();
  }
}

function createAuthService(options) {
  return new AuthService(options);
}

module.exports = {
  createAuthService
};
