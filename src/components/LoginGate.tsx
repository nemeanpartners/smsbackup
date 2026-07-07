import React, { useState } from 'react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile 
} from 'firebase/auth';
import { auth } from '../firebase';
import { Shield, Mail, Lock, User, CheckCircle } from 'lucide-react';

interface LoginGateProps {
  onSuccess: () => void;
}

export function LoginGate({ onSuccess }: LoginGateProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [isAdminPortal, setIsAdminPortal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      onSuccess();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed log in with Google provider.');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!email || !password) {
      setError('Please fill in all requested fields.');
      return;
    }
    if (password.length < 6) {
      setError('Password must contain at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(credential.user, {
          displayName: fullName || 'macOS Backup User'
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      onSuccess();
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('Invalid login credentials.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('This email is already registered.');
      } else {
        setError(err.message || 'Authentication error.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="login-panel" className="min-h-screen flex items-center justify-center bg-[#0b0f19] px-4 py-12 relative overflow-hidden">
      {/* Visual background details */}
      <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-blue-900/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-900/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="w-full max-w-md bg-[#161f30]/90 border border-slate-800/80 rounded-2xl p-8 backdrop-blur-md shadow-2xl relative">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 bg-blue-600/15 border border-blue-500/30 rounded-xl flex items-center justify-center mb-4">
            <Shield className="w-7 h-7 text-blue-400" />
          </div>
          <h1 className="font-display text-2xl font-bold text-slate-100 tracking-tight">
            {isAdminPortal ? 'Admin Console' : 'Message Backup'}
          </h1>
          <p className="text-slate-400 text-sm mt-1 text-center">
            {isAdminPortal ? 'System Administration & Monitoring' : 'macOS Desktop Native Companion Panel'}
          </p>
        </div>

        <div className="flex bg-slate-800/50 p-1 rounded-lg mb-6">
          <button
            type="button"
            onClick={() => { setIsAdminPortal(false); setIsSignUp(false); }}
            className={`flex-1 text-sm font-medium py-2 rounded-md transition-all ${
              !isAdminPortal ? 'bg-[#161f30] text-slate-200 shadow-sm border border-slate-700/50' : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            Customer Portal
          </button>
          <button
            type="button"
            onClick={() => { setIsAdminPortal(true); setIsSignUp(false); }}
            className={`flex-1 text-sm font-medium py-2 rounded-md transition-all ${
              isAdminPortal ? 'bg-[#161f30] text-slate-200 shadow-sm border border-slate-700/50' : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            Admin Portal
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs p-3 rounded-lg mb-6 text-center font-mono">
            {error}
          </div>
        )}

        <form onSubmit={handleEmailAuth} className="space-y-4">
          {isSignUp && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Full Name</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
                  <User className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  placeholder="Steve Jobs"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-[#0d1321] border border-slate-700/60 rounded-lg py-2.5 pl-10 pr-4 text-slate-200 text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500/80 group-hover:border-slate-600 transition"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Email Address</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
                <Mail className="w-4 h-4" />
              </span>
              <input
                type="email"
                placeholder="steve@apple.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#0d1321] border border-slate-700/60 rounded-lg py-2.5 pl-10 pr-4 text-slate-200 text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500/80 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Password</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
                <Lock className="w-4 h-4" />
              </span>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#0d1321] border border-slate-700/60 rounded-lg py-2.5 pl-10 pr-4 text-slate-200 text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500/80 transition"
              />
            </div>
          </div>

          <button
            id="auth-submit-btn"
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm py-2.5 rounded-lg focus:outline-none active:scale-[0.98] transition-all disabled:opacity-50 mt-2"
          >
            {loading ? 'Processing...' : isSignUp ? 'Sign Up New Account' : 'Log In to Console'}
          </button>
        </form>

        <div className="relative flex py-4 items-center">
          <div className="border-t border-slate-800 flex-grow"></div>
          <span className="flex-shrink mx-4 text-xs text-slate-500 uppercase font-mono">Or connect with</span>
          <div className="border-t border-slate-800 flex-grow"></div>
        </div>

        <button
          id="google-login-btn"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full bg-[#0d1321] hover:bg-[#121a2e] border border-slate-700/60 hover:border-slate-600 text-slate-200 font-medium text-sm py-2.5 rounded-lg flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
        >
          {/* SVG Google icon */}
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              fill="#EA4335"
              d="M12.24 10.285V14.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.859-3.578-7.859-8s3.53-8 7.859-8c2.46 0 4.105 1.025 5.047 1.926l3.245-3.125C18.252 1.916 15.492 1 12.24 1 6.033 1 1 6.033 1 12.24s5.033 11.24 11.24 11.24c6.478 0 10.793-4.537 10.793-10.98 0-.74-.08-1.302-.176-1.859H12.24z"
            />
          </svg>
          Google Authentication
        </button>

        <div className="mt-6 text-center text-xs">
          <span className="text-slate-500">
            {isSignUp ? 'Already registered on Message Backup?' : "Don't have an account yet?"}
          </span>{' '}
          <button
            id="toggle-auth-mode-btn"
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-blue-400 hover:underline font-medium"
          >
            {isSignUp ? 'Login instead' : 'Signup details'}
          </button>
        </div>

        <div className="mt-8 border-t border-slate-800/80 pt-4 flex items-center gap-2 justify-center text-[11px] text-slate-500">
          <CheckCircle className="w-3.5 h-3.5 text-blue-500" />
          <span>Secured globally by Google Firebase Firestore</span>
        </div>
      </div>
    </div>
  );
}
