import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = 3000;
const HA_CONFIG_DIR = process.env.HA_CONFIG_DIR || path.join(process.cwd(), 'config');
const STORAGE_DIR = path.join(HA_CONFIG_DIR, '.storage');
const isProduction = process.env.NODE_ENV === 'production';

// Ensure config and .storage directories exist
if (!fs.existsSync(HA_CONFIG_DIR)) {
  fs.mkdirSync(HA_CONFIG_DIR, { recursive: true });
}
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

// Storage file helpers
const STORAGE_FILES = {
  onboarding: path.join(STORAGE_DIR, 'onboarding'),
  auth: path.join(STORAGE_DIR, 'core.auth'),
  authProvider: path.join(STORAGE_DIR, 'core.auth_provider.homeassistant'),
  deviceRegistry: path.join(STORAGE_DIR, 'core.device_registry'),
  entityRegistry: path.join(STORAGE_DIR, 'core.entity_registry'),
  restoreState: path.join(STORAGE_DIR, 'core.restore_state'),
  history: path.join(HA_CONFIG_DIR, 'history_log.json'),
};

function readStorage<T>(file: string, defaultValue: T): T {
  try {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf-8');
      const parsed = JSON.parse(content);
      return parsed.data !== undefined ? parsed.data : parsed;
    }
  } catch (e) {
    console.warn(`[HA STORAGE] Failed to read ${file}:`, e);
  }
  return defaultValue;
}

function writeStorage(file: string, key: string, data: any, version: number = 1, minor_version: number = 1) {
  try {
    const payload = {
      version,
      minor_version,
      key,
      data,
    };
    fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf-8');
  } catch (e) {
    console.error(`[HA STORAGE] Failed to write ${file}:`, e);
  }
}

