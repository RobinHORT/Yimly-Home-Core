/**
 * Native Home Assistant Core Authentication Service
 * Implements standard Home Assistant OAuth2 & Auth Flow
 * Compatible with the official Home Assistant Companion App and Web Frontend
 */

export interface HassTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
  ha_url?: string;
}

export interface HassCurrentUser {
  id: string;
  name: string;
  username: string | null;
  is_admin: boolean;
  is_owner: boolean;
}

const STORAGE_KEY = 'yimly_ha_auth_tokens';

class HassAuthService {
  private tokens: HassTokens | null = null;
  private currentUser: HassCurrentUser | null = null;

  constructor() {
    this.loadStoredTokens();
  }

  /**
   * Load existing Home Assistant tokens from persistent local storage
   */
  private loadStoredTokens(): HassTokens | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.tokens = JSON.parse(raw);
        return this.tokens;
      }
    } catch (e) {
      console.warn('[HASS AUTH] Failed to load stored tokens', e);
      localStorage.removeItem(STORAGE_KEY);
    }
    this.tokens = null;
    return null;
  }

  /**
   * Save valid Home Assistant tokens
   */
  public saveTokens(tokens: HassTokens) {
    if (tokens.expires_in && !tokens.expires_at) {
      tokens.expires_at = Date.now() + tokens.expires_in * 1000 - 60000; // 1 min buffer
    }
    this.tokens = tokens;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  }

  /**
   * Clear all Home Assistant session tokens
   */
  public clearTokens() {
    this.tokens = null;
    this.currentUser = null;
    localStorage.removeItem(STORAGE_KEY);
  }

  public getAccessToken(): string | null {
    return this.tokens?.access_token || null;
  }

  public getRefreshToken(): string | null {
    return this.tokens?.refresh_token || null;
  }

  public getTokens(): HassTokens | null {
    return this.tokens;
  }

  public getCurrentUser(): HassCurrentUser | null {
    return this.currentUser;
  }

  public setCurrentUser(user: HassCurrentUser | null) {
    this.currentUser = user;
  }

  public hasStoredAuth(): boolean {
    return Boolean(this.tokens?.access_token);
  }

  /**
   * Step 1: Check Home Assistant Onboarding State
   * (Whether this HA instance already has users configured in .storage/core.auth)
   */
  public async checkOnboardingStatus(): Promise<{ needsOnboarding: boolean }> {
    try {
      const res = await fetch('/api/onboarding');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const userStep = data.find((s) => s.step === 'user');
          if (userStep && !userStep.done) {
            return { needsOnboarding: true };
          }
        }
      }
    } catch (e) {
      console.warn('[HASS AUTH] Onboarding check failed, assuming standard auth:', e);
    }
    return { needsOnboarding: false };
  }

  /**
   * Step 1b: Create First Home Assistant Owner Account (if HA instance is brand new)
   * Calls native Home Assistant /api/onboarding/users
   */
  public async createOnboardingUser(params: {
    name: string;
    username: string;
    password: string;
  }): Promise<HassTokens> {
    const clientId = `${window.location.origin}/`;
    const res = await fetch('/api/onboarding/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        name: params.name,
        username: params.username,
        password: params.password,
        language: 'en',
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Onboarding failed with status ${res.status}`);
    }

    const data = await res.json();
    if (!data.auth_code) {
      throw new Error('No authorization code returned from Home Assistant onboarding');
    }

    // Exchange auth code for real tokens
    return await this.exchangeAuthCode(data.auth_code);
  }

  /**
   * Native Home Assistant Authentication Flow
   * Step 1: Start login flow at /auth/login_flow
   * Step 2: Submit credentials to /auth/login_flow/{flow_id}
   * Step 3: Exchange authorization code at /auth/token
   */
  public async loginWithCredentials(
    username: string,
    password: string,
    oauthOptions?: { clientId?: string; redirectUri?: string; state?: string }
  ): Promise<HassTokens | { redirected: boolean; authCode: string }> {
    const clientId = oauthOptions?.clientId || `${window.location.origin}/`;
    const redirectUri = oauthOptions?.redirectUri || `${window.location.origin}/?auth_callback=1`;

    // 1. Initialize Login Flow with real Home Assistant Core
    const initRes = await fetch('/auth/login_flow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        handler: ['homeassistant', null],
        redirect_uri: redirectUri,
      }),
    });

    if (!initRes.ok) {
      const err = await initRes.json().catch(() => ({}));
      throw new Error(err.message || `Failed to initiate Home Assistant login flow (HTTP ${initRes.status})`);
    }

    const initData = await initRes.json();
    const flowId = initData.flow_id;

    if (!flowId) {
      throw new Error('Home Assistant Core did not return a valid auth flow_id');
    }

    // 2. Submit Username & Password to Home Assistant auth provider
    const stepRes = await fetch(`/auth/login_flow/${flowId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: username.trim(),
        password: password,
      }),
    });

    if (!stepRes.ok) {
      const err = await stepRes.json().catch(() => ({}));
      throw new Error(err.message || `Auth step failed with HTTP ${stepRes.status}`);
    }

    const stepData = await stepRes.json();

    if (stepData.type === 'form' && stepData.errors) {
      if (stepData.errors.base === 'invalid_auth') {
        throw new Error('Invalid Home Assistant username or password.');
      }
      throw new Error(
        `Home Assistant authentication error: ${Object.values(stepData.errors).join(', ')}`
      );
    }

    if (stepData.type !== 'create_entry' || !stepData.result) {
      throw new Error('Authentication was not completed by Home Assistant Core.');
    }

    const authCode = stepData.result;

    // If this is an external OAuth flow (e.g. from Companion App webview)
    if (oauthOptions?.redirectUri && !oauthOptions.redirectUri.includes('auth_callback=1')) {
      const targetUrl = new URL(oauthOptions.redirectUri);
      targetUrl.searchParams.set('code', authCode);
      if (oauthOptions.state) {
        targetUrl.searchParams.set('state', oauthOptions.state);
      }
      window.location.href = targetUrl.toString();
      return { redirected: true, authCode };
    }

    // 3. Exchange auth code for real Home Assistant session tokens
    return await this.exchangeAuthCode(authCode);
  }

  /**
   * Exchange Home Assistant OAuth2 Auth Code for real access and refresh tokens
   */
  public async exchangeAuthCode(authCode: string): Promise<HassTokens> {
    const clientId = `${window.location.origin}/`;
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', authCode);
    params.append('client_id', clientId);

    const tokenRes = await fetch('/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}));
      throw new Error(err.error_description || err.error || `Token exchange failed (HTTP ${tokenRes.status})`);
    }

    const tokenData = await tokenRes.json();
    const tokens: HassTokens = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in || 1800,
      token_type: tokenData.token_type || 'Bearer',
      expires_at: Date.now() + (tokenData.expires_in || 1800) * 1000 - 60000,
    };

    this.saveTokens(tokens);
    return tokens;
  }

  /**
   * Authenticate using a Home Assistant Long-Lived Access Token (LLAT)
   */
  public async loginWithLongLivedToken(token: string): Promise<HassTokens> {
    const cleanToken = token.trim();
    // Validate token against real Home Assistant REST endpoint
    const res = await fetch('/api/states', {
      headers: {
        Authorization: `Bearer ${cleanToken}`,
      },
    });

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('Invalid Long-Lived Access Token. Please check token permissions.');
      }
      throw new Error(`Token validation returned HTTP ${res.status}`);
    }

    const tokens: HassTokens = {
      access_token: cleanToken,
      token_type: 'Bearer',
    };

    this.saveTokens(tokens);
    return tokens;
  }

  /**
   * Refresh Home Assistant access token using the real refresh token
   */
  public async refreshAccessToken(): Promise<string | null> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      return null;
    }

    const clientId = `${window.location.origin}/`;
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken);
    params.append('client_id', clientId);

    try {
      const res = await fetch('/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.access_token) {
          const updated: HassTokens = {
            ...this.tokens!,
            access_token: data.access_token,
            expires_in: data.expires_in || 1800,
            expires_at: Date.now() + (data.expires_in || 1800) * 1000 - 60000,
          };
          this.saveTokens(updated);
          return data.access_token;
        }
      } else {
        console.warn('[HASS AUTH] Refresh token rejected by HA Core:', res.status);
        this.clearTokens();
      }
    } catch (e) {
      console.warn('[HASS AUTH] Refresh token network error:', e);
    }

    return null;
  }

  /**
   * Verify whether the current session is valid against Home Assistant Core
   */
  public async validateCurrentSession(): Promise<boolean> {
    if (!this.tokens?.access_token) {
      return false;
    }

    // If token is close to expiry and we have a refresh token, refresh it
    if (this.tokens.expires_at && Date.now() > this.tokens.expires_at && this.tokens.refresh_token) {
      const newTok = await this.refreshAccessToken();
      if (!newTok) return false;
    }

    try {
      const res = await fetch('/api/states', {
        headers: {
          Authorization: `Bearer ${this.tokens.access_token}`,
        },
      });

      if (res.ok) {
        return true;
      }
      if (res.status === 401 && this.tokens.refresh_token) {
        // Try one refresh attempt
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          const retry = await fetch('/api/states', {
            headers: { Authorization: `Bearer ${refreshed}` },
          });
          return retry.ok;
        }
      }
    } catch (e) {
      console.warn('[HASS AUTH] Session validation network error:', e);
    }

    return false;
  }

  /**
   * Real Logout: Revokes refresh token in Home Assistant Core and clears storage
   */
  public async logout(): Promise<void> {
    const refreshToken = this.getRefreshToken();
    if (refreshToken) {
      try {
        const params = new URLSearchParams();
        params.append('action', 'revoke');
        params.append('token', refreshToken);

        await fetch('/auth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        });
      } catch (e) {
        console.warn('[HASS AUTH] Token revoke error on logout:', e);
      }
    }

    this.clearTokens();
  }
}

export const hassAuth = new HassAuthService();
