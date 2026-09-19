import React from 'react';
import { HassEntity } from '../types';
import {
  User,
  Smartphone,
  MapPin,
  Battery,
  BatteryCharging,
  Navigation,
  Clock,
  Radio,
  ExternalLink,
} from 'lucide-react';

interface PeopleListProps {
  entities: Record<string, HassEntity>;
  onSelectEntity: (entityId: string) => void;
  onOpenCompanionGuide: () => void;
}

// Distance formula (Haversine in km)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export const PeopleList: React.FC<PeopleListProps> = ({
  entities,
  onSelectEntity,
  onOpenCompanionGuide,
}) => {
  const homeZone = Object.values(entities).find((e) => e.entity_id === 'zone.home');
  const homeLat = homeZone?.attributes.latitude ?? 37.7749;
  const homeLng = homeZone?.attributes.longitude ?? -122.4194;

  const people = Object.values(entities).filter((e) => e.entity_id.startsWith('person.'));
  const deviceTrackers = Object.values(entities).filter((e) =>
    e.entity_id.startsWith('device_tracker.')
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#161922] p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <User className="w-5 h-5 text-[#FF4FA3]" />
            People & Device Trackers
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Real Home Assistant <code className="text-[#FF4FA3] font-mono">person.*</code> and{' '}
            <code className="text-[#FF4FA3] font-mono">device_tracker.*</code> state records managed by HA Core.
          </p>
        </div>

        <button
          onClick={onOpenCompanionGuide}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF4FA3] to-[#FF75B5] hover:opacity-90 text-white text-xs font-semibold shadow-md shadow-[#FF4FA3]/25 transition"
        >
          <Smartphone className="w-4 h-4" />
          <span>Connect Official Companion App</span>
        </button>
      </div>

      {/* People Section */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 px-1">
          Registered Persons ({people.length})
        </h3>

        {people.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {people.map((person) => {
              const lat = person.attributes.latitude;
              const lng = person.attributes.longitude;
              const hasCoords = typeof lat === 'number' && typeof lng === 'number';
              const distance = hasCoords ? calculateDistance(homeLat, homeLng, lat!, lng!) : null;
              const isHome = person.state === 'home';

              return (
                <div
                  key={person.entity_id}
                  onClick={() => onSelectEntity(person.entity_id)}
                  className="group bg-[#161922] hover:bg-[#1c202c] p-5 rounded-2xl border border-slate-800 hover:border-[#FF4FA3]/40 shadow-lg cursor-pointer transition-all duration-200"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-[#FF4FA3]/15 border border-[#FF4FA3]/30 text-[#FF4FA3] flex items-center justify-center font-bold text-base shadow-sm">
                        {person.attributes.entity_picture ? (
                          <img
                            src={person.attributes.entity_picture}
                            alt={person.attributes.friendly_name}
                            className="w-full h-full object-cover rounded-2xl"
                          />
                        ) : (
                          (person.attributes.friendly_name || person.entity_id).slice(0, 2).toUpperCase()
                        )}
                      </div>
                      <div>
                        <h4 className="text-base font-bold text-white group-hover:text-[#FF4FA3] transition">
                          {person.attributes.friendly_name || person.entity_id}
                        </h4>
                        <p className="text-xs text-slate-400 font-mono">{person.entity_id}</p>
                      </div>
                    </div>

                    <span
                      className={`px-2.5 py-1 text-xs font-bold rounded-lg ${
                        isHome
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {person.state.toUpperCase()}
                    </span>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-slate-900/60 p-2.5 rounded-xl">
                      <span className="text-slate-400 text-[10px] uppercase font-bold flex items-center gap-1">
                        <Navigation className="w-3 h-3 text-[#FF4FA3]" /> Distance to Home
                      </span>
                      <p className="text-sm font-semibold text-white mt-0.5">
                        {distance !== null ? `${distance} km` : isHome ? '0 km (Home)' : 'Unknown'}
                      </p>
                    </div>

                    <div className="bg-slate-900/60 p-2.5 rounded-xl">
                      <span className="text-slate-400 text-[10px] uppercase font-bold flex items-center gap-1">
                        <Clock className="w-3 h-3 text-sky-400" /> Last Updated
                      </span>
                      <p className="text-sm font-semibold text-white mt-0.5">
                        {new Date(person.last_updated).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>

                  {person.attributes.device_trackers && person.attributes.device_trackers.length > 0 && (
                    <div className="mt-3 text-[11px] text-slate-400 flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5 text-slate-500" />
                      <span>Tracked by: {person.attributes.device_trackers.join(', ')}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-[#161922] p-8 rounded-2xl border border-slate-800 text-center space-y-2">
            <User className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-sm font-medium text-slate-300">No person entities yet</p>
            <p className="text-xs text-slate-500">
              Person entities will be created automatically when you connect phone trackers or define persons in Home Assistant.
            </p>
          </div>
        )}
      </div>

      {/* Device Trackers Section */}
      <div className="space-y-3 pt-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 px-1">
          Device Trackers ({deviceTrackers.length})
        </h3>

        {deviceTrackers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {deviceTrackers.map((tracker) => {
              const lat = tracker.attributes.latitude;
              const lng = tracker.attributes.longitude;
              const hasCoords = typeof lat === 'number' && typeof lng === 'number';
              const distance = hasCoords ? calculateDistance(homeLat, homeLng, lat!, lng!) : null;
              const battery = tracker.attributes.battery_level;

              return (
                <div
                  key={tracker.entity_id}
                  onClick={() => onSelectEntity(tracker.entity_id)}
                  className="group bg-[#161922] hover:bg-[#1c202c] p-5 rounded-2xl border border-slate-800 hover:border-[#FF4FA3]/40 shadow-lg cursor-pointer transition-all duration-200"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 text-[#FF4FA3] flex items-center justify-center font-bold text-base shadow-sm">
                        <Smartphone className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="text-base font-bold text-white group-hover:text-[#FF4FA3] transition">
                          {tracker.attributes.friendly_name || tracker.entity_id.split('.')[1]}
                        </h4>
                        <p className="text-xs text-slate-400 font-mono">{tracker.entity_id}</p>
                      </div>
                    </div>

                    <span
                      className={`px-2.5 py-1 text-xs font-bold rounded-lg ${
                        tracker.state === 'home'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {tracker.state.toUpperCase()}
                    </span>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-800/80 grid grid-cols-3 gap-2 text-xs">
                    <div className="bg-slate-900/60 p-2.5 rounded-xl">
                      <span className="text-slate-400 text-[10px] uppercase font-bold flex items-center gap-1">
                        <Battery className="w-3 h-3 text-emerald-400" /> Battery
                      </span>
                      <div className="flex items-center gap-1 mt-0.5">
                        <p className="text-sm font-semibold text-white">
                          {battery !== undefined ? `${battery}%` : 'N/A'}
                        </p>
                        {tracker.attributes.battery_charging && (
                          <BatteryCharging className="w-3 h-3 text-emerald-400" />
                        )}
                      </div>
                    </div>

                    <div className="bg-slate-900/60 p-2.5 rounded-xl">
                      <span className="text-slate-400 text-[10px] uppercase font-bold flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-[#FF4FA3]" /> Distance
                      </span>
                      <p className="text-sm font-semibold text-white mt-0.5">
                        {distance !== null ? `${distance} km` : tracker.state === 'home' ? '0 km' : 'N/A'}
                      </p>
                    </div>

                    <div className="bg-slate-900/60 p-2.5 rounded-xl">
                      <span className="text-slate-400 text-[10px] uppercase font-bold flex items-center gap-1">
                        <Radio className="w-3 h-3 text-teal-400" /> Source
                      </span>
                      <p className="text-sm font-semibold text-white mt-0.5 capitalize">
                        {tracker.attributes.source_type || 'GPS'}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-[#161922] p-8 rounded-2xl border border-slate-800 text-center space-y-2">
            <Smartphone className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-sm font-medium text-slate-300">No device trackers active</p>
            <p className="text-xs text-slate-500">
              Connect your phone with the official Companion App or click "Test GPS Push to HA" on the map tab.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
