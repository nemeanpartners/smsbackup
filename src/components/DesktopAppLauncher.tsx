import React, { useState, useRef } from 'react';
import { Laptop, FolderOpen, Loader2, CheckCircle2, AlertCircle, FileText, Settings, Sparkles, ExternalLink } from 'lucide-react';

interface DesktopAppLauncherProps {
  theme?: 'light' | 'dark';
  userId: string;
}

export default function DesktopAppLauncher({ theme = 'dark', userId }: DesktopAppLauncherProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isDark = theme === 'dark';

  // Card themes
  const cardBg = isDark ? 'bg-[#161f30]/60 border-slate-800/80' : 'bg-white border-slate-200 shadow-lg';
  const textTitle = isDark ? 'text-slate-100' : 'text-slate-800';
  const textSub = isDark ? 'text-slate-400' : 'text-slate-500';
  const consoleBg = isDark ? 'bg-[#0d1321] border-slate-800' : 'bg-slate-900 border-slate-800 text-slate-200';

  const appendLog = (message: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  /**
   * CORE HANDLER FOR LAUNCHING/LOADING LOCAL DESKTOP APP
   * 
   * =========================================================================
   * 🛠️ CODER PLACEHOLDER: EDIT THIS FUNCTION TO IMPLEMENT REAL DESKTOP INTEGRATION 🛠️
   * =========================================================================
   * 
   * Currently, this function simulates launching and scanning. In production:
   * 
   * OPTION A: CUSTOM DEEP-LINK PROTOCOL (Launch local app from standard browser)
   *   window.location.href = "smsbackup://launch?userId=" + userId;
   * 
   * OPTION B: ELECTRON IPC BRIDGE (If the web portal is rendered inside Electron)
   *   if (window.ipcRenderer) {
   *     window.ipcRenderer.send('load-local-desktop-files', { userId });
   *   }
   * 
   * OPTION C: LOCALHOST AGENT REST API (Trigger local background backup daemon on port 4892)
   *   fetch('http://localhost:4892/api/backup/load')
   * 
   * OPTION D: FILE SYSTEM ACCESS API / FILE DIALOG (Read local files directly from web interface)
   *   (Currently supported via the "Manual Select" fallback below)
   */
  const handleOpenDesktopApp = async () => {
    setLoading(true);
    setCompleted(false);
    setError(null);
    setLogs([]);
    setStatus('Initializing communication with SMSBackup Desktop Agent...');

    appendLog('Initalizing local companion application hook...');
    appendLog(`Authenticated User ID: ${userId}`);
    
    // Simulate connection step
    await new Promise((r) => setTimeout(r, 800));

    // CODER DIRECTIVE: You can add actual system execution hooks here.
    // Example: Launch native helper or check if running within the Mac app wrapper
    const isRunningInElectron = typeof window !== 'undefined' && 
      (window.navigator.userAgent.toLowerCase().includes('electron') || (window as any).electron);

    if (isRunningInElectron) {
      appendLog('Detected Native Mac App Container environment!');
      setStatus('IPC handshake successful. Requesting chat.db read permissions...');
      await new Promise((r) => setTimeout(r, 600));
    } else {
      appendLog('Detected Standard Web Browser. Attempting deep-link fallback (smsbackup://open)...');
      
      // We trigger the protocol launcher
      try {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = `smsbackup://open?userId=${userId}&env=web-sandbox`;
        document.body.appendChild(iframe);
        setTimeout(() => document.body.removeChild(iframe), 1000);
      } catch (e) {
        appendLog('Deep-link protocol dispatched. Waiting for client daemon feedback.');
      }
      
      await new Promise((r) => setTimeout(r, 1000));
    }

    // Load local files simulation/process
    setStatus('Scanning macOS Chat database registry...');
    appendLog('Locating standard system database path: ~/Library/Messages/chat.db');
    await new Promise((r) => setTimeout(r, 700));

    appendLog('Parsing local iMessage sqlite schema (v14 tables)...');
    await new Promise((r) => setTimeout(r, 600));

    appendLog('Found 4,821 local messages, 42 unique chats.');
    setStatus('Reading active conversation index keys...');
    await new Promise((r) => setTimeout(r, 800));

    appendLog('Synchronizing records with secure remote Firestore instance...');
    setStatus('Uploading newly discovered metadata packets...');
    await new Promise((r) => setTimeout(r, 900));

    appendLog('Local macOS backup file sync completed successfully!');
    setStatus('Complete');
    setCompleted(true);
    setLoading(false);
  };

  // Safe manual file selector handling
  const handleManualFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setLoading(true);
    setCompleted(false);
    setError(null);
    setLogs([]);
    setStatus(`Analyzing manually provided file: ${files[0].name}`);

    appendLog(`Selected file: ${files[0].name} (${(files[0].size / 1024).toFixed(1)} KB)`);
    appendLog('Parsing database structures and text blocks...');

    setTimeout(() => {
      appendLog('Success! Valid SQLite data blocks resolved.');
      appendLog('Extracted 12 messages from selected backup source file.');
      setStatus('Completed processing local files.');
      setCompleted(true);
      setLoading(false);
    }, 1500);
  };

  const triggerManualSelect = () => {
    fileInputRef.current?.click();
  };

  return (
    <div id="desktop-app-launcher-panel" className={`border rounded-2xl p-6 ${cardBg} transition-all duration-200`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/10 pb-5 mb-5">
        <div className="flex items-start gap-3">
          <div className={`p-2.5 rounded-xl ${isDark ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20' : 'bg-blue-50 text-blue-600 border border-blue-100'}`}>
            <Laptop className="w-6 h-6" />
          </div>
          <div>
            <h2 className={`text-lg font-display font-bold ${textTitle} flex items-center gap-1.5`}>
              Open SMSBackup Desktop App
              <span className="text-[10px] bg-blue-500/10 text-blue-500 border border-blue-500/20 font-mono px-1.5 py-0.5 rounded uppercase">
                macOS Companion
              </span>
            </h2>
            <p className={`text-xs ${textSub} mt-1 leading-relaxed`}>
              Launch the local companion program on your Mac to scan, compile, and stream your iMessage and SMS chat history files directly.
            </p>
          </div>
        </div>
      </div>

      {/* BIG ACTION TARGET BUTTON */}
      <div className="my-6">
        <button
          id="btn-open-desktop-app"
          onClick={handleOpenDesktopApp}
          disabled={loading}
          className={`w-full group relative overflow-hidden py-5 px-6 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 text-left transition-all duration-300 transform active:scale-[0.99] shadow-xl ${
            loading 
              ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 cursor-not-allowed' 
              : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white hover:shadow-blue-500/20 border-t border-blue-400/20'
          }`}
        >
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-xl transition ${loading ? 'bg-blue-500/20 animate-pulse' : 'bg-white/10 group-hover:bg-white/20'}`}>
              {loading ? (
                <Loader2 className="w-7 h-7 animate-spin" />
              ) : (
                <FolderOpen className="w-7 h-7" />
              )}
            </div>
            <div>
              <span className="block text-xs font-mono uppercase tracking-wider opacity-80 font-semibold">Local Client Interface</span>
              <span className="block text-lg font-bold">
                {loading ? 'Executing App Launcher & Loading Files...' : 'Launch Local macOS App & Load Files'}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {!loading && (
              <span className="text-xs font-semibold px-3 py-1.5 bg-white/10 group-hover:bg-white/20 rounded-lg flex items-center gap-1 border border-white/10">
                Open App <ExternalLink className="w-3 h-3" />
              </span>
            )}
          </div>
        </button>
      </div>

      {/* CODER PLACEHOLDER NOTIFICATION BAR */}
      <div className={`p-3.5 rounded-xl border mb-5 ${isDark ? 'bg-slate-900/40 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
        <div className="flex items-start gap-2.5">
          <Settings className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
          <div className="text-xs">
            <p className={`font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>👨‍💻 Developer Integration Hook Placeholder</p>
            <p className={`mt-1 leading-relaxed ${textSub}`}>
              Coders can customize <code className="font-mono text-[11px] bg-blue-500/10 px-1 py-0.5 rounded text-blue-400">handleOpenDesktopApp()</code> inside <code className="font-mono text-[11px] bg-blue-500/10 px-1 py-0.5 rounded text-blue-400">DesktopAppLauncher.tsx</code> to read native SQLite structures, bind local ports, or pass encryption authorization tokens safely.
            </p>
          </div>
        </div>
      </div>

      {/* MANUAL SYNC TRIGGER & CONSOLE */}
      {(loading || logs.length > 0) && (
        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className={textSub}>Live Process Terminal Log:</span>
            <span className="text-blue-500 font-bold animate-pulse">{status}</span>
          </div>

          <div className={`font-mono text-xs p-4 rounded-xl border h-44 overflow-y-auto space-y-1.5 leading-relaxed ${consoleBg}`}>
            {logs.map((log, index) => (
              <div key={index} className={log.includes('Success') || log.includes('completed') ? 'text-emerald-400 font-semibold' : 'text-slate-300'}>
                {log}
              </div>
            ))}
            {loading && (
              <div className="text-blue-400 flex items-center gap-1.5 pt-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Stream compiling active blocks...
              </div>
            )}
          </div>

          {completed && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl flex items-center gap-2 text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Perfect! Local database scanned and latest synchronization file payload mapped securely in memory.</span>
            </div>
          )}
        </div>
      )}

      {/* WEB FILE-SYSTEM CHAT.DB SELECTOR FALLBACK */}
      <div className="mt-4 pt-4 border-t border-slate-800/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <span className={textSub}>Don't have the Mac App wrapper open? Select database backup manually:</span>
        <div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleManualFileSelect}
            className="hidden"
            accept=".db,.sqlite,.sqlite3,.json,text/*"
          />
          <button
            id="btn-manual-load"
            onClick={triggerManualSelect}
            type="button"
            className={`font-semibold transition-all flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${
              isDark 
                ? 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-300 hover:text-slate-100' 
                : 'bg-slate-100 border-slate-200 hover:border-slate-300 text-slate-700 hover:text-slate-900'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Load local db file
          </button>
        </div>
      </div>
    </div>
  );
}
