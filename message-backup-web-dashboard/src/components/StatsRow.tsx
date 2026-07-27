import { Database, Archive, Layers, HardDrive } from 'lucide-react';
import { BackupRecord } from '../types';

interface StatsRowProps {
  backups: BackupRecord[];
}

export function StatsRow({ backups }: StatsRowProps) {
  const totalBackups = backups.length;
  const completedBackups = backups.filter(b => b.status === 'completed');
  
  const totalMessages = completedBackups.reduce((sum, b) => sum + (b.messageCount || 0), 0);
  const totalChats = completedBackups.reduce((sum, b) => sum + (b.chatCount || 0), 0);
  
  const totalBytes = completedBackups.reduce((sum, b) => sum + (b.sizeBytes || 0), 0);
  const formattedSize = (totalBytes / (1024 * 1024)).toFixed(2); // MB

  return (
    <div id="stats-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div id="stat-backups" className="bg-[#161f30]/60 border border-slate-800/80 rounded-xl p-5 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Sync Packages</span>
          <div className="p-2 bg-blue-600/10 rounded-lg text-blue-400">
            <Archive className="w-4 h-4" />
          </div>
        </div>
        <div className="text-2xl font-bold font-display text-slate-100">{totalBackups}</div>
        <div className="text-xs text-slate-500 mt-1">Total archives uploaded</div>
      </div>

      <div id="stat-messages" className="bg-[#161f30]/60 border border-slate-800/80 rounded-xl p-5 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Total Messages</span>
          <div className="p-2 bg-indigo-600/10 rounded-lg text-indigo-400">
            <Database className="w-4 h-4" />
          </div>
        </div>
        <div className="text-2xl font-bold font-display text-slate-100">{totalMessages.toLocaleString()}</div>
        <div className="text-xs text-slate-500 mt-1">iMessage, SMS, WhatsApp raw items</div>
      </div>

      <div id="stat-threads" className="bg-[#161f30]/60 border border-slate-800/80 rounded-xl p-5 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Chat Threads</span>
          <div className="p-2 bg-emerald-600/10 rounded-lg text-emerald-400">
            <Layers className="w-4 h-4" />
          </div>
        </div>
        <div className="text-2xl font-bold font-display text-slate-100">{totalChats}</div>
        <div className="text-xs text-slate-500 mt-1">Unique contacts or groupings</div>
      </div>

      <div id="stat-size" className="bg-[#161f30]/60 border border-slate-800/80 rounded-xl p-5 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Backup Size</span>
          <div className="p-2 bg-pink-600/10 rounded-lg text-pink-400">
            <HardDrive className="w-4 h-4" />
          </div>
        </div>
        <div className="text-2xl font-bold font-display text-slate-100">{formattedSize} <span className="text-xs font-medium text-slate-400 font-sans">MB</span></div>
        <div className="text-xs text-slate-500 mt-1">Estimated Firestore disk space usage</div>
      </div>
    </div>
  );
}
