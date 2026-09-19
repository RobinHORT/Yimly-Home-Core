import React from 'react';
import {
  MapPin,
  Users,
  Smartphone,
  History,
  HardDrive,
  Activity,
  Radio,
  ShieldCheck,
  RefreshCw,
  LogOut,
  UserCheck,
} from 'lucide-react';

export type TabId = 'map' | 'people' | 'companion' | 'history' | 'registries' | 'diagnostics';

interface NavigationProps {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  isConnected: boolean;
  haVersion: string;
  totalTrackers: number;
  onRefresh: () => void;
  isRefreshing: boolean;
  currentUser?: { name?: string; username?: string | null } | null;
  onLogout?: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  setActiveTab,
  isConnected,
  haVersion,
  totalTrackers,
  onRefresh,
  isRefreshing,
  currentUser,
  onLogout,
}) => {
  const navItems: { id: TabId; label: string; icon: React.ReactNode; badge?: string | number }[] = [
    {
      id: 'map',
      label: 'Live Map',
      icon: <MapPin className="w-5 h-5" />,
      badge: totalTrackers > 0 ? totalTrackers : undefined,
    },
    {
      id: 'people',
      label: 'People & Devices',
      icon: <Users className="w-5 h-5" />,
    },
    {
      id: 'companion',
      label: 'Companion App',
      icon: <Smartphone className="w-5 h-5" />,
    },
    {
      id: 'history',
      label: 'Location History',
      icon: <History className="w-5 h-5" />,
    },
    {
      id: 'registries',
      label: 'HA Registries',
      icon: <HardDrive className="w-5 h-5" />,
    },
    {
      id: 'diagnostics',
      label: 'Server Health',
      icon: <Activity className="w-5 h-5" />,
    },
  ];

  return (
    <header className="sticky top-0 z-40 bg-[#161922]/90 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand & HA Server Status */}
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-[#FF4FA3] to-[#FF75B5] shadow-lg shadow-[#FF4FA3]/20 text-white font-bold text-lg tracking-tight">
              Y
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    isConnected ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-3 w-3 ${
                    isConnected ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight text-white">
                  Yimly <span className="text-[#FF4FA3]">Server</span>
                </span>
                <span className="px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase rounded-md bg-[#FF4FA3]/15 text-[#FF4FA3] border border-[#FF4FA3]/30">
                  HA Core
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <Radio className={`w-3 h-3 ${isConnected ? 'text-emerald-400' : 'text-amber-400'}`} />
                  {isConnected ? `HA Core v${haVersion || '2023.7.3'}` : 'Connecting to Core...'}
                </span>
                <span className="text-slate-600">•</span>
                <span className="hidden sm:inline text-slate-400">Real Python Backend</span>
              </div>
            </div>
          </div>

          {/* Desktop Navigation Tabs */}
          <nav className="hidden md:flex items-center space-x-1">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  id={`nav-tab-${item.id}`}
                  onClick={() => setActiveTab(item.id)}
                  className={`relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all ${
                    active
                      ? 'bg-[#FF4FA3] text-white shadow-md shadow-[#FF4FA3]/25 font-semibold'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {item.badge !== undefined && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                        active ? 'bg-white/20 text-white' : 'bg-[#FF4FA3]/20 text-[#FF4FA3]'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Action Bar & User Profile */}
          <div className="flex items-center gap-2">
            <button
              id="refresh-server-btn"
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Sync with Real Home Assistant Core"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#FF4FA3] ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sync Core</span>
            </button>

            {currentUser && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-800/60 text-slate-300 border border-slate-700/60">
                <UserCheck className="w-3.5 h-3.5 text-[#FF4FA3]" />
                <span className="max-w-[100px] truncate">{currentUser.name || currentUser.username || 'HA User'}</span>
              </div>
            )}

            <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Companion Ready</span>
            </div>

            {onLogout && (
              <button
                id="logout-btn"
                onClick={onLogout}
                title="Log out from Home Assistant"
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 transition"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Log Out</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Navigation Bar */}
        <div className="md:hidden flex items-center justify-between overflow-x-auto py-2.5 border-t border-slate-800/60 gap-1 no-scrollbar">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition shrink-0 ${
                  active
                    ? 'bg-[#FF4FA3] text-white font-semibold shadow-sm shadow-[#FF4FA3]/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
