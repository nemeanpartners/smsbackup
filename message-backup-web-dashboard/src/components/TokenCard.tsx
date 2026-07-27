import { useState } from 'react';
import { UserConfig } from '../types';
import { rotateApiToken } from '../services/dbService';
import { Copy, Check, RotateCw, Terminal, ArrowUpRight, Cpu } from 'lucide-react';

interface TokenCardProps {
  userProfile: UserConfig;
  onProfileUpdated: (updatedProfile: UserConfig) => void;
}

export function TokenCard({ userProfile, onProfileUpdated }: TokenCardProps) {
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(userProfile.apiToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRotate = async () => {
    if (!confirm('Are you sure you want to rotate your API connection token? Your current macOS desktop client backups will stop syncing until you paste the new token.')) {
      return;
    }
    setRotating(true);
    try {
      const newToken = await rotateApiToken(userProfile.userId, userProfile);
      onProfileUpdated({
        ...userProfile,
        apiToken: newToken
      });
    } catch (err) {
      console.error('Failed to rotate api token', err);
    } finally {
      setRotating(false);
    }
  };

  return (
    <div id="connection-manager" className="bg-[#161f30]/60 border border-slate-800/80 rounded-xl p-6 mb-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5 mb-5">
        <div>
          <h2 className="text-lg font-display font-semibold text-slate-100 flex items-center gap-2">
            <Cpu className="w-5 h-5 text-blue-400" />
            macOS Desktop Client Connection
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Authorize your "Message Backup" MacBook application to synchronize database updates to the web dashboard.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex h-2.5 w-2.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-65"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <span className="text-xs text-emerald-400 font-mono">Receiver Standby</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">Secret Connection Token</label>
          <div className="flex items-center gap-2 bg-[#0d1321] p-3 rounded-lg border border-slate-800 font-mono text-sm text-slate-200">
            <span className="truncate select-all">{userProfile.apiToken}</span>
            <div className="flex items-center gap-1.5 ml-auto pl-2">
              <button
                id="copy-token-btn"
                onClick={handleCopy}
                className="p-1.5 hover:bg-slate-800 rounded transition text-slate-400 hover:text-slate-200"
                title="Copy token"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </button>
              <button
                id="rotate-token-btn"
                onClick={handleRotate}
                disabled={rotating}
                className="p-1.5 hover:bg-slate-800 rounded transition text-slate-400 hover:text-slate-200 disabled:opacity-50"
                title="Rotate token"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Keep this token confidential. It allows secure writing of backups to your custom profile area.
          </p>
          
          <div className="mt-5 space-y-3">
            <h4 className="text-xs font-semibold text-slate-300">macOS Desktop App Instructions</h4>
            <div className="space-y-2 text-xs text-slate-400 leading-relaxed">
              <p className="flex gap-2">
                <span className="w-4 h-4 bg-blue-600/10 text-blue-400 font-mono rounded flex items-center justify-center font-bold text-[10px]">1</span>
                <span>Open the **Message Backup.app** on your Mac.</span>
              </p>
              <p className="flex gap-2">
                <span className="w-4 h-4 bg-blue-600/10 text-blue-400 font-mono rounded flex items-center justify-center font-bold text-[10px]">2</span>
                <span>Click the system tray icon and open **Settings**.</span>
              </p>
              <p className="flex gap-2">
                <span className="w-4 h-4 bg-blue-600/10 text-blue-400 font-mono rounded flex items-center justify-center font-bold text-[10px]">3</span>
                <span>Paste the Secret Token above and select the backup source (`chat.db`).</span>
              </p>
            </div>
          </div>
        </div>

        <div className="bg-[#0b0f19] rounded-xl p-4 border border-slate-800/60 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <span className="text-xs font-mono text-blue-400 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5" /> macOS CLI CLI Config Daemon
            </span>
            <span className="text-[10px] text-slate-500 uppercase font-mono">v1.4.2</span>
          </div>

          <div className="font-mono text-slate-300 text-[11px] p-2.5 bg-[#070b13] rounded border border-slate-900/85 my-4 space-y-1.5 leading-relaxed overflow-x-auto whitespace-pre">
            <div><span className="text-slate-600"># 1. Install backup binary</span></div>
            <div>curl -fsSL https://backup.messagebackup.app/mac/install.sh | sh</div>
            <div className="pt-2"><span className="text-slate-600"># 2. Configure background runner daemon</span></div>
            <div>messagebackup --token <span className="text-blue-400 select-all">{userProfile.apiToken.substring(0, 15)}...</span> --daemon --sync-interval 4h</div>
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-slate-900/60 text-xs">
            <span className="text-slate-500">Need binary packages folder?</span>
            <a 
              href="#downloads" 
              className="text-blue-400 hover:underline flex items-center gap-0.5 font-medium"
              onClick={(e) => {
                e.preventDefault();
                alert("The 'Message Backup' binary executables and packaging installer is simulated! You can run the live network simulation to experience database updates.");
              }}
            >
              Get Installer Packages <ArrowUpRight className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
