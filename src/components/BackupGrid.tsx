import React, { useState } from 'react';
import { BackupRecord } from '../types';
import { simulateMacBackupSync, deleteBackupRun } from '../services/dbService';
import { Play, Trash2, Calendar, HardDrive, MessageSquare, Laptop, AlertCircle, RefreshCw } from 'lucide-react';

interface BackupGridProps {
  userId: string;
  backups: BackupRecord[];
  onRefresh: () => void;
  onSelectBackup: (backupId: string) => void;
  selectedBackupId: string | null;
  isAdmin?: boolean;
}

export function BackupGrid({ userId, backups, onRefresh, onSelectBackup, selectedBackupId, isAdmin = false }: BackupGridProps) {
  const [showSimulateModal, setShowSimulateModal] = useState(false);
  const [simulationStatus, setSimulationStatus] = useState('');
  const [simulationPercent, setSimulationPercent] = useState(0);
  const [simDeviceName, setSimDeviceName] = useState('My MacBook Pro M3');
  const [syncing, setSyncing] = useState(false);

  const handleSimulateSync = async () => {
    setSyncing(true);
    setSimulationPercent(0);
    setSimulationStatus('Initializing secure macOS proxy connector...');
    try {
      await simulateMacBackupSync(userId, simDeviceName, (progress) => {
        setSimulationPercent(progress.percent);
        setSimulationStatus(progress.status);
      });
      setTimeout(() => {
        setShowSimulateModal(false);
        setSyncing(false);
        onRefresh();
      }, 1000);
    } catch (err) {
      console.error(err);
      setSimulationStatus('Error occurred while writing to Firestore: ' + String(err));
      setSyncing(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, backupId: string) => {
    e.stopPropagation(); // Avoid selecting backup
    if (!confirm('Are you sure you want to delete this backup from the Cloud? This will permanently erase the backup log.')) {
      return;
    }
    try {
      await deleteBackupRun(userId, backupId);
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const bytesToMB = (bytes: number) => {
    return (bytes / (1024 * 1024)).toFixed(2);
  };

  return (
    <div id="backup-manager" className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-display font-semibold text-slate-100 flex items-center gap-2">
          <Laptop className="w-5 h-5 text-indigo-400" />
          Synchronized MacBook Archives
        </h2>
        <button
          id="open-sync-simulation-btn"
          onClick={() => {
            setSimulationPercent(0);
            setSimulationStatus('');
            setShowSimulateModal(true);
          }}
          className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1.8 rounded-lg flex items-center gap-1.5 transition active:scale-95"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          Simulate macOS Sync
        </button>
      </div>

      {backups.length === 0 ? (
        <div className="bg-[#161f30]/30 border border-slate-800/80 rounded-xl p-8 text-center">
          <AlertCircle className="w-8 h-8 text-slate-500 mx-auto mb-3" />
          <h3 className="text-slate-300 font-medium text-sm">No Backups Found</h3>
          <p className="text-slate-500 text-xs mt-1 max-w-sm mx-auto">
            You don't have any backup entries yet. Run the "Simulate macOS Sync" walkthrough above to populate the database with complete iMessage databases.
          </p>
        </div>
      ) : (
        <div id="backups-grid" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {backups.map((bk) => {
            const isSelected = bk.backupId === selectedBackupId;
            return (
              <div
                id={`backup-${bk.backupId}`}
                key={bk.backupId}
                onClick={() => onSelectBackup(bk.backupId)}
                className={`border rounded-xl p-4 cursor-pointer transition relative group ${
                  isSelected 
                    ? 'bg-blue-600/10 border-blue-500/80 shadow-md' 
                    : 'bg-[#161f30]/40 border-slate-800/80 hover:border-slate-700 hover:bg-[#161f30]/60'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <h3 className="font-semibold text-slate-200 text-sm flex items-center gap-1.5">
                      <Laptop className="w-3.5 h-3.5 text-slate-400 font-sans" />
                      {bk.deviceName}
                    </h3>
                    <p className="text-[10px] font-mono text-slate-500 font-sans">{bk.appVersion}</p>
                    {isAdmin && (
                      <p className="text-[9px] font-mono text-blue-400 mt-1" title={bk.userId}>User: {bk.userId.substring(0, 8)}...</p>
                    )}
                  </div>
                  
                  {/* Status Indicator */}
                  <span className={`text-[10px] font-mono px-1.8 py-0.5 rounded-full ${
                    bk.status === 'completed' 
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : bk.status === 'uploading'
                      ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20 animate-pulse'
                      : 'bg-red-500/10 text-red-500 border border-red-500/20'
                  }`}>
                    {bk.status}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-slate-900/40 text-[11px] text-slate-400">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-slate-500 flex items-center gap-1 font-sans"><MessageSquare className="w-3.5 h-3.5" /> Items</span>
                    <span className="font-semibold text-slate-300 font-sans">{bk.messageCount || 0} msgs</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-slate-500 flex items-center gap-1 font-sans"><HardDrive className="w-3.5 h-3.5" /> Size</span>
                    <span className="font-semibold text-slate-300 font-sans">{bytesToMB(bk.sizeBytes || 0)} MB</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-slate-500 flex items-center gap-1 font-sans"><Calendar className="w-3.5 h-3.5" /> Date</span>
                    <span className="font-semibold text-slate-300 font-sans truncate" title={bk.createdAt}>
                      {bk.createdAt ? bk.createdAt.substring(0, 10) : 'Just Now'}
                    </span>
                  </div>
                </div>

                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition pr-2">
                  <button
                    id={`delete-backup-${bk.backupId}-btn`}
                    onClick={(e) => handleDelete(e, bk.backupId)}
                    className="p-1 text-slate-500 hover:text-red-400 hover:bg-slate-800/80 rounded transition"
                    title="Delete backup"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Sync Interactive Simulator Modal */}
      {showSimulateModal && (
        <div id="sync-modal-dialog" className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[#161f30] border border-slate-800 rounded-xl w-full max-w-lg p-6 shadow-2xl relative">
            <h3 className="font-display font-bold text-lg text-slate-100 flex items-center gap-2">
              <Play className="w-4 h-4 text-blue-400 fill-current" />
              macOS Desktop Backup Simulator
            </h3>
            <p className="text-slate-400 text-xs mt-1">
              Select or type a MacBook device name to simulate an uploaded message DB (`chat.db`) to the Firestore backend.
            </p>

            <div className="mt-5 space-y-4">
              {!syncing ? (
                <>
                  <div>
                    <label className="block text-xs text-slate-400 font-medium mb-1.5">Mac Device Identifier</label>
                    <input
                      type="text"
                      className="w-full bg-[#0d1321] border border-slate-700/80 rounded-lg py-2 px-3 text-slate-200 text-sm focus:outline-none focus:border-blue-500/80 font-sans"
                      placeholder="My MacBook Pro M3"
                      value={simDeviceName}
                      onChange={(e) => setSimDeviceName(e.target.value)}
                    />
                  </div>
                  
                  <div className="bg-blue-600/5 rounded-lg border border-blue-500/10 p-3.5 text-xs text-blue-400/85">
                    Running this simulation will issue actual calls using standard Firestore APIs (`setDoc`/`updateDoc`). It creates:
                    <ul className="list-disc pl-5 mt-1.5 space-y-1">
                      <li>One completed backup entry in collection "backups".</li>
                      <li>Three active chat records (iMessage, SMS, WhatsApp) in collection "chats".</li>
                      <li>Fifteen chat historical messages in collection "messages" supporting real queries.</li>
                    </ul>
                  </div>

                  <div className="flex justify-end gap-3 mt-6 pt-3 border-t border-slate-800/80">
                    <button
                      id="close-simulation-modal-btn"
                      type="button"
                      onClick={() => setShowSimulateModal(false)}
                      className="bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-semibold px-4 py-2 rounded-lg transition"
                    >
                      Cancel
                    </button>
                    <button
                      id="run-simulation-process-btn"
                      onClick={handleSimulateSync}
                      className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition"
                    >
                      Trigger Sync Run
                    </button>
                  </div>
                </>
              ) : (
                <div className="py-8 flex flex-col items-center justify-center">
                  <div className="relative flex items-center justify-center mb-6">
                    <RefreshCw className="w-12 h-12 text-blue-500 animate-spin" />
                    <span className="absolute text-[11px] font-bold text-blue-400 font-mono">
                      {simulationPercent}%
                    </span>
                  </div>
                  
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mb-4">
                    <div 
                      className="bg-blue-500 h-full transition-all duration-350 rounded-full"
                      style={{ width: `${simulationPercent}%` }}
                    />
                  </div>

                  <p className="text-slate-300 font-mono text-xs text-center min-h-[1.5rem]">
                    {simulationStatus}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
