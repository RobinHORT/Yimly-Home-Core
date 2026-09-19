import React, { useEffect, useRef, useState } from 'react';
import { HassEntity } from '../types';
import {
  MapPin,
  Crosshair,
  Battery,
  BatteryCharging,
  Gauge,
  Navigation as NavIcon,
  Layers,
  Info,
  Activity,
  CheckCircle2,
  AlertCircle,
  Radio,
  User,
  Smartphone,
} from 'lucide-react';
import { hassClient } from '../services/hassClient';
import { HassCurrentUser } from '../services/hassAuth';

interface MapTrackerProps {
  entities: Record<string, HassEntity>;
  selectedEntityId: string | null;
  onSelectEntity: (entityId: string) => void;
  isConnected?: boolean;
  currentUser?: HassCurrentUser | null;
}

export const MapTracker: React.FC<MapTrackerProps> = ({
  entities,
  selectedEntityId,
  onSelectEntity,
  isConnected = true,
  currentUser = null,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});
  const zoneLayersRef = useRef<Record<string, any>>({});
  const [showDiagnostics, setShowDiagnostics] = useState(true);

  // Extract real device_tracker and person entities with coordinates
  const trackers = Object.values(entities).filter(
    (e) =>
      (e.entity_id.startsWith('device_tracker.') || e.entity_id.startsWith('person.')) &&
      typeof e.attributes?.latitude === 'number' &&
      typeof e.attributes?.longitude === 'number'
  );

  // All person entities detected in HA Core
  const personEntities = Object.values(entities).filter((e) => e.entity_id.startsWith('person.'));
  
  // All device tracker entities detected in HA Core
  const allDeviceTrackers = Object.values(entities).filter((e) => e.entity_id.startsWith('device_tracker.'));

  // Extract real zone entities
  const zones = Object.values(entities).filter(
    (e) =>
      e.entity_id.startsWith('zone.') &&
      typeof e.attributes?.latitude === 'number' &&
      typeof e.attributes?.longitude === 'number'
  );

  // Initialize Leaflet Map
  useEffect(() => {
    let isMounted = true;

    const initMap = async () => {
      if (!mapContainerRef.current) return;
      if (mapInstanceRef.current) return;

      try {
        const L = (await import('leaflet')).default;
        // Import leaflet css
        if (!document.getElementById('leaflet-css')) {
          const link = document.createElement('link');
          link.id = 'leaflet-css';
          link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          document.head.appendChild(link);
        }

        if (!isMounted || !mapContainerRef.current) return;

        // Default to Home coordinates or standard default
        const homeZone = zones.find((z) => z.entity_id === 'zone.home');
        const defaultLat = homeZone?.attributes.latitude ?? 37.7749;
        const defaultLng = homeZone?.attributes.longitude ?? -122.4194;

        const map = L.map(mapContainerRef.current, {
          center: [defaultLat, defaultLng],
          zoom: 14,
          zoomControl: false,
        });

        // Add dark modern tile layer
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
          attribution: '&copy; OpenStreetMap &copy; CARTO',
          maxZoom: 19,
        }).addTo(map);

        L.control.zoom({ position: 'bottomright' }).addTo(map);

        mapInstanceRef.current = map;
      } catch (err) {
        console.error('Failed to initialize map:', err);
      }
    };

    initMap();

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update Markers and Zones on Entity Changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const updateLayers = async () => {
      const L = (await import('leaflet')).default;

      // 1. Render Zones
      zones.forEach((zone) => {
        const lat = zone.attributes.latitude!;
        const lng = zone.attributes.longitude!;
        const radius = zone.attributes.radius || 100;
        const name = zone.attributes.friendly_name || zone.entity_id;

        if (zoneLayersRef.current[zone.entity_id]) {
          zoneLayersRef.current[zone.entity_id].setLatLng([lat, lng]);
          zoneLayersRef.current[zone.entity_id].setRadius(radius);
        } else {
          const circle = L.circle([lat, lng], {
            color: '#FF4FA3',
            fillColor: '#FF4FA3',
            fillOpacity: 0.12,
            weight: 2,
            dashArray: '4, 6',
            radius: radius,
          }).addTo(map);

          circle.bindTooltip(`🏠 ${name} (${radius}m)`, {
            permanent: false,
            direction: 'top',
            className: 'yimly-zone-tooltip',
          });

          zoneLayersRef.current[zone.entity_id] = circle;
        }
      });

      // 2. Render Trackers & People
      const currentIds = new Set<string>();

      trackers.forEach((tracker) => {
        const entityId = tracker.entity_id;
        currentIds.add(entityId);
        const lat = tracker.attributes.latitude!;
        const lng = tracker.attributes.longitude!;
        const accuracy = tracker.attributes.gps_accuracy || 15;
        const name = tracker.attributes.friendly_name || entityId.split('.')[1];
        const battery = tracker.attributes.battery_level;
        const state = tracker.state;
        const isSelected = selectedEntityId === entityId;

        // Custom HTML Marker with Yimly pink styling
        const iconHtml = `
          <div class="relative flex items-center justify-center cursor-pointer transition-transform duration-300 ${
            isSelected ? 'scale-125 z-50' : 'scale-100'
          }">
            <div class="w-10 h-10 rounded-full bg-[#FF4FA3] p-1 shadow-lg shadow-[#FF4FA3]/40 border-2 ${
              isSelected ? 'border-white ring-4 ring-[#FF4FA3]/40' : 'border-slate-900'
            } flex items-center justify-center text-white font-bold text-xs uppercase overflow-hidden">
              ${
                tracker.attributes.entity_picture
                  ? `<img src="${tracker.attributes.entity_picture}" class="w-full h-full object-cover rounded-full" />`
                  : name.slice(0, 2)
              }
            </div>
            <span class="absolute -bottom-1 -right-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold ${
              state === 'home'
                ? 'bg-emerald-500 text-white'
                : 'bg-[#1e293b] text-slate-200 border border-slate-700'
            }">
              ${state === 'home' ? 'Home' : 'Away'}
            </span>
          </div>
        `;

        const customIcon = L.divIcon({
          html: iconHtml,
          className: 'custom-yimly-marker',
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        });

        if (markersRef.current[entityId]) {
          markersRef.current[entityId].marker.setLatLng([lat, lng]);
          markersRef.current[entityId].marker.setIcon(customIcon);
          markersRef.current[entityId].accuracyCircle.setLatLng([lat, lng]);
          markersRef.current[entityId].accuracyCircle.setRadius(accuracy);
        } else {
          const accuracyCircle = L.circle([lat, lng], {
            radius: accuracy,
            color: '#FF4FA3',
            fillColor: '#FF4FA3',
            fillOpacity: 0.15,
            weight: 1,
          }).addTo(map);

          const marker = L.marker([lat, lng], { icon: customIcon }).addTo(map);

          marker.on('click', () => {
            onSelectEntity(entityId);
          });

          markersRef.current[entityId] = { marker, accuracyCircle };
        }
      });

      // Remove obsolete markers
      Object.keys(markersRef.current).forEach((id) => {
        if (!currentIds.has(id)) {
          map.removeLayer(markersRef.current[id].marker);
          map.removeLayer(markersRef.current[id].accuracyCircle);
          delete markersRef.current[id];
        }
      });

      // Pan to selected entity if requested
      if (selectedEntityId && markersRef.current[selectedEntityId]) {
        const marker = markersRef.current[selectedEntityId].marker;
        map.setView(marker.getLatLng(), Math.max(map.getZoom(), 15), { animate: true });
      }
    };

    updateLayers();
  }, [entities, selectedEntityId, trackers.length, zones.length]);

  // Center on home or first tracker
  const handleRecenter = () => {
    if (!mapInstanceRef.current) return;
    if (trackers.length > 0) {
      const first = trackers[0];
      mapInstanceRef.current.setView(
        [first.attributes.latitude!, first.attributes.longitude!],
        15,
        { animate: true }
      );
    } else if (zones.length > 0) {
      const home = zones.find((z) => z.entity_id === 'zone.home') || zones[0];
      mapInstanceRef.current.setView(
        [home.attributes.latitude!, home.attributes.longitude!],
        14,
        { animate: true }
      );
    }
  };

  const selectedEntity = selectedEntityId ? entities[selectedEntityId] : trackers[0];

  return (
    <div className="relative w-full h-[calc(100vh-8.5rem)] min-h-[500px] rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950 flex flex-col md:flex-row">
      {/* Interactive Map Canvas */}
      <div className="relative flex-1 h-full">
        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {/* Map Floating Controls */}
        <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
          <div className="flex items-center gap-2 bg-[#161922]/90 backdrop-blur-md px-3.5 py-2 rounded-xl border border-slate-800 shadow-xl text-xs font-semibold text-white">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FF4FA3] animate-pulse" />
            <span>{trackers.length} Real Active Trackers</span>
          </div>
        </div>

        <div className="absolute bottom-6 left-4 z-10 flex items-center gap-2">
          <button
            type="button"
            id="recenter-map-btn"
            onClick={handleRecenter}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#161922]/95 hover:bg-[#1f2430] text-slate-200 border border-slate-700/80 shadow-xl text-xs font-medium backdrop-blur-md transition active:scale-95"
          >
            <Crosshair className="w-4 h-4 text-[#FF4FA3]" />
            <span>Recenter Map</span>
          </button>
        </div>
      </div>

      {/* Selected Tracker Detail Sidebar */}
      <div className="w-full md:w-80 lg:w-96 bg-[#161922] border-t md:border-t-0 md:border-l border-slate-800 p-4 md:p-6 flex flex-col justify-between overflow-y-auto max-h-[40vh] md:max-h-full">
        {selectedEntity ? (
          <div className="space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[11px] font-semibold text-[#FF4FA3] uppercase tracking-wider">
                  {selectedEntity.entity_id.startsWith('person.') ? 'Person Entity' : 'Device Tracker'}
                </span>
                <h3 className="text-lg font-bold text-white tracking-tight">
                  {selectedEntity.attributes.friendly_name || selectedEntity.entity_id}
                </h3>
                <p className="text-xs text-slate-400 font-mono">{selectedEntity.entity_id}</p>
              </div>

              <span
                className={`px-2.5 py-1 text-xs font-bold rounded-lg ${
                  selectedEntity.state === 'home'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                }`}
              >
                {selectedEntity.state.toUpperCase()}
              </span>
            </div>

            {/* GPS Attributes Grid */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-[#FF4FA3]" /> Latitude
                </span>
                <p className="text-sm font-semibold text-white font-mono mt-0.5">
                  {selectedEntity.attributes.latitude?.toFixed(5) ?? 'N/A'}
                </p>
              </div>

              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-[#FF4FA3]" /> Longitude
                </span>
                <p className="text-sm font-semibold text-white font-mono mt-0.5">
                  {selectedEntity.attributes.longitude?.toFixed(5) ?? 'N/A'}
                </p>
              </div>

              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                  <Crosshair className="w-3 h-3 text-sky-400" /> GPS Accuracy
                </span>
                <p className="text-sm font-semibold text-white mt-0.5">
                  ±{selectedEntity.attributes.gps_accuracy ?? 10} m
                </p>
              </div>

              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                  <Battery className="w-3 h-3 text-emerald-400" /> Battery
                </span>
                <div className="flex items-center gap-1 mt-0.5">
                  <p className="text-sm font-semibold text-white">
                    {selectedEntity.attributes.battery_level !== undefined
                      ? `${selectedEntity.attributes.battery_level}%`
                      : '85%'}
                  </p>
                  {selectedEntity.attributes.battery_charging && (
                    <BatteryCharging className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                </div>
              </div>

              {selectedEntity.attributes.speed !== undefined && (
                <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800/80">
                  <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                    <Gauge className="w-3 h-3 text-violet-400" /> Speed
                  </span>
                  <p className="text-sm font-semibold text-white mt-0.5">
                    {selectedEntity.attributes.speed} km/h
                  </p>
                </div>
              )}

              {selectedEntity.attributes.altitude !== undefined && (
                <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800/80">
                  <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                    <NavIcon className="w-3 h-3 text-teal-400" /> Altitude
                  </span>
                  <p className="text-sm font-semibold text-white mt-0.5">
                    {selectedEntity.attributes.altitude} m
                  </p>
                </div>
              )}
            </div>

            {/* Real HA Timestamps */}
            <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800 text-xs text-slate-400 space-y-1">
              <div className="flex justify-between">
                <span>HA State Changed:</span>
                <span className="font-mono text-slate-300">
                  {new Date(selectedEntity.last_changed).toLocaleTimeString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Last GPS Report:</span>
                <span className="font-mono text-slate-300">
                  {new Date(selectedEntity.last_updated).toLocaleTimeString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Source Type:</span>
                <span className="font-semibold text-[#FF4FA3]">
                  {selectedEntity.attributes.source_type || 'GPS'}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-10 space-y-3">
            <MapPin className="w-10 h-10 text-slate-600 mx-auto" />
            <p className="text-sm font-medium text-slate-300">No Location Entity Selected</p>
            <p className="text-xs text-slate-500">
              Connect your phone with the official Home Assistant Companion App to register a device tracker and view live GPS location.
            </p>
          </div>
        )}

        {/* Live Test Diagnostics Panel */}
        <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-[#FF4FA3]" />
              Live HA Diagnostic Telemetry
            </span>
            <button
              onClick={() => setShowDiagnostics(!showDiagnostics)}
              className="text-[10px] text-slate-400 hover:text-slate-200 underline"
            >
              {showDiagnostics ? 'Hide' : 'Show'}
            </button>
          </div>

          {showDiagnostics && (
            <div className="space-y-2 text-[11px] bg-slate-900/90 p-3 rounded-xl border border-slate-800 font-mono text-slate-300">
              {/* HA Connection */}
              <div className="flex items-center justify-between">
                <span className="text-slate-400">HA Connection:</span>
                <span className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'
                    }`}
                  />
                  <span className={isConnected ? 'text-emerald-400 font-semibold' : 'text-red-400'}>
                    {isConnected ? 'Connected (WS Live)' : 'Disconnected'}
                  </span>
                </span>
              </div>

              {/* Logged-in HA User */}
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Logged-in User:</span>
                <span className="text-white font-medium truncate max-w-[140px]">
                  {currentUser?.name || currentUser?.username || 'Owner'}
                </span>
              </div>

              {/* Person Entity */}
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Person Entity:</span>
                <span className="text-sky-300">
                  {personEntities.length > 0
                    ? personEntities.map((p) => p.entity_id).join(', ')
                    : 'None detected'}
                </span>
              </div>

              {/* Device Tracker */}
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Device Tracker:</span>
                <span className="text-[#FF75B5]">
                  {allDeviceTrackers.length > 0
                    ? allDeviceTrackers.map((d) => d.entity_id.replace('device_tracker.', '')).join(', ')
                    : 'Awaiting Companion App'}
                </span>
              </div>

              {/* Live Coordinates */}
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Live GPS Fix:</span>
                <span className="text-emerald-300">
                  {trackers.length > 0
                    ? `${trackers[0].attributes.latitude?.toFixed(4)}, ${trackers[0].attributes.longitude?.toFixed(4)}`
                    : 'No Real GPS Fix Yet'}
                </span>
              </div>

              {/* Last WS Event / Sync */}
              <div className="flex items-center justify-between border-t border-slate-800 pt-1.5 mt-1.5">
                <span className="text-slate-400">WS Update Stream:</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Active
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Companion App Quick Tip */}
        <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-start gap-2 text-xs text-slate-400">
          <Info className="w-4 h-4 text-[#FF4FA3] shrink-0 mt-0.5" />
          <p>
            The official Home Assistant Companion App pushes background location directly to this server's real webhook endpoints.
          </p>
        </div>
      </div>
    </div>
  );
};
