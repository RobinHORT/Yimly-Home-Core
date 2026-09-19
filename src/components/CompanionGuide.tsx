import React, { useState } from 'react';
import {
  Smartphone,
  CheckCircle2,
  Copy,
  Check,
  Wifi,
  Cloud,
  Shield,
  ArrowRight,
  ExternalLink,
  Layers,
} from 'lucide-react';

interface CompanionGuideProps {
  companionUrl: string;
  haVersion: string;
}

export const CompanionGuide: React.FC<CompanionGuideProps> = ({
  companionUrl,
  haVersion,
}) => {
  const [copied, setCopied] = useState(false);

  const serverUrl = companionUrl || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');

  const copyToClipboard = () => {
    navigator.clipboard.writeText(serverUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Title */}
      <div className="bg-[#161922] p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#FF4FA3]/15 border border-[#FF4FA3]/30 text-[#FF4FA3] flex items-center justify-center font-bold">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Official Home Assistant Companion App Setup
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Connect the official iOS / Android Home Assistant Companion App directly to this real server.
            </p>
          </div>
        </div>
      </div>

      {/* Connection Details Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#161922] p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <Wifi className="w-4 h-4 text-[#FF4FA3]" /> Server Address
          </h3>

          <p className="text-xs text-slate-400">
            Enter this URL in the official Home Assistant app when prompted for your server address:
          </p>

          <div className="flex items-center gap-2 bg-slate-900 p-3 rounded-xl border border-slate-800">
            <code className="text-xs text-[#FF4FA3] font-mono flex-1 truncate">{serverUrl}</code>
            <button
              id="copy-server-url-btn"
              onClick={copyToClipboard}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition flex items-center gap-1 shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          <div className="pt-2 text-xs text-slate-400 space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Direct connection to real Home Assistant Core v{haVersion || '2023.7.3'}</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Supports background GPS location updates via real Webhooks</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Full battery, geocoded location, and sensor tracking</span>
            </div>
          </div>
        </div>

        {/* Step-by-Step Instructions */}
        <div className="bg-[#161922] p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" /> Connection Workflow
          </h3>

          <div className="space-y-3 text-xs text-slate-300">
            <div className="flex items-start gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800/80">
              <span className="w-6 h-6 rounded-full bg-[#FF4FA3]/20 text-[#FF4FA3] font-bold flex items-center justify-center shrink-0">
                1
              </span>
              <div>
                <p className="font-semibold text-white">Download Official App</p>
                <p className="text-slate-400 mt-0.5">
                  Install "Home Assistant" from the iOS App Store or Google Play Store.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800/80">
              <span className="w-6 h-6 rounded-full bg-[#FF4FA3]/20 text-[#FF4FA3] font-bold flex items-center justify-center shrink-0">
                2
              </span>
              <div>
                <p className="font-semibold text-white">Enter Server URL</p>
                <p className="text-slate-400 mt-0.5">
                  Paste <code className="text-[#FF4FA3] font-mono">{serverUrl}</code> and tap Connect.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800/80">
              <span className="w-6 h-6 rounded-full bg-[#FF4FA3]/20 text-[#FF4FA3] font-bold flex items-center justify-center shrink-0">
                3
              </span>
              <div>
                <p className="font-semibold text-white">Enable Location Permission</p>
                <p className="text-slate-400 mt-0.5">
                  Select "Always Allow" in iOS/Android settings for high-accuracy live tracking.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
