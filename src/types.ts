/**
 * Home Assistant Core & Yimly Location Server Types
 */

export interface HassEntityAttributes {
  friendly_name?: string;
  latitude?: number;
  longitude?: number;
  gps_accuracy?: number;
  altitude?: number;
  speed?: number;
  course?: number;
  vertical_accuracy?: number;
  battery_level?: number;
  battery_state?: string;
  battery_charging?: boolean;
  source_type?: 'gps' | 'router' | 'bluetooth' | 'bluetooth_le';
  entity_picture?: string;
  icon?: string;
  device_trackers?: string[];
  user_id?: string;
  unit_of_measurement?: string;
  device_class?: string;
  state_class?: string;
  radius?: number; // for zones
  passive?: boolean; // for zones
  editable?: boolean;
  [key: string]: any;
}

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: HassEntityAttributes;
  last_changed: string;
  last_updated: string;
  context?: {
    id: string;
    parent_id: string | null;
    user_id: string | null;
  };
}

export interface HassConfig {
  latitude: number;
  longitude: number;
  elevation: number;
  unit_system: {
    length: string;
    mass: string;
    pressure: string;
    temperature: string;
    volume: string;
    wind_speed: string;
  };
  location_name: string;
  time_zone: string;
  components: string[];
  config_dir: string;
  version: string;
  state: 'NOT_RUNNING' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'FINAL_WRITE';
}

export interface HassDeviceRegistryEntry {
  id: string;
  name: string | null;
  name_by_user: string | null;
  model: string | null;
  manufacturer: string | null;
  sw_version: string | null;
  hw_version: string | null;
  serial_number: string | null;
  via_device_id: string | null;
  area_id: string | null;
  entry_type: string | null;
  identifiers: [string, string][];
  connections: [string, string][];
}

export interface HassEntityRegistryEntry {
  entity_id: string;
  name: string | null;
  original_name: string | null;
  icon: string | null;
  platform: string;
  device_id: string | null;
  area_id: string | null;
  disabled_by: string | null;
  hidden_by: string | null;
}

export interface LocationBreadcrumb {
  timestamp: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
  state: string;
}

export interface CompanionAppRegistration {
  app_data?: {
    app_version?: string;
    os_version?: string;
    device_name?: string;
  };
  app_id?: string;
  app_name?: string;
  app_version?: string;
  device_name?: string;
  manufacturer?: string;
  model?: string;
  os_name?: string;
  os_version?: string;
  supports_encryption?: boolean;
  webhook_id: string;
  registered_at?: string;
}

export interface ServerDiagnosticsData {
  ha_version: string;
  is_ha_running: boolean;
  ha_pid: number | null;
  uptime_seconds: number;
  total_entities: number;
  device_trackers_count: number;
  persons_count: number;
  zones_count: number;
  db_size_kb: number;
  recorder_active: boolean;
  python_version: string;
  companion_url: string;
  cloudflare_tunnel_configured: boolean;
  last_location_received: string | null;
}

export interface LocationStats {
  distance_from_home_km: number | null;
  current_zone: string;
  is_moving: boolean;
  battery_percent: number | null;
  is_charging: boolean;
  speed_kmh: number | null;
  last_updated_relative: string;
}
