/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useCallback } from 'react';
import { HassEntity } from './types';
import { hassClient } from './services/hassClient';
import { hassAuth, HassCurrentUser } from './services/hassAuth';
import { Navigation, TabId } from './components/Navigation';
import { MapTracker } from './components/MapTracker';
import { PeopleList } from './components/PeopleList';
import { CompanionGuide } from './components/CompanionGuide';
import { HistoryTimeline } from './components/HistoryTimeline';
import { DeviceRegistry } from './components/DeviceRegistry';
import { ServerDiagnostics } from './components/ServerDiagnostics';
import { Login } from './components/Login';
import { Loader2, Radio } from 'lucide-react';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);
  const [currentUser, setCurrentUser] = useState<HassCurrentUser | null>(null);

  const [activeTab, setActiveTab] = useState<TabId>('map');
  const [entities, setEntities] = useState<Record<string, HassEntity>>({});
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [haVersion, setHaVersion] = useState<string>('2023.7.3');
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // 1. Authenticate check on initial load & refresh
  useEffect(() => {
    let isMounted = true;

    const verifySession = async () => {
      try {
        if (!hassAuth.hasStoredAuth()) {
          if (isMounted) {
            setIsAuthenticated(false);
            setIsCheckingAuth(false);
          }
          return;
        }

        const isValid = await hassAuth.validateCurrentSession();
        if (isMounted) {
          if (isValid) {
            setIsAuthenticated(true);
            setCurrentUser(hassAuth.getCurrentUser());
            hassClient.connect();
            hassClient.fetchStatesRest();
          } else {
            hassAuth.clearTokens();
            setIsAuthenticated(false);
          }
          setIsCheckingAuth(false);
        }
      } catch (err) {
        if (isMounted) {
          setIsAuthenticated(false);
          setIsCheckingAuth(false);
        }
      }
    };

    verifySession();

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Subscribe to Home Assistant entity updates and connection state when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    const unsubEntities = hassClient.onEntitiesChange((newEntities) => {
      setEntities(newEntities);
    });

    const unsubConn = hassClient.onConnectionChange((connected, version) => {
      setIsConnected(connected);
      if (version) setHaVersion(version);
      if (connected) {
        setCurrentUser(hassAuth.getCurrentUser());
      }
    });

    const unsubAuthInvalid = hassClient.onAuthInvalid(() => {
      console.warn('[APP] Home Assistant session invalidated.');
      hassAuth.clearTokens();
      setIsAuthenticated(false);
      setCurrentUser(null);
    });

    return () => {
      unsubEntities();
      unsubConn();
      unsubAuthInvalid();
    };
  }, [isAuthenticated]);

  const handleLoginSuccess = useCallback(() => {
    setIsAuthenticated(true);
    setCurrentUser(hassAuth.getCurrentUser());
    hassClient.connect();
    hassClient.fetchStatesRest();
  }, []);

  const handleLogout = useCallback(async () => {
    await hassAuth.logout();
    hassClient.disconnect();
    setIsAuthenticated(false);
    setCurrentUser(null);
    setEntities({});
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await hassClient.fetchStatesRest();
    } finally {
      setTimeout(() => setIsRefreshing(false), 600);
    }
  }, []);

  // Loading state while checking session token
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-[#0f1117] text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="relative flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#FF4FA3] to-[#FF75B5] shadow-xl shadow-[#FF4FA3]/25 text-white font-black text-2xl tracking-tight mb-4 animate-pulse">
          Y
        </div>
        <div className="flex items-center gap-2 text-slate-300 text-sm font-medium mb-1">
          <Loader2 className="w-4 h-4 animate-spin text-[#FF4FA3]" />
          <span>Verifying Home Assistant Session...</span>
        </div>
        <p className="text-xs text-slate-500">Checking authentication against Home Assistant Core</p>
      </div>
    );
  }

  // If not authenticated, render real Home Assistant login screen
  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  const totalTrackers = Object.keys(entities).filter(
    (k) => k.startsWith('device_tracker.') || k.startsWith('person.')
  ).length;

  return (
    <div className="min-h-screen bg-[#0f1117] text-slate-100 flex flex-col selection:bg-[#FF4FA3]/30 selection:text-white">
      {/* Top Navigation Bar */}
      <Navigation
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isConnected={isConnected}
        haVersion={haVersion}
        totalTrackers={totalTrackers}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {activeTab === 'map' && (
          <MapTracker
            entities={entities}
            selectedEntityId={selectedEntityId}
            onSelectEntity={(id) => {
              setSelectedEntityId(id);
            }}
            isConnected={isConnected}
            currentUser={currentUser}
          />
        )}

        {activeTab === 'people' && (
          <PeopleList
            entities={entities}
            onSelectEntity={(id) => {
              setSelectedEntityId(id);
              setActiveTab('map');
            }}
            onOpenCompanionGuide={() => setActiveTab('companion')}
          />
        )}

        {activeTab === 'companion' && (
          <CompanionGuide
            companionUrl={typeof window !== 'undefined' ? window.location.origin : ''}
            haVersion={haVersion}
          />
        )}

        {activeTab === 'history' && (
          <HistoryTimeline
            entities={entities}
            selectedEntityId={selectedEntityId}
            onSelectEntity={(id) => setSelectedEntityId(id)}
          />
        )}

        {activeTab === 'registries' && <DeviceRegistry entities={entities} />}

        {activeTab === 'diagnostics' && <ServerDiagnostics />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-[#161922]/60 py-4 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white">Yimly Server</span>
            <span>•</span>
            <span className="text-slate-400">Real Home Assistant Core Backend</span>
            <span>•</span>
            <span className="text-[#FF4FA3]">Official Companion App Support</span>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] text-slate-500">
            <span>Docker Ready</span>
            <span>•</span>
            <span>Cloudflare Tunnel Compatible</span>
            <span>•</span>
            <span>/config Persistent Storage</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