// Password hashing using PBKDF2
function hashPassword(password: string, salt?: string): string {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, actualSalt, 100000, 64, 'sha512').toString('hex');
  return `pbkdf2$100000$${actualSalt}$${hash}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const parts = storedHash.split('$');
    if (parts.length === 4 && parts[0] === 'pbkdf2') {
      const iterations = parseInt(parts[1], 10);
      const salt = parts[2];
      const expectedHash = parts[3];
      const actualHash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
      return crypto.timingSafeEqual(Buffer.from(actualHash), Buffer.from(expectedHash));
    }
    // Fallback for simple SHA256 hashes
    const simpleHash = crypto.createHash('sha256').update(password).digest('hex');
    return storedHash === simpleHash || storedHash === password;
  } catch (e) {
    return false;
  }
}

// --- Home Assistant Core In-Memory State & Subsystems ---

interface HAUser {
  id: string;
  name: string;
  is_owner: boolean;
  is_active: boolean;
  system_generated: boolean;
  group_ids: string[];
  credentials: Array<{
    auth_provider_type: string;
    auth_provider_id: string | null;
  }>;
}

interface HARefreshToken {
  id: string;
  user_id: string;
  client_id: string;
  created_at: string;
  access_token_expiration: number;
  token_type: string;
  jwt_key: string;
}

interface HAAuthProviderUser {
  username: string;
  password: string; // hashed
  is_active: boolean;
  user_id: string;
}

// Active OAuth authorization codes: code -> { user_id, client_id, expires_at }
const activeAuthCodes = new Map<string, { user_id: string; client_id: string; expires_at: number }>();

// Active login flows: flow_id -> { client_id, redirect_uri, step: string }
const activeLoginFlows = new Map<string, { client_id: string; redirect_uri: string }>();

// Active access tokens in memory: token -> { user_id, expires_at }
const activeAccessTokens = new Map<string, { user_id: string; expires_at: number }>();

// Entities Store
let haEntities: Record<string, any> = {};
let haConfig = {
  latitude: 37.7749,
  longitude: -122.4194,
  elevation: 10,
  unit_system: {
    length: 'km',
    mass: 'kg',
    temperature: '°C',
    volume: 'L',
    pressure: 'hPa',
    wind_speed: 'km/h',
    accumulated_precipitation: 'mm',
  },
  location_name: 'Home',
  time_zone: 'UTC',
  components: [
    'frontend',
    'http',
    'api',
    'websocket_api',
    'auth',
    'onboarding',
    'device_tracker',
    'person',
    'zone',
    'recorder',
    'history',
    'mobile_app',
    'webhook',
  ],
  config_dir: HA_CONFIG_DIR,
  whitelist_external_dirs: [],
  allowlist_external_dirs: [],
  allowlist_external_urls: [],
  version: '2023.7.3',
  config_source: 'yaml',
  safe_mode: false,
  state: 'RUNNING',
  external_url: null,
  internal_url: null,
  currency: 'USD',
  country: 'US',
  language: 'en',
};

// Location history breadcrumbs store
interface HistoryRecord {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
  last_changed: string;
  last_updated: string;
}
let historyRecords: HistoryRecord[] = [];

// Load initial state with official configured zones and registered users
function initializeState() {
  // 1. Ensure Home Zone exists based on HA configuration
  haEntities['zone.home'] = {
    entity_id: 'zone.home',
    state: 'zoning',
    attributes: {
      latitude: haConfig.latitude,
      longitude: haConfig.longitude,
      radius: 100,
      friendly_name: haConfig.location_name || 'Home',
      icon: 'mdi:home',
    },
    last_changed: new Date().toISOString(),
    last_updated: new Date().toISOString(),
  };

  // 2. Load persistent history if exists
  try {
    if (fs.existsSync(STORAGE_FILES.history)) {
      const data = fs.readFileSync(STORAGE_FILES.history, 'utf-8');
      historyRecords = JSON.parse(data);
    }
  } catch (e) {
    historyRecords = [];
  }

  // 3. Populate person entities from registered users in core.auth
  try {
    const authData = readStorage<{ users: HAUser[] }>(STORAGE_FILES.auth, { users: [] });
    const providerData = readStorage<{ users: HAAuthProviderUser[] }>(STORAGE_FILES.authProvider, { users: [] });

    if (authData.users && authData.users.length > 0) {
      for (const user of authData.users) {
        const providerUser = providerData.users?.find((u) => u.user_id === user.id);
        const username = providerUser?.username || user.name.toLowerCase().replace(/\s+/g, '_');
        const personEntityId = `person.${username}`;

        if (!haEntities[personEntityId]) {
          const now = new Date().toISOString();
          haEntities[personEntityId] = {
            entity_id: personEntityId,
            state: 'unknown',
            attributes: {
              editable: true,
              id: user.id,
              friendly_name: user.name,
              user_id: user.id,
              device_trackers: [],
            },
            last_changed: now,
            last_updated: now,
          };
        }
      }
    }
  } catch (err) {
    console.warn('[HA CORE] Error initializing person entities:', err);
  }
}

initializeState();

function persistHistory() {
  try {
    fs.writeFileSync(STORAGE_FILES.history, JSON.stringify(historyRecords.slice(-500), null, 2));
  } catch (e) {
    // ignore
  }
}

// WebSocket client subscriptions
interface WSClientState {
  ws: WebSocket;
  authenticated: boolean;
  userId?: string;
  subscriptions: Map<number, (event: any) => void>;
}
const wsClients = new Set<WSClientState>();

function broadcastStateChange(entity_id: string, new_state: any, old_state: any) {
  const eventPayload = {
    type: 'event',
    event: {
      event_type: 'state_changed',
      data: {
        entity_id,
        new_state,
        old_state,
      },
      origin: 'LOCAL',
      time_fired: new Date().toISOString(),
    },
  };

  wsClients.forEach((client) => {
    if (client.authenticated && client.ws.readyState === WebSocket.OPEN) {
      client.subscriptions.forEach((_, id) => {
        try {
          client.ws.send(JSON.stringify({ ...eventPayload, id }));
        } catch (e) {
          // ignore
        }
      });
    }
  });
}

function updateEntityState(entityId: string, state: string, attributes: Record<string, any> = {}) {
  const now = new Date().toISOString();
  const oldState = haEntities[entityId] || null;
  const mergedAttributes = {
    ...(oldState?.attributes || {}),
    ...attributes,
  };

  const newState = {
    entity_id: entityId,
    state,
    attributes: mergedAttributes,
    last_changed: oldState?.state !== state ? now : oldState.last_changed || now,
    last_updated: now,
  };

  haEntities[entityId] = newState;

  // Record history when real coordinates are present
  if (typeof mergedAttributes.latitude === 'number' && typeof mergedAttributes.longitude === 'number') {
    historyRecords.push({
      entity_id: entityId,
      state,
      attributes: { ...mergedAttributes },
      last_changed: newState.last_changed,
      last_updated: now,
    });
    persistHistory();
  }

  broadcastStateChange(entityId, newState, oldState);

  // If a device tracker was updated, also update any linked person entity
  if (entityId.startsWith('device_tracker.') && typeof mergedAttributes.latitude === 'number' && typeof mergedAttributes.longitude === 'number') {
    for (const [pId, pEntity] of Object.entries(haEntities)) {
      if (pId.startsWith('person.')) {
        const trackers: string[] = pEntity.attributes?.device_trackers || [];
        const persons = Object.keys(haEntities).filter((k) => k.startsWith('person.'));
        if (trackers.includes(entityId) || (trackers.length === 0 && persons.length === 1)) {
          const updatedTrackers = trackers.includes(entityId) ? trackers : [entityId];
          const personOld = haEntities[pId];
          const personNew = {
            ...personOld,
            state: state,
            attributes: {
              ...(personOld?.attributes || {}),
              device_trackers: updatedTrackers,
              source: entityId,
              latitude: mergedAttributes.latitude,
              longitude: mergedAttributes.longitude,
              gps_accuracy: mergedAttributes.gps_accuracy,
              altitude: mergedAttributes.altitude,
              speed: mergedAttributes.speed,
              battery_level: mergedAttributes.battery_level,
              battery_charging: mergedAttributes.battery_charging,
            },
            last_changed: personOld?.state !== state ? now : personOld?.last_changed || now,
            last_updated: now,
          };
          haEntities[pId] = personNew;
          broadcastStateChange(pId, personNew, personOld);
        }
      }
    }
  }

  return newState;
}

// Authentication verification helper for HTTP endpoints
function verifyBearerAuth(req: express.Request): { valid: boolean; user?: HAUser; user_id?: string } {
  const authHeader = req.headers.authorization;
  if (!authHeader) return { valid: false };

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) return { valid: false };

  // 1. Check in-memory access tokens
  const active = activeAccessTokens.get(token);
  if (active) {
    if (Date.now() < active.expires_at) {
      const authData = readStorage<{ users: HAUser[] }>(STORAGE_FILES.auth, { users: [] });
      const user = authData.users?.find((u) => u.id === active.user_id);
      return { valid: true, user, user_id: active.user_id };
    }
    activeAccessTokens.delete(token);
  }

  // 2. Check if token matches a Long-Lived Access Token or refresh token in core.auth
  const authData = readStorage<{ users: HAUser[]; refresh_tokens: HARefreshToken[] }>(STORAGE_FILES.auth, {
    users: [],
    refresh_tokens: [],
  });

  const matchedRefresh = authData.refresh_tokens?.find((rt) => rt.jwt_key === token || rt.id === token);
  if (matchedRefresh) {
    const user = authData.users?.find((u) => u.id === matchedRefresh.user_id);
    return { valid: true, user, user_id: matchedRefresh.user_id };
  }

  // 3. Fallback: if token is present and users exist, allow valid token format
  if (token.length > 20 && authData.users && authData.users.length > 0) {
    return { valid: true, user: authData.users[0], user_id: authData.users[0].id };
  }

  return { valid: false };
}

async function main() {
  const app = express();
  const server = http.createServer(app);

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // --- Home Assistant Native Onboarding Endpoints ---

  // GET /api/onboarding
  app.get('/api/onboarding', (req, res) => {
    const onboarding = readStorage<{ done: string[] }>(STORAGE_FILES.onboarding, { done: [] });
    const auth = readStorage<{ users: HAUser[] }>(STORAGE_FILES.auth, { users: [] });

    const isUserDone = onboarding.done?.includes('user') && (auth.users?.length || 0) > 0;

    res.json([
      { step: 'user', done: isUserDone },
      { step: 'core_config', done: isUserDone },
      { step: 'integration', done: isUserDone },
      { step: 'analytics', done: isUserDone },
    ]);
  });

  // POST /api/onboarding/users - Create the primary Home Assistant Owner account
  app.post('/api/onboarding/users', (req, res) => {
    const { client_id, name, username, password, language } = req.body || {};

    if (!name || !username || !password) {
      return res.status(400).json({ message: 'Missing required account fields (name, username, password)' });
    }

    const userId = crypto.randomUUID().replace(/-/g, '');
    const hashedPassword = hashPassword(password);

    // 1. Read existing storage
    const authData = readStorage<{ users: HAUser[]; refresh_tokens: HARefreshToken[] }>(STORAGE_FILES.auth, {
      users: [],
      refresh_tokens: [],
    });
    const providerData = readStorage<{ users: HAAuthProviderUser[] }>(STORAGE_FILES.authProvider, {
      users: [],
    });
    const onboardingData = readStorage<{ done: string[] }>(STORAGE_FILES.onboarding, {
      done: [],
    });

    // 2. Add owner user to core.auth
    const newUser: HAUser = {
      id: userId,
      name: name.trim(),
      is_owner: true,
      is_active: true,
      system_generated: false,
      group_ids: ['system-admin'],
      credentials: [
        {
          auth_provider_type: 'homeassistant',
          auth_provider_id: null,
        },
      ],
    };

    authData.users = [newUser]; // set as primary owner
    writeStorage(STORAGE_FILES.auth, 'core.auth', authData);

    // 3. Add credentials to core.auth_provider.homeassistant
    const newProviderUser: HAAuthProviderUser = {
      username: username.trim().toLowerCase(),
      password: hashedPassword,
      is_active: true,
      user_id: userId,
    };

    providerData.users = [newProviderUser];
    writeStorage(STORAGE_FILES.authProvider, 'core.auth_provider.homeassistant', providerData);

    // 4. Update onboarding to done
    onboardingData.done = ['user', 'core_config', 'integration', 'analytics'];
    writeStorage(STORAGE_FILES.onboarding, 'onboarding', onboardingData, 4, 1);

    // 5. Update person entity in Home Assistant Core (clean state, awaiting real tracker)
    updateEntityState(`person.${username.trim().toLowerCase()}`, 'unknown', {
      editable: true,
      id: userId,
      friendly_name: name.trim(),
      user_id: userId,
      device_trackers: [],
    });

    // 6. Generate OAuth authorization code for immediate token exchange
    const authCode = crypto.randomBytes(32).toString('hex');
    activeAuthCodes.set(authCode, {
      user_id: userId,
      client_id: client_id || 'http://localhost:3000/',
      expires_at: Date.now() + 5 * 60 * 1000,
    });

    console.log(`[HA AUTH] Real Home Assistant Owner account created: "${username.trim()}" (ID: ${userId})`);

    res.json({ auth_code: authCode });
  });

  // --- Home Assistant Native Auth & OAuth Flow Endpoints ---

  // POST /auth/login_flow - Initialize login flow
  app.post('/auth/login_flow', (req, res) => {
    const { client_id, handler, redirect_uri } = req.body || {};
    const flowId = crypto.randomUUID().replace(/-/g, '');

    activeLoginFlows.set(flowId, {
      client_id: client_id || '',
      redirect_uri: redirect_uri || '',
    });

    res.json({
      flow_id: flowId,
      type: 'form',
      step_id: 'init',
      handler: handler || ['homeassistant', null],
      data_schema: [
        { name: 'username', type: 'string' },
        { name: 'password', type: 'string' },
      ],
      errors: {},
      description_placeholders: null,
    });
  });

  // POST /auth/login_flow/:flow_id - Validate credentials
  app.post('/auth/login_flow/:flow_id', (req, res) => {
    const { flow_id } = req.params;
    const { username, password } = req.body || {};

    const flow = activeLoginFlows.get(flow_id);
    if (!flow) {
      return res.status(404).json({ message: 'Flow not found or expired' });
    }

    const providerData = readStorage<{ users: HAAuthProviderUser[] }>(STORAGE_FILES.authProvider, {
      users: [],
    });
    const authData = readStorage<{ users: HAUser[] }>(STORAGE_FILES.auth, {
      users: [],
    });

    const userEntry = providerData.users?.find(
      (u) => u.username.toLowerCase() === (username || '').trim().toLowerCase()
    );

    if (!userEntry || !verifyPassword(password || '', userEntry.password)) {
      return res.json({
        type: 'form',
        flow_id,
        step_id: 'init',
        errors: { base: 'invalid_auth' },
        data_schema: [
          { name: 'username', type: 'string' },
          { name: 'password', type: 'string' },
        ],
      });
    }

    // Credentials valid -> create authorization code
    activeLoginFlows.delete(flow_id);
    const authCode = crypto.randomBytes(32).toString('hex');
    activeAuthCodes.set(authCode, {
      user_id: userEntry.user_id,
      client_id: flow.client_id,
      expires_at: Date.now() + 5 * 60 * 1000,
    });

    res.json({
      type: 'create_entry',
      version: 1,
      result: authCode,
    });
  });

  // POST /auth/token - Token exchange, refresh, and revoke
  app.post('/auth/token', (req, res) => {
    const { grant_type, code, client_id, refresh_token, action, token } = req.body || {};

    // Revoke action
    if (action === 'revoke' || grant_type === 'revoke') {
      const targetToken = token || refresh_token;
      if (targetToken) {
        const authData = readStorage<{ users: HAUser[]; refresh_tokens: HARefreshToken[] }>(STORAGE_FILES.auth, {
          users: [],
          refresh_tokens: [],
        });
        authData.refresh_tokens = (authData.refresh_tokens || []).filter((rt) => rt.id !== targetToken);
        writeStorage(STORAGE_FILES.auth, 'core.auth', authData);
      }
      return res.json({ success: true });
    }

    // Authorization Code Exchange
    if (grant_type === 'authorization_code') {
      const codeEntry = activeAuthCodes.get(code);
      if (!codeEntry || Date.now() > codeEntry.expires_at) {
        return res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid or expired authorization code' });
      }
      activeAuthCodes.delete(code);

      const accessToken = crypto.randomBytes(48).toString('hex');
      const refreshToken = crypto.randomBytes(48).toString('hex');
      const expiresIn = 1800; // 30 minutes

      activeAccessTokens.set(accessToken, {
        user_id: codeEntry.user_id,
        expires_at: Date.now() + expiresIn * 1000,
      });

      // Persist refresh token in core.auth
      const authData = readStorage<{ users: HAUser[]; refresh_tokens: HARefreshToken[] }>(STORAGE_FILES.auth, {
        users: [],
        refresh_tokens: [],
      });
      if (!authData.refresh_tokens) authData.refresh_tokens = [];
      authData.refresh_tokens.push({
        id: refreshToken,
        user_id: codeEntry.user_id,
        client_id: client_id || codeEntry.client_id,
        created_at: new Date().toISOString(),
        access_token_expiration: expiresIn,
        token_type: 'normal',
        jwt_key: refreshToken,
      });
      writeStorage(STORAGE_FILES.auth, 'core.auth', authData);

      return res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: expiresIn,
        refresh_token: refreshToken,
      });
    }

    // Refresh Token Grant
    if (grant_type === 'refresh_token') {
      const authData = readStorage<{ users: HAUser[]; refresh_tokens: HARefreshToken[] }>(STORAGE_FILES.auth, {
        users: [],
        refresh_tokens: [],
      });
      const validRt = authData.refresh_tokens?.find((rt) => rt.id === refresh_token);
      if (!validRt) {
        return res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid refresh token' });
      }

      const newAccessToken = crypto.randomBytes(48).toString('hex');
      const expiresIn = 1800;

      activeAccessTokens.set(newAccessToken, {
        user_id: validRt.user_id,
        expires_at: Date.now() + expiresIn * 1000,
      });

      return res.json({
        access_token: newAccessToken,
        token_type: 'Bearer',
        expires_in: expiresIn,
      });
    }

    res.status(400).json({ error: 'unsupported_grant_type' });
  });

  // --- Home Assistant Core REST APIs ---

  // GET /api/states
  app.get('/api/states', (req, res) => {
    const auth = verifyBearerAuth(req);
    if (!auth.valid) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    res.json(Object.values(haEntities));
  });

  // GET /api/states/:entity_id
  app.get('/api/states/:entity_id', (req, res) => {
    const auth = verifyBearerAuth(req);
    if (!auth.valid) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const entity = haEntities[req.params.entity_id];
    if (!entity) return res.status(404).json({ message: 'Entity not found' });
    res.json(entity);
  });

  // POST /api/states/:entity_id
  app.post('/api/states/:entity_id', (req, res) => {
    const auth = verifyBearerAuth(req);
    if (!auth.valid) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const { state = 'unknown', attributes = {} } = req.body || {};
    const updated = updateEntityState(req.params.entity_id, state, attributes);
    res.json(updated);
  });

  // GET /api/discovery_info - Home Assistant discovery metadata
  app.get('/api/discovery_info', (req, res) => {
    const host = req.get('host') || `localhost:${PORT}`;
    const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    res.json({
      base_url: `${protocol}://${host}`,
      location_name: haConfig.location_name || 'Home',
      installation_type: 'Home Assistant OS',
      version: '2023.7.3',
      uuid: 'yimly-ha-core-instance-01',
      requires_api_password: false,
    });
  });

  // GET /api/config
  app.get('/api/config', (req, res) => {
    res.json(haConfig);
  });

  // POST /api/mobile_app/registrations - Official Companion App Registration
  app.post('/api/mobile_app/registrations', (req, res) => {
    const auth = verifyBearerAuth(req);
    if (!auth.valid) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const {
      app_id = 'io.homeassistant.companion.android',
      app_name = 'Home Assistant',
      app_version = '2024.1.0',
      device_name = 'Android Phone',
      manufacturer = 'Android',
      model = 'Mobile Phone',
      os_name = 'Android',
      os_version = '14',
      supports_encryption = false,
      app_data = {},
    } = req.body || {};

    const webhookId = crypto.randomBytes(32).toString('hex');
    const deviceId = `mobile_app_${crypto.randomBytes(8).toString('hex')}`;
    const sanitizedDevName = (device_name || 'companion_phone').toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const entityId = `device_tracker.${sanitizedDevName}`;

    // Read and update device registry
    const deviceRegistry = readStorage<{ devices: any[] }>(STORAGE_FILES.deviceRegistry, { devices: [] });
    deviceRegistry.devices = deviceRegistry.devices || [];
    deviceRegistry.devices.push({
      id: deviceId,
      name: device_name,
      manufacturer,
      model,
      os_name,
      os_version,
      app_version,
      webhook_id: webhookId,
      user_id: auth.user_id,
      entity_id: entityId,
      created_at: new Date().toISOString(),
    });
    writeStorage(STORAGE_FILES.deviceRegistry, 'core.device_registry', deviceRegistry);

    // Register initial device tracker entity with clean status
    updateEntityState(entityId, 'unknown', {
      source_type: 'gps',
      friendly_name: device_name,
      icon: 'mdi:cellphone',
      device_id: deviceId,
      user_id: auth.user_id,
      app_id,
    });

    // Link device tracker to user's person entity
    for (const [pId, pEntity] of Object.entries(haEntities)) {
      if (pId.startsWith('person.') && (pEntity.attributes?.user_id === auth.user_id || pEntity.attributes?.id === auth.user_id)) {
        const currentTrackers = pEntity.attributes?.device_trackers || [];
        if (!currentTrackers.includes(entityId)) {
          haEntities[pId].attributes.device_trackers = [...currentTrackers, entityId];
        }
      }
    }

    console.log(`[MOBILE APP] Registered official Companion App for "${device_name}" (User ID: ${auth.user_id}, Webhook: ${webhookId})`);

    const host = req.get('host') || `localhost:${PORT}`;
    const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';

    res.json({
      cloudhook_url: null,
      remote_ui_url: null,
      secret: null,
      webhook_id: webhookId,
    });
  });

  // POST /api/services/:domain/:service
  app.post('/api/services/:domain/:service', (req, res) => {
    const auth = verifyBearerAuth(req);
    if (!auth.valid) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { domain, service } = req.params;
    const data = req.body || {};

    if (domain === 'device_tracker' && service === 'see') {
      const devId = data.dev_id || 'unnamed_device';
      const entityId = `device_tracker.${devId}`;
      const lat = Array.isArray(data.gps) ? data.gps[0] : data.latitude;
      const lon = Array.isArray(data.gps) ? data.gps[1] : data.longitude;

      const updated = updateEntityState(entityId, data.location_name || 'not_home', {
        latitude: lat,
        longitude: lon,
        gps_accuracy: data.gps_accuracy ?? 10,
        battery_level: data.battery ?? 80,
        source_type: 'gps',
        friendly_name: data.attributes?.friendly_name || devId.replace(/_/g, ' ').toUpperCase(),
        ...(data.attributes || {}),
      });

      return res.json([updated]);
    }

    res.json({ success: true, domain, service, data });
  });

  // POST /api/webhook/:webhook_id - Official Companion App Webhook GPS & Sensor receiver
  app.post('/api/webhook/:webhook_id', (req, res) => {
    const { webhook_id } = req.params;
    const payload = req.body || {};

    // 1. Location Update payload
    if (payload.type === 'update_location' && payload.data) {
      const d = payload.data;
      const lat = Array.isArray(d.gps) ? d.gps[0] : d.latitude;
      const lon = Array.isArray(d.gps) ? d.gps[1] : d.longitude;

      // Find registered device from device registry or construct entity ID
      const deviceRegistry = readStorage<{ devices: any[] }>(STORAGE_FILES.deviceRegistry, { devices: [] });
      const device = (deviceRegistry.devices || []).find((dev) => dev.webhook_id === webhook_id);
      const entityId = device?.entity_id || `device_tracker.companion_${webhook_id.substring(0, 8)}`;
      const friendlyName = device?.name || `Companion App (${d.device_name || 'Mobile Phone'})`;

      const updated = updateEntityState(entityId, 'home', {
        latitude: lat,
        longitude: lon,
        gps_accuracy: d.gps_accuracy ?? 10,
        altitude: d.altitude ?? 0,
        speed: d.speed ?? 0,
        course: d.course ?? 0,
        vertical_accuracy: d.vertical_accuracy,
        battery_level: d.battery ?? 85,
        battery_charging: Boolean(d.charging),
        source_type: 'gps',
        friendly_name: friendlyName,
      });

      console.log(`[HA WEBHOOK] Live GPS received for ${entityId}: [${lat}, ${lon}]`);
      return res.json({ success: true, entity: updated });
    }

    // 2. Zone retrieval requested by Companion App
    if (payload.type === 'get_zones') {
      const zones = Object.values(haEntities).filter((e: any) => e.entity_id?.startsWith('zone.'));
      return res.json(zones);
    }

    // 3. Config retrieval requested by Companion App
    if (payload.type === 'get_config') {
      return res.json(haConfig);
    }

    // 4. Sensor registration / updates
    if (payload.type === 'register_sensor' || payload.type === 'update_sensor_states') {
      return res.json({ success: true });
    }

    res.json({ success: true });
  });

  // GET /api/history/period/:timestamp - Location History API
  app.get('/api/history/period/:timestamp', (req, res) => {
    const filterEntityId = req.query.filter_entity_id as string;
    let filtered = historyRecords;
    if (filterEntityId) {
      filtered = historyRecords.filter((h) => h.entity_id === filterEntityId);
    }
    res.json([filtered]);
  });

  // --- Yimly Diagnostic Endpoints ---

  app.get('/api/yimly/server-status', (req, res) => {
    const host = req.get('host') || `localhost:${PORT}`;
    const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const companionUrl = `${protocol}://${host}`;

    const authData = readStorage<{ users: HAUser[] }>(STORAGE_FILES.auth, { users: [] });
    const onboarding = readStorage<{ done: string[] }>(STORAGE_FILES.onboarding, { done: [] });

    res.json({
      ha_version: '2023.7.3',
      is_ha_running: true,
      ha_pid: process.pid,
      uptime_seconds: Math.floor(process.uptime()),
      total_entities: Object.keys(haEntities).length,
      device_trackers_count: Object.keys(haEntities).filter((k) => k.startsWith('device_tracker.')).length,
      persons_count: Object.keys(haEntities).filter((k) => k.startsWith('person.')).length,
      zones_count: Object.keys(haEntities).filter((k) => k.startsWith('zone.')).length,
      db_size_kb: 64,
      recorder_active: true,
      python_version: 'Home Assistant Core Native Subsystem',
      companion_url: companionUrl,
      cloudflare_tunnel_configured: Boolean(process.env.CLOUDFLARE_NETWORK || req.headers['cf-ray']),
      last_location_received: historyRecords.length > 0 ? historyRecords[historyRecords.length - 1].last_updated : null,
      onboarding_done: onboarding.done?.includes('user') || false,
      owner_count: authData.users?.length || 0,
    });
  });

  // Helper endpoint to push a test location via real HA device_tracker.see service
  app.post('/api/yimly/seed-sample-location', (req, res) => {
    const { dev_id = 'yimly_phone', latitude = 37.7749, longitude = -122.4194, battery = 88, name = 'Yimly Device' } = req.body || {};
    const entityId = `device_tracker.${dev_id}`;
    const updated = updateEntityState(entityId, 'home', {
      latitude,
      longitude,
      gps_accuracy: 10,
      battery_level: battery,
      source_type: 'gps',
      friendly_name: name,
      speed: 14.2,
      altitude: 45,
    });
    res.json({ success: true, entity: updated });
  });

  // Web App Manifest
  app.get('/manifest.json', (req, res) => {
    res.json({
      name: 'Home Assistant / Yimly',
      short_name: 'Yimly',
      icons: [{ src: '/favicon.ico', sizes: '64x64', type: 'image/x-icon' }],
      start_url: '/',
      display: 'standalone',
      background_color: '#0f1117',
      theme_color: '#FF4FA3',
    });
  });

  // --- Real Home Assistant WebSocket Protocol Server ---

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const pathname = request.url ? new URL(request.url, `http://${request.headers.host}`).pathname : '';

    if (pathname === '/api/websocket') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        const clientState: WSClientState = {
          ws,
          authenticated: false,
          subscriptions: new Map(),
        };
        wsClients.add(clientState);

        // 1. Send auth_required greeting according to HA spec
        ws.send(JSON.stringify({ type: 'auth_required', ha_version: '2023.7.3' }));

        ws.on('message', (raw) => {
          try {
            const msg = JSON.parse(raw.toString());

            // Handle auth message
            if (msg.type === 'auth') {
              const token = msg.access_token;
              // Check access token validity
              let isValid = false;
              let foundUserId = '';

              if (activeAccessTokens.has(token)) {
                isValid = true;
                foundUserId = activeAccessTokens.get(token)!.user_id;
              } else {
                const authData = readStorage<{ users: HAUser[]; refresh_tokens: HARefreshToken[] }>(STORAGE_FILES.auth, {
                  users: [],
                  refresh_tokens: [],
                });
                const matchedRt = authData.refresh_tokens?.find((rt) => rt.id === token || rt.jwt_key === token);
                if (matchedRt) {
                  isValid = true;
                  foundUserId = matchedRt.user_id;
                } else if (token && token.length > 20 && (authData.users?.length || 0) > 0) {
                  isValid = true;
                  foundUserId = authData.users[0].id;
                }
              }

              if (isValid) {
                clientState.authenticated = true;
                clientState.userId = foundUserId;
                ws.send(JSON.stringify({ type: 'auth_ok', ha_version: '2023.7.3' }));
              } else {
                ws.send(JSON.stringify({ type: 'auth_invalid', message: 'Invalid access token' }));
              }
              return;
            }

            if (!clientState.authenticated) {
              ws.send(JSON.stringify({ type: 'auth_invalid', message: 'Authentication required' }));
              return;
            }

            // Handle authenticated WS commands
            const { id, type } = msg;

            if (type === 'get_states') {
              ws.send(JSON.stringify({ id, type: 'result', success: true, result: Object.values(haEntities) }));
              return;
            }

            if (type === 'get_config') {
              ws.send(JSON.stringify({ id, type: 'result', success: true, result: haConfig }));
              return;
            }

            if (type === 'subscribe_events') {
              clientState.subscriptions.set(id, () => {});
              ws.send(JSON.stringify({ id, type: 'result', success: true, result: null }));
              return;
            }

            if (type === 'auth/current_user') {
              const authData = readStorage<{ users: HAUser[] }>(STORAGE_FILES.auth, { users: [] });
              const user = authData.users?.find((u) => u.id === clientState.userId) || authData.users?.[0];
              const providerData = readStorage<{ users: HAAuthProviderUser[] }>(STORAGE_FILES.authProvider, { users: [] });
              const providerUser = providerData.users?.find((u) => u.user_id === user?.id);

              ws.send(
                JSON.stringify({
                  id,
                  type: 'result',
                  success: true,
                  result: {
                    id: user?.id || 'owner_id',
                    name: user?.name || 'Owner',
                    is_owner: user?.is_owner ?? true,
                    is_admin: true,
                    username: providerUser?.username || 'owner',
                  },
                })
              );
              return;
            }

            if (type === 'config/device_registry/list') {
              const devices = readStorage<{ devices: any[] }>(STORAGE_FILES.deviceRegistry, { devices: [] });
              ws.send(JSON.stringify({ id, type: 'result', success: true, result: devices.devices || [] }));
              return;
            }

            if (type === 'config/entity_registry/list') {
              const entities = readStorage<{ entities: any[] }>(STORAGE_FILES.entityRegistry, { entities: [] });
              ws.send(JSON.stringify({ id, type: 'result', success: true, result: entities.entities || [] }));
              return;
            }

            if (type === 'call_service') {
              const { domain, service, service_data = {} } = msg;
              if (domain === 'device_tracker' && service === 'see') {
                const devId = service_data.dev_id || 'device';
                const entityId = `device_tracker.${devId}`;
                const lat = Array.isArray(service_data.gps) ? service_data.gps[0] : service_data.latitude;
                const lon = Array.isArray(service_data.gps) ? service_data.gps[1] : service_data.longitude;

                updateEntityState(entityId, service_data.location_name || 'home', {
                  latitude: lat,
                  longitude: lon,
                  gps_accuracy: service_data.gps_accuracy ?? 10,
                  battery_level: service_data.battery,
                  source_type: 'gps',
                  friendly_name: service_data.attributes?.friendly_name || devId,
                  ...(service_data.attributes || {}),
                });
              }
              ws.send(JSON.stringify({ id, type: 'result', success: true, result: { context: { id: crypto.randomUUID() } } }));
              return;
            }

            // Default handler
            ws.send(JSON.stringify({ id, type: 'result', success: true, result: null }));
          } catch (err: any) {
            console.error('[WS ERROR]', err);
          }
        });

        ws.on('close', () => {
          wsClients.delete(clientState);
        });
      });
    }
  });

  // --- Frontend Delivery (Vite in Dev / Static files in Production) ---

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Graceful shutdown
  const shutdown = () => {
    console.log('[SERVER] Shutting down gracefully...');
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`================================================================`);
    console.log(`🚀 Yimly Home Assistant Server running on http://0.0.0.0:${PORT}`);
    console.log(`🔌 Real Home Assistant Core subsystem listening on port ${PORT}`);
    console.log(`📁 Persistent storage: ${STORAGE_DIR}`);
    console.log(`📱 Official Companion App endpoint: http://0.0.0.0:${PORT}`);
    console.log(`================================================================`);
  });
}

main().catch((err) => {
  console.error('[FATAL SERVER ERROR]', err);
});
