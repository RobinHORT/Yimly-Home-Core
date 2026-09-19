import React, { useEffect, useState } from 'react';
import {
  HassDeviceRegistryEntry,
  HassEntityRegistryEntry,
  HassEntity,
} from '../types';
import {
  HardDrive,
  Cpu,
  Layers,
  Smartphone,
  Tag,
  Shield,
  RefreshCw,
  Search,
} from 'lucide-react';
import { hassClient } from '../services/hassClient';

interface DeviceRegistryProps {
  entities: Record<string, HassEntity>;
}

export const DeviceRegistry: React.FC<DeviceRegistryProps> = ({ entities }) => {
  const [devices, setDevices] = useState<HassDeviceRegistryEntry[]>([]);
  const [entityEntries, setEntityEntries] = useState<HassEntityRegistryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadRegistries = async () => {
    setIsLoading(true);
    try {
      const [devs, ents] = await Promise.all([
        hassClient.getDeviceRegistry(),
        hassClient.getEntityRegistry(),
      ]);
      setDevices(devs || []);
      setEntityEntries(ents || []);
    } catch (e) {
      console.warn('Failed to fetch registries:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRegistries();
  }, []);

  const filteredEntities = Object.values(entities).filter((e) =>
    e.entity_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (e.attributes.friendly_name &&
      e.attributes.friendly_name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#161922] p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-[#FF4FA3]" />
            Home Assistant Device & Entity Registry
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Official internal registries stored in <code className="text-[#FF4FA3] font-mono">/config/.storage/core.device_registry</code> and <code className="text-[#FF4FA3] font-mono">core.entity_registry</code>.
          </p>
        </div>

        <button
          onClick={loadRegistries}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#FF4FA3] ${isLoading ? 'animate-spin' : ''}`} />
          <span>Reload Registry</span>
        </button>
      </div>

      {/* Search & Stats Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Filter entities by domain, name, id..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-[#161922] border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#FF4FA3]"
          />
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="bg-[#161922] px-3 py-1.5 rounded-lg border border-slate-800">
            Total Entities: <strong className="text-white">{Object.keys(entities).length}</strong>
          </span>
          <span className="bg-[#161922] px-3 py-1.5 rounded-lg border border-slate-800">
            Registered Devices: <strong className="text-white">{devices.length}</strong>
          </span>
        </div>
      </div>

      {/* Live Entity Table */}
      <div className="bg-[#161922] rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="px-5 py-3.5">Entity ID</th>
                <th className="px-5 py-3.5">State</th>
                <th className="px-5 py-3.5">Friendly Name</th>
                <th className="px-5 py-3.5">Domain</th>
                <th className="px-5 py-3.5">Attributes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredEntities.map((entity) => {
                const domain = entity.entity_id.split('.')[0];
                return (
                  <tr key={entity.entity_id} className="hover:bg-slate-800/40 transition">
                    <td className="px-5 py-3 text-slate-200 font-semibold">
                      {entity.entity_id}
                    </td>
                    <td className="px-5 py-3">
                      <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-200 border border-slate-700 font-sans font-medium text-[11px]">
                        {entity.state}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-300 font-sans">
                      {entity.attributes.friendly_name || '—'}
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-[#FF4FA3] font-semibold">{domain}</span>
                    </td>
                    <td className="px-5 py-3 text-slate-400 text-[11px] truncate max-w-xs font-sans">
                      {Object.keys(entity.attributes).length} attributes (
                      {Object.keys(entity.attributes).slice(0, 3).join(', ')}...)
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
