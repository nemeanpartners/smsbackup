import { useState, useEffect } from 'react';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { doc, getDocFromServer } from 'firebase/firestore';
import { auth, db } from './firebase';
import { ensureUserProfile, fetchAdminUserDownloadSummaries } from './services/dbService';
import { AdminUserDownloadSummary, UserConfig } from './types';
import { LoginGate } from './components/LoginGate';
import { ProfileModal } from './components/ProfileModal';
import { SupportTicketsModal } from './components/SupportTicketsModal';
import AdminSupportPortal from './components/admin/AdminSupportPortal';
import { Shield, LogOut, CheckCircle, RefreshCw, AlertTriangle, User as UserIcon, Users, FileDown, CalendarClock, MessageSquare } from 'lucide-react';

const ADMIN_EMAILS = new Set([
  'christinalucas1216@gmail.com',
  'tryonapptestuser@gmail.com',
  'tryonapptesteruser@gmail.com'
]);

function isAdminEmail(email?: string | null) {
  return ADMIN_EMAILS.has(String(email || '').trim().toLowerCase());
}

function formatAdminDate(value: string) {
  if (!value) return 'No XML downloads yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserConfig | null>(null);
  
  const [authLoading, setAuthLoading] = useState(true);
  const [connectionVerified, setConnectionVerified] = useState<boolean | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [showAdminPortal, setShowAdminPortal] = useState(false);
  const [adminView, setAdminView] = useState<'downloads' | 'support'>('downloads');
  const [adminSummaries, setAdminSummaries] = useState<AdminUserDownloadSummary[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [isOfflineSandbox, setIsOfflineSandbox] = useState<boolean>(() => {
    return localStorage.getItem('is_offline_sandbox') === 'true';
  });
  const isLoginPopup = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('loginPopup') === '1';
  const isDesktopMode = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('desktop') === '1';
  const isElectronHost = typeof window !== 'undefined' &&
    window.navigator.userAgent.toLowerCase().includes('electron');
  const isDesktopLoginPopup = isLoginPopup || (isDesktopMode && isElectronHost);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('desktopSignOut') === '1') {
      void signOut(auth).catch((error) => {
        console.warn('Desktop sign-out sync failed:', error);
      });
    }
  }, []);

  // 1. Critical Base Connectivity check on boot
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
        setConnectionVerified(true);
      } catch (error: any) {
        // "the client is offline" is expected in some environments or permissions block, but we register the response
        console.warn('Firebase rules connection test diagnostics:', error.message);
        if (error?.message && error.message.includes('the client is offline')) {
          setConnectionVerified(false);
        } else {
          setConnectionVerified(true); // Connected to server but rejected by rule (which means online!)
        }
      }
    }
    testConnection();
  }, []);

  // 2. Auth State Change Listener
  useEffect(() => {
    if (isOfflineSandbox) {
      const mockUser = {
        uid: 'offline-guest',
        email: 'christinalucas1216@gmail.com', // Admin login mock
        displayName: 'Offline Admin',
        photoURL: ''
      } as any;
      setCurrentUser(mockUser);
      
      const loadOfflineProfile = async () => {
        try {
          const profile = await ensureUserProfile(
            mockUser.uid,
            mockUser.email,
            mockUser.displayName,
            ''
          );
          if (profile) {
            setUserProfile(profile);
          }
        } catch (err) {
          console.error('Failed to load offline profile', err);
        }
      };
      loadOfflineProfile();
      setAuthLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthLoading(true);
      if (user) {
        setCurrentUser(user);
        try {
          const profile = await ensureUserProfile(
            user.uid,
            user.email || 'user@backup.local',
            user.displayName || 'macOS Backup User',
            user.photoURL || ''
          );
          if (profile) {
            setUserProfile(profile);
          }
        } catch (err) {
          console.error('Failed to ensure user profile', err);
        }
      } else {
        setCurrentUser(null);
        setUserProfile(null);
        setAdminSummaries([]);
        setIsSupportOpen(false);
        setShowAdminPortal(false);
        setAdminView('downloads');
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, [isOfflineSandbox]);

  const loadAdminSummaries = async () => {
    setAdminLoading(true);
    setAdminError('');
    try {
      const summaries = await fetchAdminUserDownloadSummaries();
      setAdminSummaries(summaries);
    } catch (err) {
      console.error('Failed to load admin user download summaries', err);
      setAdminError('Unable to load admin download activity. Please refresh.');
    } finally {
      setAdminLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser && showAdminPortal && isAdminEmail(currentUser.email)) {
      void loadAdminSummaries();
    }
  }, [currentUser, showAdminPortal]);

  const handleLogout = async () => {
    try {
      if (isOfflineSandbox) {
        setIsOfflineSandbox(false);
        localStorage.removeItem('is_offline_sandbox');
        setCurrentUser(null);
        setUserProfile(null);
        setAdminSummaries([]);
        setIsSupportOpen(false);
        setShowAdminPortal(false);
        setAdminView('downloads');
      } else {
        await signOut(auth);
      }
    } catch (err) {
      console.error('Sign Out failed', err);
    }
  };

  const handleOfflineBypass = () => {
    localStorage.setItem('is_offline_sandbox', 'true');
    setIsOfflineSandbox(true);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0b0f19] flex flex-col items-center justify-center p-4">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mb-3" />
        <p className="text-slate-400 font-mono text-xs">Synchronizing vault secrets...</p>
      </div>
    );
  }

  if (isDesktopLoginPopup && currentUser && !showAdminPortal) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
        <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center border border-blue-100 flex-shrink-0">
              <Shield className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-slate-800 text-sm leading-none truncate">Customer Access Portal</h1>
              <p className="text-[10px] text-slate-400 font-mono mt-0.5">MESSAGE BACKUP CLIENT</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => setIsProfileOpen(true)}
              className="text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-600 px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 border border-blue-100/50"
            >
              <UserIcon className="w-3.5 h-3.5" /> Profile Settings
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign Out
            </button>
          </div>
        </header>

        <div className="flex-1 p-4 flex items-center justify-center">
          <div className="bg-white border border-slate-200/80 shadow-xl rounded-2xl p-6 text-center max-w-sm w-full mx-auto">
            {userProfile && (
              <div className="flex flex-col items-center mb-5">
                {userProfile.photoURL ? (
                  <img
                    src={userProfile.photoURL}
                    alt="avatar"
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 rounded-full border-4 border-slate-100 shadow-md mb-3"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-blue-50 border-4 border-slate-100 shadow-md text-blue-600 flex items-center justify-center text-2xl font-black mb-3 select-none">
                    {userProfile.displayName ? userProfile.displayName.substring(0, 1).toUpperCase() : 'C'}
                  </div>
                )}
                <h2 className="text-lg font-bold text-slate-800 leading-tight">{userProfile.displayName || 'Customer'}</h2>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">{userProfile.email || currentUser.email || 'anonymous-session@backup.local'}</p>
              </div>
            )}

            <div className="bg-emerald-50 text-emerald-800 text-xs font-medium border border-emerald-100 rounded-xl px-4 py-3 mb-4 flex items-start gap-2.5 text-left">
              <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-emerald-900 text-xs">Successfully Connected</p>
                <p className="text-[10px] text-emerald-700 mt-0.5">You have authenticated this session.</p>
              </div>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed mb-5">
              Your device synchronization credentials are live. View your profile settings to edit your account name and manage stored companion backups.
            </p>

            <button
              type="button"
              onClick={() => setIsProfileOpen(true)}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2 px-4 rounded-xl transition shadow-lg shadow-slate-900/10 flex items-center justify-center gap-2 text-xs"
            >
              <UserIcon className="w-3.5 h-3.5" />
              View Account & Profile Page
            </button>
          </div>
        </div>

        {userProfile && (
          <ProfileModal
            isOpen={isProfileOpen}
            onClose={() => setIsProfileOpen(false)}
            currentUser={currentUser}
            userProfile={userProfile}
            onProfileUpdated={(updated) => setUserProfile(updated)}
            isAdmin={isAdminEmail(currentUser.email)}
            onOpenAdminPortal={() => setShowAdminPortal(true)}
            onOpenSupport={() => setIsSupportOpen(true)}
          />
        )}
        {currentUser && (
          <SupportTicketsModal
            isOpen={isSupportOpen}
            onClose={() => setIsSupportOpen(false)}
            currentUser={currentUser}
          />
        )}
      </div>
    );
  }

  // Not signed in -> gate entry
  if (!currentUser) {
    return (
      <LoginGate
        onSuccess={() => {
          // Success handled via listener
        }}
        onOfflineBypass={handleOfflineBypass}
      />
    );
  }

  const isAdmin = isAdminEmail(currentUser.email);

  if (!isAdmin || !showAdminPortal) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
        {/* Customer Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center border border-blue-100">
              <Shield className="w-4.5 h-4.5" />
            </div>
            <div>
              <h1 className="font-bold text-slate-800 text-sm sm:text-base leading-none">Customer Access Portal</h1>
              <p className="text-[10px] text-slate-400 font-mono mt-0.5">MESSAGE BACKUP CLIENT</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsProfileOpen(true)}
              className="text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-600 px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 border border-blue-100/50"
            >
              <UserIcon className="w-3.5 h-3.5" /> Profile Settings
            </button>
            <button
              onClick={handleLogout}
              className="text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign Out
            </button>
          </div>
        </header>

        {/* Customer Main Panel */}
        <div className="flex-1 max-w-md w-full mx-auto p-6 flex flex-col items-center justify-center space-y-6">
          <div className="bg-white border border-slate-200/80 shadow-xl rounded-2xl p-6 text-center w-full">
            {userProfile && (
              <div className="flex flex-col items-center mb-6">
                {userProfile.photoURL ? (
                  <img 
                    src={userProfile.photoURL} 
                    alt="avatar" 
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 rounded-full border-4 border-slate-100 shadow-md mb-3" 
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-blue-50 border-4 border-slate-100 shadow-md text-blue-600 flex items-center justify-center text-2xl font-black mb-3 select-none">
                    {userProfile.displayName ? userProfile.displayName.substring(0, 1).toUpperCase() : 'C'}
                  </div>
                )}
                <h2 className="text-lg font-bold text-slate-800 leading-tight">{userProfile.displayName || 'Customer'}</h2>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">{userProfile.email || 'anonymous-session@backup.local'}</p>
              </div>
            )}
            
            <div className="bg-emerald-50 text-emerald-800 text-xs font-medium border border-emerald-100 rounded-xl px-4 py-3 mb-5 flex items-start gap-2.5 text-left">
              <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-emerald-900 text-xs">Successfully Connected</p>
                <p className="text-[10px] text-emerald-700 mt-0.5">You have authenticated this session.</p>
              </div>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed mb-6">
              Your device synchronization credentials are live. You can close this browser tab, or view your profile settings to edit your account name and manage stored companion backups.
            </p>

            <button
              onClick={() => setIsProfileOpen(true)}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2 px-4 rounded-xl transition shadow-lg shadow-slate-900/10 flex items-center justify-center gap-2 text-xs"
            >
              <UserIcon className="w-3.5 h-3.5" />
              View Account & Profile Page
            </button>
          </div>
        </div>

        {userProfile && (
          <ProfileModal
            isOpen={isProfileOpen}
            onClose={() => setIsProfileOpen(false)}
            currentUser={currentUser}
            userProfile={userProfile}
            onProfileUpdated={(updated) => setUserProfile(updated)}
            isAdmin={isAdmin}
            onOpenAdminPortal={() => setShowAdminPortal(true)}
            onOpenSupport={() => setIsSupportOpen(true)}
          />
        )}
        <SupportTicketsModal
          isOpen={isSupportOpen}
          onClose={() => setIsSupportOpen(false)}
          currentUser={currentUser}
        />
      </div>
    );
  }

  const totalUsers = adminSummaries.length;
  const totalDownloads = adminSummaries.reduce((sum, user) => sum + user.downloadCount, 0);
  const activeDownloadUsers = adminSummaries.filter((user) => user.downloadCount > 0).length;

  return (
    <div id="dashboard-root" className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col font-sans selection:bg-blue-600/30">
      <header id="main-header" className="bg-[#111827]/80 sticky top-0 z-40 border-b border-slate-800/80 backdrop-blur-md px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 bg-blue-600/10 border border-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
            <Shield className="w-5 h-5 text-blue-400" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display font-bold text-slate-100 tracking-tight text-sm sm:text-base leading-none truncate">
              Admin Portal
            </h1>
            <p className="text-[10px] text-slate-500 font-mono mt-0.5">
              USER XML DOWNLOAD ACTIVITY
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 bg-slate-900 border border-slate-800 rounded-md">
            {connectionVerified !== false ? (
              <span className="flex h-1.5 w-1.5 bg-emerald-500 rounded-full"></span>
            ) : (
              <span className="flex h-1.5 w-1.5 bg-amber-500 rounded-full animate-pulse"></span>
            )}
            <span className="text-[10px] font-mono text-slate-400">
              {connectionVerified !== false ? 'Cloud Db Sync' : 'Db Sandbox Off'}
            </span>
          </div>

          <button
            id="profile-btn"
            type="button"
            onClick={() => setIsProfileOpen(true)}
            className="text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-lg transition flex items-center gap-1.5"
          >
            <UserIcon className="w-3.5 h-3.5" />
            Profile
          </button>
          <div className="hidden sm:flex rounded-lg border border-slate-700 bg-slate-900 p-1">
            <button
              type="button"
              onClick={() => setAdminView('downloads')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                adminView === 'downloads'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              <FileDown className="w-3.5 h-3.5" />
              XML
            </button>
            <button
              type="button"
              onClick={() => setAdminView('support')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                adminView === 'support'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Support
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowAdminPortal(false);
              setIsProfileOpen(false);
            }}
            className="text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-lg transition"
          >
            Exit Admin Portal
          </button>
          <button
            id="logout-btn"
            type="button"
            onClick={handleLogout}
            className="p-2 hover:bg-slate-800 text-slate-400 hover:text-red-400 rounded-lg transition"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {connectionVerified === false && (
          <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs p-3.5 rounded-xl flex items-center gap-2.5 font-mono">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>Connection verification is limited. Refresh once the database connection is available.</span>
          </div>
        )}

        <div className="sm:hidden grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setAdminView('downloads')}
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
              adminView === 'downloads'
                ? 'bg-blue-600 text-white'
                : 'border border-slate-700 bg-slate-900 text-slate-300'
            }`}
          >
            XML Downloads
          </button>
          <button
            type="button"
            onClick={() => setAdminView('support')}
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
              adminView === 'support'
                ? 'bg-blue-600 text-white'
                : 'border border-slate-700 bg-slate-900 text-slate-300'
            }`}
          >
            Support Replies
          </button>
        </div>

        {adminView === 'support' ? (
          <AdminSupportPortal currentUser={currentUser} />
        ) : (
          <>
        <section className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-blue-300">
              <Shield className="w-3 h-3" />
              Admin mode
            </p>
            <h2 className="mt-3 text-2xl sm:text-3xl font-bold text-white">Users and XML downloads</h2>
            <p className="mt-1 text-sm text-slate-400">
              Admins can review customer accounts and the XML downloads saved to each account.
            </p>
          </div>
          <button
            type="button"
            onClick={loadAdminSummaries}
            disabled={adminLoading}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${adminLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <Users className="w-4 h-4 text-blue-400 mb-3" />
            <p className="text-2xl font-bold text-white">{totalUsers}</p>
            <p className="text-xs text-slate-500">Users</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <FileDown className="w-4 h-4 text-emerald-400 mb-3" />
            <p className="text-2xl font-bold text-white">{totalDownloads}</p>
            <p className="text-xs text-slate-500">XML downloads</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <CalendarClock className="w-4 h-4 text-amber-300 mb-3" />
            <p className="text-2xl font-bold text-white">{activeDownloadUsers}</p>
            <p className="text-xs text-slate-500">Users with downloads</p>
          </div>
        </section>

        {adminError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {adminError}
          </div>
        )}

        <section className="rounded-xl border border-slate-800 bg-slate-950/70 overflow-hidden">
          <div className="border-b border-slate-800 px-4 py-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-100">Customer accounts</h3>
            <span className="text-[10px] font-mono text-slate-500">{adminLoading ? 'Loading...' : `${totalUsers} listed`}</span>
          </div>

          {adminLoading && adminSummaries.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-400">
              Loading user download activity...
            </div>
          ) : adminSummaries.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-400">
              No users found.
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {adminSummaries.map((summary) => (
                <article key={summary.userId} className="grid grid-cols-1 lg:grid-cols-[1fr_160px_240px] gap-3 px-4 py-4 hover:bg-slate-900/60 transition">
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-white truncate">{summary.displayName || 'Unknown user'}</h4>
                    <p className="text-xs text-slate-400 truncate">{summary.email || 'No email stored'}</p>
                    <p className="mt-1 text-[10px] font-mono text-slate-600 truncate">UID: {summary.userId}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500">XML downloads</p>
                    <p className="text-lg font-bold text-blue-300">{summary.downloadCount}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Last XML download</p>
                    <p className="text-xs font-semibold text-slate-300">{formatAdminDate(summary.lastDownloadAt)}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
          </>
        )}
      </main>

      {userProfile && (
        <ProfileModal
          isOpen={isProfileOpen}
          onClose={() => setIsProfileOpen(false)}
          currentUser={currentUser}
          userProfile={userProfile}
          onProfileUpdated={(updated) => setUserProfile(updated)}
          isAdmin={true}
          onOpenAdminPortal={() => setShowAdminPortal(true)}
          onOpenSupport={() => setIsSupportOpen(true)}
        />
      )}
      <SupportTicketsModal
        isOpen={isSupportOpen}
        onClose={() => setIsSupportOpen(false)}
        currentUser={currentUser}
      />
    </div>
  );
}
