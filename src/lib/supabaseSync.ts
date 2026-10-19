import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase';
import { 
  Plugin, 
  PluginVersion,
  PlatformStats, 
  GlobalSiteConfig, 
  ImpressumData,
  ConnectedWebsite, 
  SupabaseSyncConfig, 
  SyncEventLog 
} from '../types';

const STORAGE_KEY_SUPABASE_CONFIG = 'exp_supabase_config_v2';
const STORAGE_KEY_SITE_CONFIG = 'exp_global_site_config_v2';
const STORAGE_KEY_CONNECTED_SITES = 'exp_connected_sites_v2';
const STORAGE_KEY_SYNC_LOGS = 'exp_sync_logs_v2';

export const DEFAULT_SUPABASE_CONFIG: SupabaseSyncConfig = {
  url: SUPABASE_URL || '',
  anonKey: SUPABASE_ANON_KEY || '',
  autoSync: true,
  realtimeChannel: 'exp_fleet_realtime',
  isConnected: false,
  lastSyncTimestamp: null,
  syncMode: 'hybrid'
};

export const DEFAULT_IMPRESSUM: ImpressumData = {
  companyName: 'EXP-Plugins Collective',
  address: 'Musterstraße 123\n10115 Berlin\nDeutschland',
  email: 'support@exp-plugins.net',
  phone: '+49 30 12345678',
  taxId: 'DE123456789',
  authorizedRepresentative: 'Bent Diedrich',
  additionalInfo: 'Online-Service-Plattform für verifizierte Minecraft Server Software & Plugin Distribution.',
  disclaimerText: 'Haftung für Inhalte: Als Diensteanbieter sind wir gemäß § 7 Abs.1 TMG für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 TMG sind wir jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen.\n\nHaftung für Links: Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter verantwortlich.\n\nUrheberrecht & Marken: Die Inhalte auf diesen Seiten unterliegen dem deutschen Urheberrecht. Minecraft ist eine eingetragene Marke von Mojang Synergies AB / Microsoft. EXP-Plugins steht in keiner offiziellen Verbindung zu Mojang oder Microsoft.'
};

export const DEFAULT_GLOBAL_SITE_CONFIG: GlobalSiteConfig = {
  siteTitle: 'EXP-Plugins – Minecraft',
  siteSubtitle: 'Offizielle Plattform für verifizierte, hochperformante Minecraft-Plugins, Server-Addons und Community-Tools.',
  siteLogoUrl: '',
  announcement: {
    enabled: false,
    text: '',
    type: 'info',
    linkText: '',
    linkUrl: ''
  },
  maintenanceMode: false,
  maintenanceMessage: 'Wartungsarbeiten im Gange. Unser Netzwerk wird für Sie optimiert und ist in Kürze wieder erreichbar.',
  featuredPluginSlug: 'exp-economy',
  communityServerName: 'play.exp-plugins.net',
  heroBadgeText: '',
  heroBadgeColor: '#10b981',
  updatedAt: new Date().toISOString(),
  updatedBy: 'Central Admin Hub',
  impressum: DEFAULT_IMPRESSUM
};

export const INITIAL_CONNECTED_SITES: ConnectedWebsite[] = [
  {
    id: 'site-vercel-prod',
    name: 'Website 1: Öffentliche Vercel Website',
    type: 'public-vercel',
    url: 'https://exp-plugins.vercel.app',
    status: 'online',
    lastHeartbeat: new Date().toISOString(),
    latencyMs: 24,
    environment: 'production',
    enabled: true,
    notes: 'Hauptplattform für Endnutzer und Server-Administratoren.'
  },
  {
    id: 'site-ai-studio',
    name: 'Google AI Studio Live-Anwendung',
    type: 'google-ai-studio',
    url: typeof window !== 'undefined' ? window.location.origin : 'https://ais-preview.run.app',
    status: 'online',
    lastHeartbeat: new Date().toISOString(),
    latencyMs: 18,
    environment: 'preview',
    enabled: true,
    notes: 'Entwicklungs- & Testumgebung in Google Cloud Run.'
  },
  {
    id: 'site-website-b',
    name: 'Website B: Zukünftiges Staging / Drittanwendung',
    type: 'website-b',
    url: 'https://staging.exp-plugins.net',
    status: 'online',
    lastHeartbeat: new Date().toISOString(),
    latencyMs: 42,
    environment: 'staging',
    enabled: true,
    notes: 'Vorbereiteter Client für Multi-Tenant-Erweiterungen.'
  }
];

