import React, { useState, useEffect } from 'react';
import {
  Lock,
  User,
  Key,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  Radio,
  Sparkles,
  Smartphone,
  CheckCircle2,
} from 'lucide-react';
import { hassAuth } from '../services/hassAuth';

interface LoginProps {
  onLoginSuccess: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [authMode, setAuthMode] = useState<'credentials' | 'llat' | 'onboarding'>('credentials');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [longLivedToken, setLongLivedToken] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCheckingOnboarding, setIsCheckingOnboarding] = useState(true);

  useEffect(() => {
    // Check if Home Assistant Core needs initial user onboarding
    const checkHA = async () => {
      try {
        const { needsOnboarding } = await hassAuth.checkOnboardingStatus();
        if (needsOnboarding) {
          setAuthMode('onboarding');
        }
      } catch (e) {
        // Default to credentials mode
      } finally {
        setIsCheckingOnboarding(false);
      }
    };
    checkHA();
  }, []);

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMessage('Please enter both username and password.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const redirectUri = urlParams.get('redirect_uri') || undefined;
      const clientId = urlParams.get('client_id') || undefined;
      const state = urlParams.get('state') || undefined;

      const result = await hassAuth.loginWithCredentials(username.trim(), password, {
        redirectUri,
        clientId,
        state,
      });

      if (result && 'redirected' in result && result.redirected) {
        return; // Redirect handled by browser
      }

      onLoginSuccess();
    } catch (err: any) {
      console.error('[LOGIN ERROR]', err);
      setErrorMessage(
        err.message || 'Authentication failed. Please verify your Home Assistant credentials.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleOnboardingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password || !name.trim()) {
      setErrorMessage('Please fill in all account fields.');
      return;
    }

    if (password.length < 8) {
      setErrorMessage('Password should be at least 8 characters long.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      await hassAuth.createOnboardingUser({
        name: name.trim(),
        username: username.trim(),
        password,
      });
      onLoginSuccess();
    } catch (err: any) {
      console.error('[ONBOARDING ERROR]', err);
      setErrorMessage(
        err.message || 'Failed to create Home Assistant account in HA Core.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleLlatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!longLivedToken.trim()) {
      setErrorMessage('Please provide a valid Long-Lived Access Token.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      await hassAuth.loginWithLongLivedToken(longLivedToken.trim());
      onLoginSuccess();
    } catch (err: any) {
      console.error('[LLAT ERROR]', err);
      setErrorMessage(
        err.message || 'Invalid Long-Lived Access Token. Please verify token permissions.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f1117] text-slate-100 flex flex-col justify-center items-center px-4 sm:px-6 lg:px-8 py-12 relative overflow-hidden">
      {/* Subtle Background Glow Elements */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-[#FF4FA3]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[350px] h-[350px] bg-blue-600/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex relative items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#FF4FA3] to-[#FF75B5] shadow-xl shadow-[#FF4FA3]/25 text-white font-black text-3xl tracking-tight mb-4 border border-[#FF75B5]/30">
            Y
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-[#0f1117]" />
            </span>
          </div>

          <div className="flex items-center justify-center gap-2 mb-1.5">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Yimly <span className="text-[#FF4FA3]">Server</span>
            </h1>
            <span className="px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase rounded-md bg-[#FF4FA3]/15 text-[#FF4FA3] border border-[#FF4FA3]/30">
              HA Core
            </span>
          </div>

          <p className="text-sm text-slate-400 max-w-xs mx-auto">
            {authMode === 'onboarding'
              ? 'Create your native Home Assistant owner account to initialize your server.'
              : 'Sign in with your real Home Assistant Core credentials.'}
          </p>
        </div>

        {/* Card Container */}
        <div className="bg-[#161922] border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 backdrop-blur-xl">
          {/* Auth Method Tabs */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-900/90 rounded-xl mb-6 border border-slate-800/80">
            <button
              type="button"
              id="login-tab-credentials"
              onClick={() => {
                setAuthMode('credentials');
                setErrorMessage(null);
              }}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                authMode === 'credentials'
                  ? 'bg-[#FF4FA3] text-white shadow-sm shadow-[#FF4FA3]/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>HA User Login</span>
            </button>

            <button
              type="button"
              id="login-tab-llat"
              onClick={() => {
                setAuthMode('llat');
                setErrorMessage(null);
              }}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                authMode === 'llat'
                  ? 'bg-[#FF4FA3] text-white shadow-sm shadow-[#FF4FA3]/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Key className="w-3.5 h-3.5" />
              <span>Long-Lived Token</span>
            </button>
          </div>

          {authMode === 'credentials' && isCheckingOnboarding === false && (
            <div className="mb-4 text-center">
              <button
                type="button"
                id="toggle-onboarding-btn"
                onClick={() => {
                  setAuthMode('onboarding');
                  setErrorMessage(null);
                }}
                className="text-xs text-[#FF4FA3] hover:text-[#FF75B5] underline underline-offset-2 transition"
              >
                Need to set up the first Home Assistant owner account? Click here
              </button>
            </div>
          )}

          {authMode === 'onboarding' && (
            <div className="mb-4 text-center">
              <button
                type="button"
                id="toggle-login-btn"
                onClick={() => {
                  setAuthMode('credentials');
                  setErrorMessage(null);
                }}
                className="text-xs text-[#FF4FA3] hover:text-[#FF75B5] underline underline-offset-2 transition"
              >
                Already created an owner account? Click here to log in
              </button>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-400 text-xs leading-relaxed animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Form: Standard Home Assistant Credentials */}
          {authMode === 'credentials' && (
            <form onSubmit={handleCredentialsSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Home Assistant Username
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    id="login-username-input"
                    type="text"
                    required
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. admin or your username"
                    disabled={isLoading}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 focus:border-[#FF4FA3] focus:ring-1 focus:ring-[#FF4FA3] text-sm text-white placeholder-slate-500 transition outline-none disabled:opacity-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="login-password-input"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    disabled={isLoading}
                    className="w-full pl-10 pr-11 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 focus:border-[#FF4FA3] focus:ring-1 focus:ring-[#FF4FA3] text-sm text-white placeholder-slate-500 transition outline-none disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                id="login-submit-btn"
                disabled={isLoading}
                className="w-full mt-2 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-[#FF4FA3] to-[#FF75B5] hover:opacity-95 text-white font-semibold text-sm shadow-lg shadow-[#FF4FA3]/25 transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Authenticating with HA Core...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Sign In to Yimly</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* Form: Initial Onboarding Setup (If fresh HA instance) */}
          {authMode === 'onboarding' && (
            <form onSubmit={handleOnboardingSubmit} className="space-y-4">
              <div className="p-3 rounded-xl bg-[#FF4FA3]/10 border border-[#FF4FA3]/25 mb-4 text-xs text-slate-300">
                <span className="font-semibold text-[#FF4FA3] flex items-center gap-1.5 mb-1">
                  <Sparkles className="w-3.5 h-3.5" /> Initial Home Assistant Setup
                </span>
                Create your primary owner account. This user will be registered in Home Assistant Core's native authentication database.
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Full Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    id="onboarding-name-input"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Alex Smith"
                    disabled={isLoading}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 focus:border-[#FF4FA3] focus:ring-1 focus:ring-[#FF4FA3] text-sm text-white placeholder-slate-500 transition outline-none disabled:opacity-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Username
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    id="onboarding-username-input"
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. admin"
                    disabled={isLoading}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 focus:border-[#FF4FA3] focus:ring-1 focus:ring-[#FF4FA3] text-sm text-white placeholder-slate-500 transition outline-none disabled:opacity-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="onboarding-password-input"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    disabled={isLoading}
                    className="w-full pl-10 pr-11 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 focus:border-[#FF4FA3] focus:ring-1 focus:ring-[#FF4FA3] text-sm text-white placeholder-slate-500 transition outline-none disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                id="onboarding-submit-btn"
                disabled={isLoading}
                className="w-full mt-2 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-[#FF4FA3] to-[#FF75B5] hover:opacity-95 text-white font-semibold text-sm shadow-lg shadow-[#FF4FA3]/25 transition duration-150 disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Creating Account in HA Core...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Create Account & Enter Yimly</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* Form: Long-Lived Access Token */}
          {authMode === 'llat' && (
            <form onSubmit={handleLlatSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  HA Long-Lived Access Token
                </label>
                <div className="relative">
                  <div className="absolute top-3 left-3.5 pointer-events-none text-slate-400">
                    <Key className="w-4 h-4" />
                  </div>
                  <textarea
                    id="login-llat-input"
                    required
                    rows={4}
                    value={longLivedToken}
                    onChange={(e) => setLongLivedToken(e.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    disabled={isLoading}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 focus:border-[#FF4FA3] focus:ring-1 focus:ring-[#FF4FA3] text-xs font-mono text-white placeholder-slate-500 transition outline-none resize-none disabled:opacity-50"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                  Generated in your Home Assistant profile under Long-Lived Access Tokens.
                </p>
              </div>

              <button
                type="submit"
                id="login-llat-submit-btn"
                disabled={isLoading}
                className="w-full mt-2 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-[#FF4FA3] to-[#FF75B5] hover:opacity-95 text-white font-semibold text-sm shadow-lg shadow-[#FF4FA3]/25 transition duration-150 disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Validating Token...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Connect with Token</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* Home Assistant Native Architecture Notice */}
          <div className="mt-6 pt-5 border-t border-slate-800/80 flex items-start gap-2.5 text-slate-400 text-xs leading-relaxed">
            <Smartphone className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
            <span>
              <strong className="text-slate-300 font-semibold">100% Home Assistant Native:</strong> Accounts authenticate against the local Home Assistant Core and are shared with the official iOS & Android Companion App.
            </span>
          </div>
        </div>

        {/* Footer info */}
        <div className="mt-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
          <Radio className="w-3 h-3 text-emerald-400" />
          <span>Connected to local Home Assistant Core 2023.7.3</span>
        </div>
      </div>
    </div>
  );
};
