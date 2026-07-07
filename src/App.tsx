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
import { Shield, LogOut, CheckCircle, Smartphone, RefreshCw, AlertTriangle } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserConfig | null>(null);
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [selectedBackupId, setSelectedBackupId] = useState<string | null>(null);
  
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [connectionVerified, setConnectionVerified] = useState<boolean | null>(null);

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
  }, []);

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
      await signOut(auth);
    } catch (err) {
      console.error('Sign Out failed', err);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0b0f19] flex flex-col items-center justify-center p-4">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mb-3" />
        <p className="text-slate-400 font-mono text-xs">Synchronizing vault secrets...</p>
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
      />
    );
  }

  const isAdmin = currentUser.email === 'christinalucas1216@gmail.com';

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-white border border-slate-200 shadow-xl rounded-2xl p-8 max-w-sm w-full">
          {userProfile && (
            <div className="flex flex-col items-center mb-6">
              {userProfile.photoURL ? (
                <img 
                  src={userProfile.photoURL} 
                  alt="avatar" 
                  referrerPolicy="no-referrer"
                  className="w-20 h-20 rounded-full border-4 border-white shadow-lg mb-4" 
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-blue-50 border-4 border-white shadow-lg text-blue-600 flex items-center justify-center text-3xl font-bold mb-4">
                  {userProfile.displayName ? userProfile.displayName.substring(0, 1).toUpperCase() : 'M'}
                </div>
              )}
              <h2 className="text-xl font-bold text-slate-800">{userProfile.displayName || 'Customer'}</h2>
              <p className="text-sm text-slate-500 font-mono">{userProfile.email}</p>
            </div>
          )}
          
          <div className="bg-blue-50 text-blue-800 text-sm font-medium rounded-lg px-4 py-3 mb-8 flex items-center justify-center gap-2">
            <CheckCircle className="w-5 h-5 text-blue-600" />
            You have logged into the app portal.
          </div>
          
          <button
            onClick={handleLogout}
            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 px-4 rounded-xl transition flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
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
              <div className="text-right hidden md:block">
                <div className="text-xs font-semibold text-slate-200">{userProfile.displayName}</div>
                <div className="text-[9px] text-slate-500 font-mono">{userProfile.email}</div>
              </div>
              
              {userProfile.photoURL ? (
                <img 
                  src={userProfile.photoURL} 
                  alt="avatar" 
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-full border border-slate-700 select-none pointer-events-none" 
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-blue-600/15 border border-blue-500/30 text-blue-400 flex items-center justify-center text-xs font-bold leading-none select-none pointer-events-none">
                  {userProfile.displayName ? userProfile.displayName.substring(0, 1).toUpperCase() : 'M'}
                </div>
              )}

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

        {/* Access tokens and instructions */}
        {userProfile && (
          <TokenCard
            userProfile={userProfile}
            onProfileUpdated={(updated) => setUserProfile(updated)}
          />
        )}

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

      {/* FOOTER */}
      <footer className="py-6 border-t border-slate-900 border-opacity-65 text-center text-xs text-slate-500">
        <p>© 2026 Message Backup macOS System. Synchronized with Google Firestore Database.</p>
      </footer>
    </div>
  );
}