// Local BroadcastChannel for instant cross-tab / cross-window synchronization
let localBroadcastChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    localBroadcastChannel = new BroadcastChannel('exp_multi_site_sync_v2');
  }
} catch (e) {
  console.warn('BroadcastChannel not supported in this environment', e);
}

// Helper to detect if Supabase URL is properly configured with a live project (not a placeholder)
export function isConfiguredSupabaseUrl(url?: string): boolean {
  if (!url) return false;
  const trimmed = url.trim().toLowerCase();
  if (
    trimmed.includes('dein-projekt') || 
    trimmed.includes('your-project') || 
    trimmed.includes('placeholder') ||
    trimmed.includes('example.com')
  ) {
    return false;
  }
  return trimmed.startsWith('https://') && trimmed.includes('.supabase.co');
}

// Singleton Supabase Client Cache
let cachedSupabaseClient: SupabaseClient | null = null;
let currentClientUrl = '';
let currentClientKey = '';

export function getSupabaseClient(config?: SupabaseSyncConfig): SupabaseClient | null {
  const cfg = config || loadSupabaseConfig();
  if (!cfg.url || !cfg.anonKey || !isConfiguredSupabaseUrl(cfg.url)) return null;

  if (cachedSupabaseClient && currentClientUrl === cfg.url && currentClientKey === cfg.anonKey) {
    return cachedSupabaseClient;
  }

  try {
    cachedSupabaseClient = createClient(cfg.url, cfg.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      },
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    });
    currentClientUrl = cfg.url;
    currentClientKey = cfg.anonKey;
    return cachedSupabaseClient;
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err);
    return null;
  }
}

export function loadSupabaseConfig(): SupabaseSyncConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SUPABASE_CONFIG);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { 
        ...DEFAULT_SUPABASE_CONFIG, 
        ...parsed,
        url: parsed.url || SUPABASE_URL,
        anonKey: parsed.anonKey || SUPABASE_ANON_KEY
      };
    }
  } catch {
    // fallback
  }
  return DEFAULT_SUPABASE_CONFIG;
}

export function saveSupabaseConfig(config: SupabaseSyncConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY_SUPABASE_CONFIG, JSON.stringify(config));
    // Invalidate client cache on config change
    if (currentClientUrl !== config.url || currentClientKey !== config.anonKey) {
      cachedSupabaseClient = null;
    }
  } catch (e) {
    console.error('Could not save Supabase config to localStorage', e);
  }
}

