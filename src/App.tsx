import { useState, useEffect } from 'react';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { doc, getDocFromServer } from 'firebase/firestore';
import { auth, db } from './firebase';
import { ensureUserProfile, fetchUserBackups } from './services/dbService';
import { UserConfig, BackupRecord } from './types';
import { LoginGate } from './components/LoginGate';
import { StatsRow } from './components/StatsRow';
import { TokenCard } from './components/TokenCard';
import { BackupGrid } from './components/BackupGrid';
import { ChatExplorer } from './components/ChatExplorer';
import { ProfileModal } from './components/ProfileModal';
import DesktopAppLauncher from './components/DesktopAppLauncher';
import { Shield, LogOut, CheckCircle, Smartphone, RefreshCw, AlertTriangle, User as UserIcon } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserConfig | null>(null);
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [selectedBackupId, setSelectedBackupId] = useState<string | null>(null);
  
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [connectionVerified, setConnectionVerified] = useState<boolean | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
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
        setBackups([]);
        setSelectedBackupId(null);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, [isOfflineSandbox]);

  // 3. Load / Refresh backup logs
  const loadBackups = async (uid: string, isAdmin: boolean) => {
    setDataLoading(true);
    try {
      const records = await fetchUserBackups(uid, isAdmin);
      setBackups(records);
      if (records.length > 0 && !selectedBackupId) {
        setSelectedBackupId(records[0].backupId);
      }
    } catch (err) {
      console.error('Failed to load backup logs', err);
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      const isAdminUser = currentUser.email === 'christinalucas1216@gmail.com';
      if (isAdminUser) {
        loadBackups(currentUser.uid, isAdminUser);
      }
    }
  }, [currentUser]);

  const handleLogout = async () => {
    try {
      if (isOfflineSandbox) {
        setIsOfflineSandbox(false);
        localStorage.removeItem('is_offline_sandbox');
        setCurrentUser(null);
        setUserProfile(null);
        setBackups([]);
        setSelectedBackupId(null);
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

  if (isDesktopLoginPopup && currentUser) {
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
            isAdmin={false}
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

  const isAdmin = currentUser.email === 'christinalucas1216@gmail.com';

  if (!isAdmin) {
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
            isAdmin={false}
          />
        )}
      </div>
    );
  }

  return (
    <div id="dashboard-root" className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col font-sans selection:bg-blue-600/30">
      
      {/* HEADER SECTION */}
      <header id="main-header" className="bg-[#111827]/80 sticky top-0 z-40 border-b border-slate-800/80 backdrop-blur-md px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600/10 border border-blue-500/20 rounded-lg flex items-center justify-center">
            <Shield className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="font-display font-bold text-slate-100 tracking-tight text-sm sm:text-base leading-none">
              Client Control Portal
            </h1>
            <p className="text-[10px] text-slate-500 font-mono mt-0.5">
              MESSAGE BACKUP SYSTEM
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Firestore Connection status */}
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

          {/* Logged in accounts badge */}
          {userProfile && (
            <div id="user-badge" className="flex items-center gap-2.5">
              <div 
                className="text-right hidden md:block cursor-pointer select-none hover:opacity-80 transition"
                onClick={() => setIsProfileOpen(true)}
                title="View Profile Settings"
              >
                <div className="text-xs font-semibold text-slate-200">{userProfile.displayName}</div>
                <div className="text-[9px] text-slate-500 font-mono">{userProfile.email}</div>
              </div>
              
              <div 
                className="cursor-pointer hover:opacity-80 transition"
                onClick={() => setIsProfileOpen(true)}
                title="View Profile Settings"
              >
                {userProfile.photoURL ? (
                  <img 
                    src={userProfile.photoURL} 
                    alt="avatar" 
                    referrerPolicy="no-referrer"
                    className="w-8 h-8 rounded-full border border-slate-700 select-none" 
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-blue-600/15 border border-blue-500/30 text-blue-400 flex items-center justify-center text-xs font-bold leading-none select-none">
                    {userProfile.displayName ? userProfile.displayName.substring(0, 1).toUpperCase() : 'M'}
                  </div>
                )}
              </div>

              <button
                id="profile-btn"
                onClick={() => setIsProfileOpen(true)}
                className="p-2 hover:bg-slate-800 text-slate-400 hover:text-blue-400 rounded-lg transition"
                title="Account Profile & Settings"
              >
                <UserIcon className="w-4 h-4" />
              </button>

              <button
                id="logout-btn"
                onClick={handleLogout}
                className="p-2 hover:bg-slate-800 text-slate-400 hover:text-red-400 rounded-lg transition"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* INNER CONTENT AREA */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        
        {/* Connection Diagnostics Warning */}
        {connectionVerified === false && (
          <div className="bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs p-3.5 rounded-xl flex items-center gap-2.5 font-mono">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>Warning: Connection verification suggests your instance may be offline. Please verify Firebase project allocation state.</span>
          </div>
        )}

        {/* Dynamic analytics counts */}
        <StatsRow 
          backups={backups} 
        />

        {/* Backups registry row */}
        <BackupGrid
          userId={currentUser.uid}
          backups={backups}
          onRefresh={() => loadBackups(currentUser.uid, isAdmin)}
          onSelectBackup={(bId) => setSelectedBackupId(bId)}
          selectedBackupId={selectedBackupId}
          isAdmin={isAdmin}
        />

        {/* Messages archive browser */}
        <ChatExplorer
          userId={currentUser.uid}
          backupId={selectedBackupId}
          isAdmin={isAdmin}
        />

      </main>

      {userProfile && (
        <ProfileModal
          isOpen={isProfileOpen}
          onClose={() => setIsProfileOpen(false)}
          currentUser={currentUser}
          userProfile={userProfile}
          onProfileUpdated={(updated) => setUserProfile(updated)}
          isAdmin={true}
        />
      )}

      {/* FOOTER */}
      <footer className="py-6 border-t border-slate-900 border-opacity-65 text-center text-xs text-slate-500">
        <p>© 2026 Message Backup macOS System. Synchronized with Google Firestore Database.</p>
      </footer>
    </div>
  );
}
