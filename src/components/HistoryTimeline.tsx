import React, { useState, useEffect } from 'react';
import { HassEntity, LocationBreadcrumb } from '../types';
import {
  History,
  Clock,
  MapPin,
  Calendar,
  Gauge,
  Crosshair,
  Filter,
  RefreshCw,
} from 'lucide-react';
import { hassClient } from '../services/hassClient';

interface HistoryTimelineProps {
  entities: Record<string, HassEntity>;
  selectedEntityId: string | null;
  onSelectEntity: (entityId: string) => void;
}

export const HistoryTimeline: React.FC<HistoryTimelineProps> = ({
  entities,
  selectedEntityId,
  onSelectEntity,
}) => {
  const [timeRangeHours, setTimeRangeHours] = useState<number>(24);
  const [historyPoints, setHistoryPoints] = useState<LocationBreadcrumb[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const trackerEntities = Object.values(entities).filter(
    (e) => e.entity_id.startsWith('device_tracker.') || e.entity_id.startsWith('person.')
  );

  const activeEntityId = selectedEntityId || (trackerEntities.length > 0 ? trackerEntities[0].entity_id : null);

  useEffect(() => {
    if (!activeEntityId) return;

    let isMounted = true;
    const fetchHistory = async () => {
      setIsLoading(true);
      try {
        const points = await hassClient.getEntityHistory(activeEntityId, timeRangeHours);
        if (isMounted) {
          setHistoryPoints(points);
        }
      } catch (err) {
        console.warn('Failed to load history:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchHistory();

    return () => {
      isMounted = false;
    };
  }, [activeEntityId, timeRangeHours]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#161922] p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <History className="w-5 h-5 text-[#FF4FA3]" />
            Location History & Recorder
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Historical coordinates, state transitions, and speed data queried from Home Assistant SQLite Recorder database.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={activeEntityId || ''}
            onChange={(e) => onSelectEntity(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-[#FF4FA3]"
          >
            {trackerEntities.map((e) => (
              <option key={e.entity_id} value={e.entity_id}>
                {e.attributes.friendly_name || e.entity_id}
              </option>
            ))}
          </select>

          <select
            value={timeRangeHours}
            onChange={(e) => setTimeRangeHours(Number(e.target.value))}
            className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-[#FF4FA3]"
          >
            <option value={1}>Last 1 Hour</option>
            <option value={6}>Last 6 Hours</option>
            <option value={24}>Last 24 Hours</option>
            <option value={72}>Last 3 Days</option>
            <option value={168}>Last 7 Days</option>
          </select>
        </div>
      </div>

      {/* History Records List */}
      <div className="bg-[#161922] p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
            Timeline Breadcrumbs ({historyPoints.length} points)
          </h3>
          {isLoading && (
            <span className="flex items-center gap-1.5 text-xs text-[#FF4FA3]">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Querying HA Recorder...
            </span>
          )}
        </div>

        {historyPoints.length > 0 ? (
          <div className="space-y-3 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-slate-800">
            {historyPoints.map((point, index) => (
              <div key={index} className="relative flex items-start gap-4 pl-1">
                <div className="w-6 h-6 rounded-full bg-[#161922] border-2 border-[#FF4FA3] flex items-center justify-center shrink-0 z-10">
                  <div className="w-2 h-2 rounded-full bg-[#FF4FA3]" />
                </div>

                <div className="flex-1 bg-slate-900/70 hover:bg-slate-900 p-4 rounded-xl border border-slate-800/80 transition flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white uppercase tracking-wide">
                        {point.state}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        {new Date(point.timestamp).toLocaleString()}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-300 font-mono mt-1">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-[#FF4FA3]" />
                        {point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}
                      </span>
                      {point.accuracy !== undefined && (
                        <span className="flex items-center gap-1 text-slate-400">
                          <Crosshair className="w-3 h-3 text-sky-400" /> ±{point.accuracy}m
                        </span>
                      )}
                      {point.speed !== undefined && point.speed > 0 && (
                        <span className="flex items-center gap-1 text-violet-400">
                          <Gauge className="w-3 h-3" /> {point.speed} km/h
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 space-y-2">
            <Calendar className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-sm font-medium text-slate-300">No history records in this time range</p>
            <p className="text-xs text-slate-500">
              As location reports arrive via the Companion App or test button, Home Assistant Recorder automatically persists them in SQLite.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