// Deep normalizer to guarantee globalSiteConfig always satisfies GlobalSiteConfig interface
export function normalizeGlobalSiteConfig(raw: any): GlobalSiteConfig {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_GLOBAL_SITE_CONFIG };
  }

  const impressumData: ImpressumData = {
    companyName: raw.impressum?.companyName || DEFAULT_IMPRESSUM.companyName,
    address: raw.impressum?.address || DEFAULT_IMPRESSUM.address,
    email: raw.impressum?.email || DEFAULT_IMPRESSUM.email,
    phone: raw.impressum?.phone ?? DEFAULT_IMPRESSUM.phone,
    taxId: raw.impressum?.taxId ?? DEFAULT_IMPRESSUM.taxId,
    authorizedRepresentative: raw.impressum?.authorizedRepresentative ?? DEFAULT_IMPRESSUM.authorizedRepresentative,
    additionalInfo: raw.impressum?.additionalInfo ?? DEFAULT_IMPRESSUM.additionalInfo,
    disclaimerText: raw.impressum?.disclaimerText ?? DEFAULT_IMPRESSUM.disclaimerText
  };

  const rawAnnouncement = raw.announcement;
  const rawHtmlAnnouncement = typeof raw.announcementHtml === 'string' ? raw.announcementHtml : '';

  const announcement = {
    enabled: typeof rawAnnouncement?.enabled === 'boolean' 
      ? rawAnnouncement.enabled 
      : Boolean(rawHtmlAnnouncement.trim()),
    text: typeof rawAnnouncement?.text === 'string' 
      ? rawAnnouncement.text 
      : (rawHtmlAnnouncement.replace(/<[^>]*>?/gm, '') || ''),
    type: (['info', 'success', 'warning', 'alert'].includes(rawAnnouncement?.type) 
      ? rawAnnouncement.type 
      : 'info') as 'info' | 'success' | 'warning' | 'alert',
    linkText: typeof rawAnnouncement?.linkText === 'string' ? rawAnnouncement.linkText : '',
    linkUrl: typeof rawAnnouncement?.linkUrl === 'string' ? rawAnnouncement.linkUrl : ''
  };

  return {
    siteTitle: typeof raw.siteTitle === 'string' && raw.siteTitle.trim() ? raw.siteTitle : DEFAULT_GLOBAL_SITE_CONFIG.siteTitle,
    siteSubtitle: typeof raw.siteSubtitle === 'string' ? raw.siteSubtitle : DEFAULT_GLOBAL_SITE_CONFIG.siteSubtitle,
    siteLogoUrl: typeof raw.siteLogoUrl === 'string' ? raw.siteLogoUrl : undefined,
    announcement,
    maintenanceMode: Boolean(raw.maintenanceMode),
    maintenanceMessage: typeof raw.maintenanceMessage === 'string' && raw.maintenanceMessage.trim() 
      ? raw.maintenanceMessage 
      : DEFAULT_GLOBAL_SITE_CONFIG.maintenanceMessage,
    featuredPluginSlug: typeof raw.featuredPluginSlug === 'string' ? raw.featuredPluginSlug : DEFAULT_GLOBAL_SITE_CONFIG.featuredPluginSlug,
    communityServerName: typeof raw.communityServerName === 'string' ? raw.communityServerName : DEFAULT_GLOBAL_SITE_CONFIG.communityServerName,
    heroBadgeText: typeof raw.heroBadgeText === 'string' ? raw.heroBadgeText : DEFAULT_GLOBAL_SITE_CONFIG.heroBadgeText,
    heroBadgeColor: typeof raw.heroBadgeColor === 'string' ? raw.heroBadgeColor : DEFAULT_GLOBAL_SITE_CONFIG.heroBadgeColor,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    updatedBy: typeof raw.updatedBy === 'string' ? raw.updatedBy : 'Central Admin Hub',
    impressum: impressumData
  };
}

export function loadGlobalSiteConfig(): GlobalSiteConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SITE_CONFIG);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.heroBadgeText && typeof parsed.heroBadgeText === 'string' && parsed.heroBadgeText.toLowerCase().includes('netzwerk')) {
        parsed.heroBadgeText = '';
      }
      if (parsed.announcement?.text && typeof parsed.announcement.text === 'string' && parsed.announcement.text.toLowerCase().includes('live-netzwerk')) {
        parsed.announcement.enabled = false;
        parsed.announcement.text = '';
      }
      return normalizeGlobalSiteConfig(parsed);
    }
  } catch {
    // fallback
  }
  return { ...DEFAULT_GLOBAL_SITE_CONFIG };
}

export function saveGlobalSiteConfig(config: GlobalSiteConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY_SITE_CONFIG, JSON.stringify(config));
  } catch (e) {
    console.error('Could not save Global Site Config', e);
  }
}

export function loadConnectedSites(): ConnectedWebsite[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CONNECTED_SITES);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // fallback
  }
  return INITIAL_CONNECTED_SITES;
}

export function saveConnectedSites(sites: ConnectedWebsite[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_CONNECTED_SITES, JSON.stringify(sites));
  } catch (e) {
    console.error('Could not save connected sites', e);
  }
}

export function loadSyncLogs(): SyncEventLog[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SYNC_LOGS);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // fallback
  }
  return [];
}

export function appendSyncLog(log: Omit<SyncEventLog, 'id' | 'timestamp'>): SyncEventLog {
  const newLog: SyncEventLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: new Date().toISOString(),
    ...log
  };
  try {
    const logs = loadSyncLogs();
    const updated = [newLog, ...logs.slice(0, 49)];
    localStorage.setItem(STORAGE_KEY_SYNC_LOGS, JSON.stringify(updated));
  } catch (e) {
    console.error('Could not save sync log', e);
  }
  return newLog;
}

