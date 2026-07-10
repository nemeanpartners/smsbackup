import React, { useState } from 'react';
import { User, deleteUser, signOut } from 'firebase/auth';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { deleteUserAccountData } from '../services/dbService';
import { UserConfig } from '../types';
import { 
  X, 
  User as UserIcon, 
  Mail, 
  Trash2, 
  Key, 
  Calendar, 
  Shield, 
  AlertTriangle, 
  Check, 
  Smartphone, 
  Sparkles,
  Edit2,
  Save,
  LogOut,
  RefreshCw
} from 'lucide-react';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  userProfile: UserConfig;
  onProfileUpdated: (updated: UserConfig) => void;
  isAdmin: boolean;
}

export function ProfileModal({ 
  isOpen, 
  onClose, 
  currentUser, 
  userProfile, 
  onProfileUpdated,
  isAdmin 
}: ProfileModalProps) {
  const [displayName, setDisplayName] = useState(userProfile.displayName || '');
  const [isEditingName, setIsEditingName] = useState(false);
  const [updatingName, setUpdatingName] = useState(false);
  
  // Account Deletion States
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  if (!isOpen) return null;

  const handleUpdateName = async () => {
    if (!displayName.trim()) return;
    setUpdatingName(true);
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, {
        displayName: displayName.trim(),
        updatedAt: serverTimestamp()
      });
      onProfileUpdated({
        ...userProfile,
        displayName: displayName.trim()
      });
      setIsEditingName(false);
    } catch (err: any) {
      console.error('Failed to update display name', err);
    } finally {
      setUpdatingName(false);
    }
  };

  const isGuest = currentUser.isAnonymous || currentUser.uid === 'offline-guest';

  const handleConfirmDeleteAccount = async () => {
    if (isGuest) {
      setDeleteError('Guest users cannot delete accounts.');
      return;
    }

    if (deleteConfirmationText !== 'DELETE') {
      setDeleteError('Please type "DELETE" to confirm.');
      return;
    }

    setDeletingAccount(true);
    setDeleteError('');
    try {
      // 1. Delete all Firestore records belonging to this user
      await deleteUserAccountData(currentUser.uid);
      
      // 2. Delete Auth User from Firebase
      await deleteUser(currentUser);
      
      // 3. Complete Sign Out
      await signOut(auth);
      
      onClose();
    } catch (err: any) {
      console.error('Failed to delete account', err);
      if (err.code === 'auth/requires-recent-login') {
        setDeleteError('Authentication credentials expired. Please sign out, log back in, and try again to delete your credentials permanently.');
      } else {
        setDeleteError(err.message || 'An error occurred while deleting your account.');
      }
    } finally {
      setDeletingAccount(false);
    }
  };

  const accountType = isGuest 
    ? 'guest' 
    : currentUser.providerData[0]?.providerId === 'google.com'
      ? 'google'
      : 'email/password';

  const modalBg = isAdmin ? 'bg-[#161f30]' : 'bg-white';
  const textPrimary = isAdmin ? 'text-slate-100' : 'text-slate-800';
  const textSecondary = isAdmin ? 'text-slate-400' : 'text-slate-500';
  const borderCol = isAdmin ? 'border-slate-800' : 'border-slate-100';
  const cardBg = isAdmin ? 'bg-[#0d1321]' : 'bg-slate-50';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => {
          if (!deletingAccount) onClose();
        }}
      />

      {/* Modal Container */}
      <div className={`w-full max-w-lg ${modalBg} border ${borderCol} rounded-2xl shadow-2xl relative z-10 overflow-hidden transform transition-all animate-in fade-in-50 duration-200`}>
        
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${borderCol}`}>
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-lg ${isAdmin ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
              <UserIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className={`font-semibold ${textPrimary} text-lg`}>Account Profile</h2>
            </div>
          </div>
          <button 
            onClick={onClose}
            className={`p-1.5 rounded-lg hover:bg-slate-500/10 ${textSecondary} transition`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          
          {/* Main User Card */}
          <div className={`p-5 rounded-xl ${cardBg} border ${borderCol} flex flex-col items-center text-center relative`}>
            {currentUser.isAnonymous && (
              <span className="absolute top-3 right-3 px-2 py-0.5 text-[9px] font-bold tracking-wider uppercase font-mono bg-amber-500/15 text-amber-500 border border-amber-500/20 rounded-full flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" /> Guest Mode
              </span>
            )}
            
            {userProfile.photoURL ? (
              <img 
                src={userProfile.photoURL} 
                alt="Profile Avatar" 
                referrerPolicy="no-referrer"
                className="w-20 h-20 rounded-full border-4 border-white shadow-md mb-3"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-blue-500/10 text-blue-500 border-4 border-slate-700 flex items-center justify-center text-3xl font-black mb-3 select-none">
                {displayName ? displayName.substring(0, 1).toUpperCase() : 'G'}
              </div>
            )}

            {/* Editable Name */}
            <div className="w-full flex justify-center items-center gap-2 mb-1">
              {isEditingName ? (
                <div className="flex items-center gap-1.5 w-full max-w-xs">
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="flex-1 bg-black/20 border border-slate-600 rounded-lg px-3 py-1 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                    placeholder="E.g. Steve J."
                    autoFocus
                  />
                  <button 
                    onClick={handleUpdateName}
                    disabled={updatingName}
                    className="p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition"
                  >
                    {updatingName ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  </button>
                </div>
              ) : (
                <>
                  <h3 className={`text-xl font-bold ${textPrimary}`}>{userProfile.displayName || 'Guest User'}</h3>
                  <button 
                    onClick={() => setIsEditingName(true)}
                    className={`p-1 rounded hover:bg-slate-500/10 ${textSecondary} transition`}
                    title="Edit Name"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>

            <p className={`text-sm ${textSecondary} font-mono mb-4`}>{userProfile.email || 'anonymous-session@backup.local'}</p>

            <div className="w-full grid grid-cols-2 gap-3 text-left border-t border-slate-500/10 pt-4">
              <div>
                <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 font-mono block">Signed In With</span>
                <span className={`text-xs font-semibold ${textPrimary}`}>{accountType}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 font-mono block">User Role</span>
                <span className={`text-xs font-semibold ${isAdmin ? 'text-blue-400' : 'text-slate-400'}`}>
                  {isAdmin ? 'System Administrator' : 'Normal Customer'}
                </span>
              </div>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="border border-red-500/20 bg-red-500/5 rounded-xl p-5 space-y-3">
            <h4 className="text-sm font-bold text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Account Security Danger Zone
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              if you delete you account  this will lead to your existing account data to be deleted permanently. This action cannot be undone.
            </p>

            {isGuest ? (
              <p className="text-xs text-amber-500 font-medium">
                Guest users cannot delete their account as its a guest.
              </p>
            ) : showDeleteConfirm ? (
              <div className="space-y-3 bg-red-950/20 border border-red-500/30 rounded-lg p-4 animate-in slide-in-from-top-2 duration-150">
                <p className="text-xs text-red-300 font-bold">
                  Are you absolutely sure? This will immediately purge your entire backup record history.
                </p>
                <div>
                  <label className="block text-[10px] font-mono text-red-400 mb-1 uppercase tracking-wider">
                    Type <span className="font-extrabold text-white bg-red-800 px-1 py-0.5 rounded">DELETE</span> to proceed
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmationText}
                    onChange={(e) => setDeleteConfirmationText(e.target.value)}
                    className="w-full bg-black/40 border border-red-500/30 text-white font-mono rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500"
                    placeholder="E.g. DELETE"
                  />
                </div>

                {deleteError && (
                  <p className="text-xs text-red-400 font-semibold">{deleteError}</p>
                )}

                <div className="flex gap-2.5 pt-1.5">
                  <button
                    onClick={handleConfirmDeleteAccount}
                    disabled={deletingAccount}
                    className="flex-1 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                  >
                    {deletingAccount ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    Confirm Delete Account & All Backups
                  </button>
                  <button
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      setDeleteConfirmationText('');
                      setDeleteError('');
                    }}
                    disabled={deletingAccount}
                    className="px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full sm:w-auto bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/35 text-xs font-bold py-2 px-4 rounded-lg transition flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete My Account Permanently
              </button>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className={`px-6 py-4 bg-slate-500/5 border-t ${borderCol} flex justify-between items-center`}>
          <button
            onClick={async () => {
              onClose();
              await signOut(auth);
            }}
            className="text-xs font-bold text-slate-500 hover:text-red-400 transition flex items-center gap-1"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </button>
          <button
            onClick={onClose}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition ${
              isAdmin 
                ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' 
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            Close Dashboard
          </button>
        </div>

      </div>
    </div>
  );
}
