import { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '../firebase';
import { fetchUserDownloads } from '../services/dbService';
import { DownloadRecord } from '../types';
import { RefreshCw } from 'lucide-react';

function formatDownloadDate(isoString: string) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString || 'Unknown date';
  }

  return date.toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

export default function DownloadsPanel() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [downloadsLoading, setDownloadsLoading] = useState(false);
  const [downloads, setDownloads] = useState<DownloadRecord[]>([]);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setDownloads([]);
      setErrorMessage('');
      return;
    }

    let cancelled = false;

    async function loadDownloads() {
      setDownloadsLoading(true);
      setErrorMessage('');

      try {
        const records = await fetchUserDownloads(currentUser.uid);
        if (!cancelled) {
          setDownloads(records);
        }
      } catch (error) {
        console.error('Failed to load downloads', error);
        if (!cancelled) {
          setDownloads([]);
          setErrorMessage('Could not load downloads. Try signing in again.');
        }
      } finally {
        if (!cancelled) {
          setDownloadsLoading(false);
        }
      }
    }

    void loadDownloads();

    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0b0f19] flex flex-col items-center justify-center p-6">
        <RefreshCw className="w-7 h-7 text-blue-400 animate-spin mb-3" />
        <p className="text-slate-400 text-sm">Loading downloads…</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#0b0f19] p-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-100">Downloads</h1>
          <p className="text-sm text-slate-400 mt-2">
            Your locally saved conversation XML exports from this Mac.
          </p>
        </header>
        <div className="rounded-2xl border border-slate-800 bg-[#0c1228]/95 px-5 py-4 text-sm text-slate-400">
          Sign in to view your downloads.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0f19] p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-100">Downloads</h1>
        <p className="text-sm text-slate-400 mt-2">
          Your locally saved conversation XML exports from this Mac.
        </p>
      </header>

      {downloadsLoading ? (
        <div className="rounded-2xl border border-slate-800 bg-[#0c1228]/95 px-5 py-4 text-sm text-slate-400">
          Loading downloads…
        </div>
      ) : errorMessage ? (
        <div className="rounded-2xl border border-slate-800 bg-[#0c1228]/95 px-5 py-4 text-sm text-slate-400">
          {errorMessage}
        </div>
      ) : downloads.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-[#0c1228]/95 px-5 py-4 text-sm text-slate-400">
          No downloads yet. Export a conversation from Setup &amp; backup to see it here.
        </div>
      ) : (
        <div className="space-y-3">
          {downloads.map((item) => (
            <article
              key={item.downloadId}
              className="rounded-2xl border border-slate-800/80 bg-[#0c1228]/95 px-5 py-4"
            >
              <h2 className="text-base font-semibold text-slate-100 break-all">
                {item.fileName || 'conversation.xml'}
              </h2>
              <div className="mt-3 space-y-1.5 text-sm text-slate-300">
                <div>
                  <span className="text-slate-500">Date &amp; time:</span>{' '}
                  {formatDownloadDate(item.savedAt)}
                </div>
                <div>
                  <span className="text-slate-500">Download ID:</span>{' '}
                  {item.downloadId || '—'}
                </div>
                <div>
                  <span className="text-slate-500">Your number:</span>{' '}
                  {item.userNumber || '—'}
                </div>
                <div>
                  <span className="text-slate-500">Contact number:</span>{' '}
                  {item.contactNumber || '—'}
                </div>
                <div>
                  <span className="text-slate-500">Messages:</span>{' '}
                  {item.messageCount || '—'}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