// Broadcast message types for Real-Time synchronization
export interface RealtimeBroadcastPayload {
  type: 'CONFIG_UPDATED' | 'PLUGINS_UPDATED' | 'STATS_UPDATED' | 'REMOTE_COMMAND' | 'HEARTBEAT';
  senderSiteId: string;
  senderName: string;
  timestamp: string;
  payload: any;
}

export function broadcastLocalSyncMessage(message: RealtimeBroadcastPayload): void {
  if (localBroadcastChannel) {
    try {
      localBroadcastChannel.postMessage(message);
    } catch (e) {
      console.warn('Failed to postMessage to local BroadcastChannel', e);
    }
  }
}

export function subscribeToLocalSync(handler: (message: RealtimeBroadcastPayload) => void): () => void {
  if (!localBroadcastChannel) return () => {};
  
  const listener = (event: MessageEvent<RealtimeBroadcastPayload>) => {
    if (event.data && event.data.type) {
      handler(event.data);
    }
  };

  localBroadcastChannel.addEventListener('message', listener);
  return () => {
    localBroadcastChannel?.removeEventListener('message', listener);
  };
}

// Full Supabase Realtime Publisher & Listener
export async function pushToSupabaseRealtime(
  type: RealtimeBroadcastPayload['type'],
  data: any,
  senderId = 'admin-hub'
): Promise<{ success: boolean; message: string }> {
  const broadcastPayload: RealtimeBroadcastPayload = {
    type,
    senderSiteId: senderId,
    senderName: senderId === 'admin-hub' ? 'Zentrales Admin-Dashboard' : 'Website Client',
    timestamp: new Date().toISOString(),
    payload: data
  };

  // 1. Instant local broadcast (cross-tab sync)
  broadcastLocalSyncMessage(broadcastPayload);

  // 2. Supabase Realtime Broadcast & Postgres Sync if configured
  const supabase = getSupabaseClient();
  if (!supabase) {
    appendSyncLog({
      source: 'Lokal (BroadcastChannel)',
      action: type as any,
      details: `Gesendet an lokale Tabs & Fenster (${Object.keys(data || {}).length} Felder)`,
      syncedTo: ['Website 1 (Vercel)', 'Google AI Studio']
    });
    return { 
      success: true, 
      message: 'Lokal in Echtzeit synchronisiert. Hinterlege Supabase URL & Anon Key für globale Multi-Domain Verteilung.' 
    };
  }

  try {
    // Broadcast via Supabase Realtime Channel
    const channel = supabase.channel('exp_fleet_realtime');
    await channel.send({
      type: 'broadcast',
      event: 'fleet_sync',
      payload: broadcastPayload
    });

    // Also persist in Postgres table if available
    if (type === 'CONFIG_UPDATED') {
      await supabase.from('exp_app_configs').upsert({
        id: 'global',
        site_target: 'all',
        config_data: data,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' }).select();
    } else if (type === 'STATS_UPDATED') {
      await supabase.from('exp_app_configs').upsert({
        id: 'platform_stats',
        site_target: 'all',
        config_data: data,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' }).select();
    }

    appendSyncLog({
      source: 'Supabase Realtime Cloud',
      action: type as any,
      details: `Erfolgreich verteilt über Supabase Realtime an alle verbundenen Websites`,
      syncedTo: ['Website 1 (Vercel)', 'Google AI Studio', 'Website B (Staging)']
    });

    return { 
      success: true, 
      message: 'Erfolgreich in Echtzeit über Supabase an alle Websites & Anwendungen gesendet!' 
    };
  } catch (err: any) {
    console.error('Supabase broadcast error:', err);
    appendSyncLog({
      source: 'Supabase Sync Fehler',
      action: type as any,
      details: `Fehler: ${err.message || 'Unbekannter Fehler'}`,
      syncedTo: ['Lokal synchronisiert']
    });
    return { 
      success: false, 
      message: `Fehler bei Supabase Synchronisation: ${err.message}` 
    };
  }
}

// SQL Setup Script for Supabase SQL Editor
export const SUPABASE_SETUP_SQL_SCRIPT = `-- ==============================================================================
-- EXP-Plugins: Supabase Zentrale Datenbank & Echtzeit-Replikation
-- Führe dieses SQL-Skript im Supabase Dashboard unter "SQL Editor" aus.
-- ==============================================================================

-- 1. Tabelle für globale Konfigurationen & Live-Texte aller Websites
CREATE TABLE IF NOT EXISTS public.exp_app_configs (
    id TEXT PRIMARY KEY,
    site_target TEXT DEFAULT 'all',
    config_data JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Tabelle für Plugins & Versionen
CREATE TABLE IF NOT EXISTS public.exp_plugins (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    short_description TEXT,
    description TEXT,
    hero_image_url TEXT,
    author_name TEXT,
    status TEXT DEFAULT 'published',
    download_count INTEGER DEFAULT 0,
    rating_avg NUMERIC DEFAULT 5.0,
    rating_count INTEGER DEFAULT 0,
    tags JSONB DEFAULT '[]'::jsonb,
    versions JSONB DEFAULT '[]'::jsonb,
    screenshots JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. Tabelle für verbundene Websites & Clients (Fleet Management)
CREATE TABLE IF NOT EXISTS public.exp_connected_sites (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    url TEXT,
    status TEXT DEFAULT 'online',
    last_heartbeat TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    latency_ms INTEGER DEFAULT 0,
    environment TEXT DEFAULT 'production',
    enabled BOOLEAN DEFAULT TRUE,
    notes TEXT
);

-- 4. Tabelle für Community-Bewertungen
CREATE TABLE IF NOT EXISTS public.exp_ratings (
    id TEXT PRIMARY KEY,
    plugin_id TEXT NOT NULL REFERENCES public.exp_plugins(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    helpful_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 5. Tabelle für Benutzer-Downloads & zentrales 5-Minuten Rate-Limiting
CREATE TABLE IF NOT EXISTS public.exp_user_downloads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    user_email TEXT,
    plugin_id TEXT NOT NULL,
    version_id TEXT NOT NULL,
    downloaded_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_exp_user_downloads_cooldown 
ON public.exp_user_downloads (user_id, downloaded_at DESC);

-- 6. Tabelle für Cloudflare R2 Nutzung & 0€ Hard-Cap Kostenschutz (10GB Free Quota)
CREATE TABLE IF NOT EXISTS public.exp_r2_usage (
    id TEXT PRIMARY KEY DEFAULT 'current',
    used_storage_bytes BIGINT DEFAULT 0,
    class_a_operations BIGINT DEFAULT 0,
    class_b_operations BIGINT DEFAULT 0,
    emergency_lock BOOLEAN DEFAULT FALSE,
    month_key TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 7. Serverseitige Funktion zur 5-Minuten Download-Sperren-Validierung
CREATE OR REPLACE FUNCTION public.check_and_register_download(
    p_user_id TEXT,
    p_user_email TEXT,
    p_plugin_id TEXT,
    p_version_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_last_download TIMESTAMPTZ;
    v_seconds_elapsed NUMERIC;
    v_wait_seconds INT;
BEGIN
    -- Prüfe ob innerhalb der letzten 5 Minuten (300 Sekunden) bereits geladen wurde
    SELECT downloaded_at INTO v_last_download
    FROM public.exp_user_downloads
    WHERE user_id = p_user_id
    ORDER BY downloaded_at DESC
    LIMIT 1;

    IF v_last_download IS NOT NULL THEN
        v_seconds_elapsed := EXTRACT(EPOCH FROM (NOW() - v_last_download));
        IF v_seconds_elapsed < 300 THEN
            v_wait_seconds := CEIL(300 - v_seconds_elapsed);
            RETURN jsonb_build_object(
                'allowed', false,
                'wait_seconds', v_wait_seconds,
                'error_code', 'RATE_LIMITED'
            );
        END IF;
    END IF;

    -- Download serverseitig registrieren
    INSERT INTO public.exp_user_downloads (user_id, user_email, plugin_id, version_id, downloaded_at)
    VALUES (p_user_id, p_user_email, p_plugin_id, p_version_id, NOW());

    -- Download-Zähler des Plugins atomar erhöhen
    UPDATE public.exp_plugins
    SET download_count = COALESCE(download_count, 0) + 1
    WHERE id = p_plugin_id;

    RETURN jsonb_build_object(
        'allowed', true,
        'wait_seconds', 0
    );
END;
$$;

-- 8. Row Level Security (RLS) aktivieren & Policies erstellen
ALTER TABLE public.exp_app_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exp_plugins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exp_connected_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exp_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exp_user_downloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exp_r2_usage ENABLE ROW LEVEL SECURITY;

-- Öffentliche Lese-Berechtigung für alle Webseiten
CREATE POLICY "Public Read All App Configs" ON public.exp_app_configs FOR SELECT USING (true);
CREATE POLICY "Public Read All Plugins" ON public.exp_plugins FOR SELECT USING (true);
CREATE POLICY "Public Read All Sites" ON public.exp_connected_sites FOR SELECT USING (true);
CREATE POLICY "Public Read All Ratings" ON public.exp_ratings FOR SELECT USING (true);
CREATE POLICY "Public Read All Downloads" ON public.exp_user_downloads FOR SELECT USING (true);
CREATE POLICY "Public Read R2 Usage" ON public.exp_r2_usage FOR SELECT USING (true);

-- Schreibrechte für Anon / Authentifizierte Clients & Admin Dashboard
CREATE POLICY "Allow All Insert/Update Configs" ON public.exp_app_configs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow All Insert/Update Plugins" ON public.exp_plugins FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow All Insert/Update Sites" ON public.exp_connected_sites FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow All Insert/Update Ratings" ON public.exp_ratings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow All Insert/Update Downloads" ON public.exp_user_downloads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow All Insert/Update R2 Usage" ON public.exp_r2_usage FOR ALL USING (true) WITH CHECK (true);

-- 9. ECHTZEIT-REPLIKATION (Supabase Realtime Publication) aktivieren
-- Ermöglicht Sub-Sekunden Push-Benachrichtigungen auf Websites ohne Page-Reload!
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.exp_app_configs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.exp_plugins;
ALTER PUBLICATION supabase_realtime ADD TABLE public.exp_connected_sites;
ALTER PUBLICATION supabase_realtime ADD TABLE public.exp_ratings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.exp_user_downloads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.exp_r2_usage;

-- ==============================================================================
-- Fertig! Alle Tabellen und Echtzeitkanäle sind nun betriebsbereit.
-- ==============================================================================
`;

export function normalizePlugin(raw: any): Plugin {
  if (!raw || typeof raw !== 'object') {
    return {
      id: `plugin-${Date.now()}`,
      slug: `plugin-${Date.now()}`,
      name: 'Plugin',
      short_description: '',
      description: '',
      author_id: 'exp-studios',
      author_name: 'EXP Studios',
      hero_image_url: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=600&auto=format&fit=crop&q=80',
      status: 'published',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      download_count: 0,
      rating_avg: 5.0,
      rating_count: 0,
      requirements: 'Java 21+',
      tags: [],
      screenshots: [],
      versions: [{
        id: 'v-1.0.0',
        plugin_id: 'plugin',
        title: 'Plugin v1.0.0',
        description: 'Offizielle Version',
        version_number: '1.0.0',
        minecraft_versions: ['1.21', '1.21.4', '26.1'],
        mod_loaders: ['Paper', 'Spigot', 'Bukkit'],
        release_notes: '',
        file_url: '',
        jar_name: 'Plugin-1.0.0.jar',
        file_size_mb: 1.5,
        is_prerelease: false,
        download_count: 0,
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }]
    };
  }

  const id = String(raw.id || `plugin-${Date.now()}`);
  const slug = String(raw.slug || id);
  const name = String(raw.name || 'Neues Plugin');
  const short_description = String(raw.short_description || raw.shortDescription || '');
  const description = String(raw.description || '');
  const author_name = String(raw.author_name || raw.authorName || 'EXP Studios');
  const hero_image_url = String(raw.hero_image_url || raw.heroImageUrl || 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=600&auto=format&fit=crop&q=80');
  const status = raw.status === 'draft' ? 'draft' : 'published';
  const download_count = typeof raw.download_count === 'number' && !isNaN(raw.download_count) ? raw.download_count : (typeof raw.downloadCount === 'number' && !isNaN(raw.downloadCount) ? raw.downloadCount : 0);
  const rating_avg = typeof raw.rating_avg === 'number' && !isNaN(raw.rating_avg) ? raw.rating_avg : (typeof raw.ratingAvg === 'number' && !isNaN(raw.ratingAvg) ? raw.ratingAvg : 5.0);
  const rating_count = typeof raw.rating_count === 'number' && !isNaN(raw.rating_count) ? raw.rating_count : (typeof raw.ratingCount === 'number' && !isNaN(raw.ratingCount) ? raw.ratingCount : 0);
  const tags = Array.isArray(raw.tags) ? raw.tags.filter((t: any) => typeof t === 'string') : [];
  const screenshots = Array.isArray(raw.screenshots) ? raw.screenshots.filter((s: any) => typeof s === 'string') : [];
  
  let versions: PluginVersion[] = [];
  if (Array.isArray(raw.versions) && raw.versions.length > 0) {
    versions = raw.versions
      .filter((v: any) => v && typeof v === 'object')
      .map((v: any) => ({
        id: String(v.id || `v-${v.version_number || v.versionNumber || '1.0.0'}-${Math.random().toString(36).substring(2, 7)}`),
        plugin_id: id,
        title: String(v.title || `${name} v${v.version_number || v.versionNumber || '1.0.0'}`),
        description: String(v.description || ''),
        version_number: String(v.version_number || v.versionNumber || '1.0.0'),
        minecraft_version: String(v.minecraft_version || v.minecraftVersion || (Array.isArray(v.minecraft_versions || v.minecraftVersions) ? (v.minecraft_versions || v.minecraftVersions)[0] : '1.21.11')),
        minecraft_versions: Array.isArray(v.minecraft_versions || v.minecraftVersions) ? (v.minecraft_versions || v.minecraftVersions) : [v.minecraft_version || '1.21.11'],
        mod_loader: String(v.mod_loader || v.loader || (Array.isArray(v.mod_loaders || v.modLoaders) ? (v.mod_loaders || v.modLoaders)[0] : 'Paper')),
        mod_loaders: Array.isArray(v.mod_loaders || v.modLoaders) ? (v.mod_loaders || v.modLoaders) : [v.loader || 'Paper'],
        release_notes: String(v.release_notes || v.releaseNotes || ''),
        file_url: String(v.file_url || v.downloadUrl || v.fileUrl || ''),
        jar_name: String(v.jar_name || v.jarName || `${name.replace(/\s+/g, '')}.jar`),
        file_size_mb: typeof v.file_size_mb === 'number' && !isNaN(v.file_size_mb) ? v.file_size_mb : (typeof v.fileSizeMb === 'number' ? v.fileSizeMb : 1.2),
        cloudflare_key: typeof (v.cloudflare_key || v.cloudflareKey) === 'string' ? (v.cloudflare_key || v.cloudflareKey) : undefined,
        upload_date: String(v.upload_date || v.uploadDate || v.published_at || v.publishedAt || new Date().toISOString()),
        is_prerelease: Boolean(v.is_prerelease || v.isPrerelease),
        download_count: typeof v.download_count === 'number' && !isNaN(v.download_count) ? v.download_count : 0,
        published_at: String(v.published_at || v.publishedAt || new Date().toISOString()),
        updated_at: String(v.updated_at || v.updatedAt || new Date().toISOString())
      }));
  }
  
  if (versions.length === 0) {
    const verNum = String(raw.version || '1.0.0');
    versions = [{
      id: `v-${verNum}`,
      plugin_id: id,
      title: `${name} v${verNum}`,
      description: 'Stabile offizielle Version',
      version_number: verNum,
      minecraft_versions: ['1.21', '1.21.1', '1.21.4', '26.1'],
      mod_loaders: ['Paper', 'Spigot', 'Bukkit'],
      file_url: String(raw.downloadUrl || raw.download_url || ''),
      jar_name: `${name.replace(/\s+/g, '')}-${verNum}.jar`,
      file_size_mb: 1.5,
      is_prerelease: false,
      download_count: download_count,
      published_at: String(raw.created_at || new Date().toISOString()),
      updated_at: String(raw.updated_at || new Date().toISOString())
    }];
  }

  return {
    id,
    slug,
    name,
    short_description,
    description,
    author_id: raw.author_id || 'exp-studios',
    author_name,
    hero_image_url,
    status,
    created_at: raw.created_at || new Date().toISOString(),
    updated_at: raw.updated_at || new Date().toISOString(),
    download_count,
    rating_avg,
    rating_count,
    requirements: raw.requirements || 'Java 21+',
    tags,
    screenshots,
    versions
  };
}
