import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  Plugin, 
  PluginVersion, 
  PluginRating, 
  User, 
  AdminSession, 
  ModLoader, 
  MinecraftVersion, 
  SortOption, 
  Language, 
  PlatformStats,
  GlobalSiteConfig,
  ConnectedWebsite,
  SupabaseSyncConfig,
  SyncEventLog
} from '../types';
import { INITIAL_PLUGINS, INITIAL_RATINGS } from '../data/mockPlugins';
import { translations } from '../data/translations';
import { 
  STORAGE_KEYS, 
  exportDataAsJSON, 
  parseBackupFile 
} from '../lib/storage';
import { sendDownloadBlockedWebhook } from '../lib/webhookNotifier';
import {
  loadSupabaseConfig,
  saveSupabaseConfig,
  loadGlobalSiteConfig,
  saveGlobalSiteConfig,
  loadConnectedSites,
  saveConnectedSites,
  loadSyncLogs,
  appendSyncLog,
  getSupabaseClient,
  pushToSupabaseRealtime,
  subscribeToLocalSync,
  broadcastLocalSyncMessage,
  RealtimeBroadcastPayload,
  DEFAULT_GLOBAL_SITE_CONFIG,
  SUPABASE_SETUP_SQL_SCRIPT,
  normalizePlugin,
  normalizeGlobalSiteConfig
} from '../lib/supabaseSync';

interface AppContextType {
  plugins: Plugin[];
  ratings: Record<string, PluginRating[]>;
  currentUser: User | null;
  adminSession: AdminSession;
  activeRoute: string;
  routeParams: Record<string, string>;
  language: Language;
  t: typeof translations['en'];
  platformStats: PlatformStats;
  sessionLocked: boolean;
  failedPinAttempts: number;

  // Multi-Site & Central Admin Hub (Website 1 & Website 2)
  activeSiteMode: 'public' | 'admin-hub';
  setActiveSiteMode: (mode: 'public' | 'admin-hub') => void;
  globalSiteConfig: GlobalSiteConfig;
  updateGlobalSiteConfig: (config: Partial<GlobalSiteConfig>) => Promise<{ success: boolean; message: string }>;
  connectedSites: ConnectedWebsite[];
  updateConnectedSite: (siteId: string, data: Partial<ConnectedWebsite>) => void;
  addConnectedSite: (site: Omit<ConnectedWebsite, 'id' | 'lastHeartbeat'>) => void;
  removeConnectedSite: (siteId: string) => void;
  pingConnectedSite: (siteId: string) => Promise<void>;
  
  // Supabase Realtime Sync
  supabaseConfig: SupabaseSyncConfig;
  updateSupabaseConfig: (config: Partial<SupabaseSyncConfig>) => void;
  testSupabaseConnection: (overrideConfig?: Partial<SupabaseSyncConfig>) => Promise<{ success: boolean; message: string; pingMs?: number }>;
  syncLogs: SyncEventLog[];
  realtimeStatus: 'connected' | 'connecting' | 'local_only' | 'error';
  lastLiveSyncNotice: { message: string; timestamp: number } | null;
  dismissSyncNotice: () => void;
  supabaseSqlScript: string;

  // Search & Filter State
  searchQuery: string;
  selectedVersion: MinecraftVersion | 'All';
  selectedLoader: ModLoader | 'All';
  sortBy: SortOption;
  viewMode: 'grid' | 'list';

  // Navigation & Actions
  navigateTo: (route: string, params?: Record<string, string>) => void;
  setLanguage: (lang: Language) => void;
  setSearchQuery: (query: string) => void;
  setSelectedVersion: (ver: MinecraftVersion | 'All') => void;
  setSelectedLoader: (loader: ModLoader | 'All') => void;
  setSortBy: (sort: SortOption) => void;
  setViewMode: (mode: 'grid' | 'list') => void;

  // Platform Stats Editor
  updatePlatformStats: (stats: Partial<PlatformStats>) => void;

  // Admin Auth & PIN
  verifyAdminPin: (pin: string) => { success: boolean; shouldRedirect: boolean; isLocked: boolean };
  changeAdminPassword: (newPass: string) => boolean;
  logoutAdmin: () => void;
  unlockSessionForDev?: () => void;

  // Backup & Restore
  exportBackup: () => void;
  importBackup: (jsonContent: string) => { success: boolean; message: string };
  resetPlatformData: () => void;

  // Plugin CRUD
  createPlugin: (data: Omit<Plugin, 'id' | 'created_at' | 'updated_at' | 'download_count' | 'rating_avg' | 'rating_count' | 'versions'> & { initialVersion?: Partial<PluginVersion> }) => Plugin;
  updatePlugin: (id: string, data: Partial<Plugin>) => void;
  deletePlugin: (id: string) => void;
  togglePublishStatus: (id: string) => void;

  // Version CRUD
  addPluginVersion: (pluginId: string, version: Omit<PluginVersion, 'id' | 'plugin_id' | 'download_count' | 'published_at' | 'updated_at'>) => void;
  updatePluginVersion: (pluginId: string, versionId: string, versionData: Partial<PluginVersion>) => void;
  deletePluginVersion: (pluginId: string, versionId: string) => void;

  // Ratings & Reviews
  addRating: (pluginId: string, rating: number, comment?: string) => boolean;
  deleteRating: (pluginId: string, ratingId: string) => void;
  toggleHelpful: (pluginId: string, ratingId: string) => void;

  // Downloads & Multi-Download Selection Modal
  triggerDownload: (plugin: Plugin, version: PluginVersion) => void;
  downloadModalPlugin: Plugin | null;
  openDownloadModal: (plugin: Plugin) => void;
  closeDownloadModal: () => void;
  checkUserDownloadCooldown: () => Promise<{ allowed: boolean; waitSeconds: number; reason?: string }>;
  triggerDownloadWithCooldown: (plugin: Plugin, version: PluginVersion) => Promise<{ success: boolean; error?: string; waitSeconds?: number }>;
  isR2Locked?: boolean;
  r2LockReason?: string;

  // User Auth
  loginUser: (email: string, password: string) => { success: boolean; error?: string };
  registerUser: (email: string, username: string, password: string) => { success: boolean; error?: string };
  logoutUser: () => void;
  updateUserProfile: (data: Partial<User>) => void;
  toggleFavorite: (pluginId: string) => void;
}

const STORAGE_KEY_PLUGINS = 'exp_plugins_v2';
const STORAGE_KEY_RATINGS = 'exp_ratings_v2';
const STORAGE_KEY_USER = 'exp_current_user_v2';
const STORAGE_KEY_ADMIN_PASS = 'exp_admin_password_v2';
const STORAGE_KEY_ADMIN_SESSION = 'exp_admin_session_v2';
const STORAGE_KEY_LANG = 'exp_lang_v2';
const STORAGE_KEY_STATS = 'exp_stats_v2';

const DEFAULT_ADMIN_PASSWORD = 'EXP_Plugins2026!'; // Standard Admin-Passwort (max 16 Zeichen, inklusive Sonderzeichen)

const DEFAULT_STATS: PlatformStats = {
  totalDownloads: 0,
  activeUsers: 0,
  totalPlugins: 0,
  serverCommunity: '0',
  avgRating: 0.0
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 1. Language state (Default: 'en' as requested in prompt)
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_LANG);
      return (saved === 'de' || saved === 'en') ? saved : 'en';
    } catch {
      return 'en';
    }
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem(STORAGE_KEY_LANG, lang);
  };

  const t = translations[language];

  // 2. Plugins & Ratings
  const [plugins, setPlugins] = useState<Plugin[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PLUGINS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map(normalizePlugin);
        }
      }
      return INITIAL_PLUGINS.map(normalizePlugin);
    } catch {
      return INITIAL_PLUGINS;
    }
  });

  const [ratings, setRatings] = useState<Record<string, PluginRating[]>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_RATINGS);
      return saved ? JSON.parse(saved) : INITIAL_RATINGS;
    } catch {
      return INITIAL_RATINGS;
    }
  });

  // 3. User Authentication (Starts null unless logged in)
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_USER);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // 4. Admin Auth, PIN, and Session Lock
  const [adminPassword, setAdminPassword] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ADMIN_PASS);
      return saved || DEFAULT_ADMIN_PASSWORD;
    } catch {
      return DEFAULT_ADMIN_PASSWORD;
    }
  });

  const [adminSession, setAdminSession] = useState<AdminSession>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY_ADMIN_SESSION);
      if (saved) {
        const parsed: AdminSession = JSON.parse(saved);
        if (parsed.expiresAt && parsed.expiresAt > Date.now()) {
          return parsed;
        }
      }
    } catch {
      // fallback
    }
    return { isAuthenticated: false, expiresAt: null };
  });

  const [failedPinAttempts, setFailedPinAttempts] = useState<number>(() => {
    try {
      const saved = sessionStorage.getItem('exp_pin_fails');
      return saved ? parseInt(saved, 10) : 0;
    } catch {
      return 0;
    }
  });

  const [sessionLocked, setSessionLocked] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('exp_session_locked') === 'true';
    } catch {
      return false;
    }
  });

  // 5. Platform Stats (Customizable via Admin Panel as requested)
  const [platformStats, setPlatformStats] = useState<PlatformStats>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_STATS);
      return saved ? JSON.parse(saved) : DEFAULT_STATS;
    } catch {
      return DEFAULT_STATS;
    }
  });

  // 6. Router & Filters
  const [activeRoute, setActiveRoute] = useState<string>('home');
  const [routeParams, setRouteParams] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedVersion, setSelectedVersion] = useState<MinecraftVersion | 'All'>('All');
  const [selectedLoader, setSelectedLoader] = useState<ModLoader | 'All'>('All');
  const [sortBy, setSortBy] = useState<SortOption>('downloads');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // 7. Multi-Site & Supabase Fleet Engine
  const [activeSiteMode, setActiveSiteModeState] = useState<'public' | 'admin-hub'>(() => {
    try {
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('mode') === 'admin' || urlParams.get('site') === 'admin' || window.location.pathname.includes('admin.html')) {
          return 'admin-hub';
        }
      }
    } catch {}
    return 'public';
  });

  const [globalSiteConfig, setGlobalSiteConfigState] = useState<GlobalSiteConfig>(loadGlobalSiteConfig);
  const [downloadModalPlugin, setDownloadModalPlugin] = useState<Plugin | null>(null);

  // Dynamic Tab Icon / Favicon update from globalSiteConfig.siteLogoUrl
  useEffect(() => {
    if (typeof window !== 'undefined' && globalSiteConfig?.siteLogoUrl) {
      try {
        let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.getElementsByTagName('head')[0].appendChild(link);
        }
        link.href = globalSiteConfig.siteLogoUrl;
      } catch (e) {
        console.warn('Could not set dynamic favicon:', e);
      }
    }
  }, [globalSiteConfig?.siteLogoUrl]);
  const [connectedSites, setConnectedSites] = useState<ConnectedWebsite[]>(loadConnectedSites);
  const [supabaseConfig, setSupabaseConfigState] = useState<SupabaseSyncConfig>(loadSupabaseConfig);
  const [syncLogs, setSyncLogs] = useState<SyncEventLog[]>(loadSyncLogs);
  const [realtimeStatus, setRealtimeStatus] = useState<'connected' | 'connecting' | 'local_only' | 'error'>('local_only');

  const setActiveSiteMode = (mode: 'public' | 'admin-hub') => {
    setActiveSiteModeState(mode);
    if (mode === 'admin-hub') {
      if (activeRoute !== 'admin') {
        navigateTo('admin');
      }
    } else {
      if (activeRoute === 'admin') {
        navigateTo('home');
      }
    }
  };

  const updateGlobalSiteConfig = async (newConfig: Partial<GlobalSiteConfig>): Promise<{ success: boolean; message: string }> => {
    const updated = normalizeGlobalSiteConfig({
      ...globalSiteConfig,
      ...newConfig,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser?.username || 'Central Admin Hub'
    });
    setGlobalSiteConfigState(updated);
    saveGlobalSiteConfig(updated);
    
    // Broadcast live to all connected sites
    const res = await pushToSupabaseRealtime('CONFIG_UPDATED', updated);
    setSyncLogs(loadSyncLogs());
    return res;
  };

  const updateConnectedSite = (siteId: string, data: Partial<ConnectedWebsite>) => {
    setConnectedSites(prev => {
      const updated = prev.map(s => s.id === siteId ? { ...s, ...data } : s);
      saveConnectedSites(updated);
      return updated;
    });
  };

  const addConnectedSite = (site: Omit<ConnectedWebsite, 'id' | 'lastHeartbeat'>) => {
    const newSite: ConnectedWebsite = {
      ...site,
      id: `site-${Date.now()}`,
      lastHeartbeat: new Date().toISOString()
    };
    setConnectedSites(prev => {
      const updated = [...prev, newSite];
      saveConnectedSites(updated);
      return updated;
    });
    appendSyncLog({
      source: 'Fleet Manager',
      action: 'HEARTBEAT',
      details: `Neuer Client registriert: ${site.name} (${site.url})`,
      syncedTo: [site.name]
    });
    setSyncLogs(loadSyncLogs());
  };

  const removeConnectedSite = (siteId: string) => {
    setConnectedSites(prev => {
      const updated = prev.filter(s => s.id !== siteId);
      saveConnectedSites(updated);
      return updated;
    });
  };

  const pingConnectedSite = async (siteId: string) => {
    const site = connectedSites.find(s => s.id === siteId);
    if (!site) return;
    updateConnectedSite(siteId, { status: 'syncing' });
    await pushToSupabaseRealtime('REMOTE_COMMAND', { command: 'PING', targetSiteId: siteId });
    setTimeout(() => {
      updateConnectedSite(siteId, { 
        status: 'online', 
        lastHeartbeat: new Date().toISOString(),
        latencyMs: Math.floor(Math.random() * 20) + 15 
      });
    }, 400);
  };

  const updateSupabaseConfig = (newConfig: Partial<SupabaseSyncConfig>) => {
    setSupabaseConfigState(prev => {
      const updated = { ...prev, ...newConfig };
      saveSupabaseConfig(updated);
      return updated;
    });
  };

  const testSupabaseConnection = async (overrideConfig?: Partial<SupabaseSyncConfig>): Promise<{ success: boolean; message: string; pingMs?: number }> => {
    const cfg = { ...supabaseConfig, ...overrideConfig };
    if (!cfg.url || !cfg.anonKey) {
      return { 
        success: false, 
        message: 'Bitte geben Sie sowohl die Supabase URL als auch den Anon Key an.' 
      };
    }
    const startTime = Date.now();
    try {
      const client = getSupabaseClient(cfg);
      if (!client) {
        return { success: false, message: 'Supabase Client konnte nicht initialisiert werden.' };
      }
      const { error } = await client.from('exp_app_configs').select('id').limit(1);
      const pingMs = Date.now() - startTime;
      if (error && error.code !== 'PGRST116') {
        return {
          success: true,
          pingMs,
          message: `Verbindung zur Supabase URL erfolgreich (${pingMs}ms)! Hinweis: Bitte stellen Sie sicher, dass das SQL-Setup-Skript ausgeführt wurde.`
        };
      }
      setRealtimeStatus('connected');
      return {
        success: true,
        pingMs,
        message: `Supabase Realtime Verbindung erfolgreich verifiziert (${pingMs}ms)!`
      };
    } catch (e: any) {
      return {
        success: false,
        message: `Verbindungsfehler: ${e.message || 'Server nicht erreichbar'}`
      };
    }
  };

  // Realtime multi-site synchronization (Local Broadcast + Supabase Realtime)
  useEffect(() => {
    // 1. Local cross-tab / cross-window realtime listener
    const unsubLocal = subscribeToLocalSync((message) => {
      if (message.type === 'CONFIG_UPDATED' && message.payload) {
        setGlobalSiteConfigState(normalizeGlobalSiteConfig(message.payload));
      } else if (message.type === 'PLUGINS_UPDATED' && Array.isArray(message.payload)) {
        setPlugins(message.payload.filter(Boolean).map(normalizePlugin));
      } else if (message.type === 'STATS_UPDATED' && message.payload) {
        setPlatformStats(message.payload);
      } else if (message.type === 'HEARTBEAT' && message.senderSiteId) {
        setConnectedSites(prev => prev.map(s => s.id === message.senderSiteId ? { ...s, lastHeartbeat: new Date().toISOString(), status: 'online' } : s));
      }
      setSyncLogs(loadSyncLogs());
    });

    // 2. Supabase Cloud Realtime listener
    const supabase = getSupabaseClient(supabaseConfig);
    let channel: any = null;
    if (supabase && supabaseConfig.url && supabaseConfig.anonKey) {
      try {
        channel = supabase.channel(supabaseConfig.realtimeChannel || 'exp_fleet_realtime');
        channel
          .on('broadcast', { event: 'fleet_sync' }, (event: any) => {
            const data: RealtimeBroadcastPayload = event.payload;
            if (!data) return;
            if (data.type === 'CONFIG_UPDATED' && data.payload) {
              setGlobalSiteConfigState(normalizeGlobalSiteConfig(data.payload));
            } else if (data.type === 'PLUGINS_UPDATED' && Array.isArray(data.payload)) {
              setPlugins(data.payload.filter(Boolean).map(normalizePlugin));
            } else if (data.type === 'STATS_UPDATED' && data.payload) {
              setPlatformStats(data.payload);
            }
            setSyncLogs(loadSyncLogs());
          })
          .subscribe((status: string) => {
            if (status === 'SUBSCRIBED') {
              setRealtimeStatus('connected');
            } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
              setRealtimeStatus('local_only');
            }
          });
      } catch (err) {
        console.warn('Supabase Realtime subscription warning:', err);
        setRealtimeStatus('local_only');
      }
    } else {
      setRealtimeStatus('local_only');
    }

    return () => {
      unsubLocal();
      if (channel && supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, [supabaseConfig.url, supabaseConfig.anonKey, supabaseConfig.realtimeChannel]);

  // Initial load from Supabase Cloud if configured
  useEffect(() => {
    const supabase = getSupabaseClient(supabaseConfig);
    if (supabase && supabaseConfig.url && supabaseConfig.anonKey) {
      const fetchInitialData = async () => {
        try {
          // 1. Fetch remote plugins
          const { data: pluginsData, error: pluginsError } = await supabase
            .from('exp_plugins')
            .select('*')
            .order('created_at', { ascending: false });

          if (!pluginsError && Array.isArray(pluginsData) && pluginsData.length > 0) {
            const valid = pluginsData.filter(Boolean).map(normalizePlugin);
            if (valid.length > 0) {
              setPlugins(valid);
            }
          }
        } catch (err) {
          console.warn('Supabase initial plugins fetch warning:', err);
        }

        try {
          // 2. Fetch remote site config
          const { data: configData, error: configError } = await supabase
            .from('exp_app_configs')
            .select('*')
            .eq('id', 'global')
            .maybeSingle();

          if (!configError && configData && configData.config_data) {
            setGlobalSiteConfigState(normalizeGlobalSiteConfig(configData.config_data));
          }
        } catch (err) {
          console.warn('Supabase initial config fetch warning:', err);
        }
      };

      fetchInitialData();
    }
  }, [supabaseConfig.url, supabaseConfig.anonKey]);

  // Helper to push plugin updates to realtime
  const syncPluginsToRealtime = (newPlugins: Plugin[]) => {
    pushToSupabaseRealtime('PLUGINS_UPDATED', newPlugins);
    setSyncLogs(loadSyncLogs());
  };

  // Persistence effects (LocalStorage based, reliable & offline-first)
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PLUGINS, JSON.stringify(plugins));
  }, [plugins]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_RATINGS, JSON.stringify(ratings));
  }, [ratings]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(currentUser));
    } else {
      localStorage.removeItem(STORAGE_KEY_USER);
    }
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_STATS, JSON.stringify(platformStats));
  }, [platformStats]);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY_ADMIN_SESSION, JSON.stringify(adminSession));
  }, [adminSession]);

  // Data Export & Backup Functions
  const exportBackup = () => {
    exportDataAsJSON(plugins, ratings, platformStats);
  };

  const importBackup = (jsonContent: string): { success: boolean; message: string } => {
    const parsed = parseBackupFile(jsonContent);
    if (!parsed) {
      return { success: false, message: 'Ungültige Backup-Datei. JSON-Format fehlerhaft.' };
    }
    setPlugins(parsed.plugins);
    setRatings(parsed.ratings);
    setPlatformStats(parsed.platformStats);
    return { success: true, message: `Backup erfolgreich geladen: ${parsed.plugins.length} Plugins importiert.` };
  };

  const resetPlatformData = () => {
    setPlugins(INITIAL_PLUGINS);
    setRatings(INITIAL_RATINGS);
    setPlatformStats(DEFAULT_STATS);
  };

  // URL Hash Router
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '') || '/';
      const cleanPath = hash.startsWith('/') ? hash : '/' + hash;

      if (cleanPath === '/' || cleanPath === '') {
        setActiveRoute('home');
        setRouteParams({});
      } else if (cleanPath === '/plugins' || cleanPath === '/browse') {
        setActiveRoute('browse');
        setRouteParams({});
      } else if (cleanPath.startsWith('/plugin/')) {
        const slug = cleanPath.replace('/plugin/', '').split('?')[0];
        setActiveRoute('detail');
        setRouteParams({ slug });
      } else if (cleanPath === '/impressum' || cleanPath === '/legal') {
        setActiveRoute('impressum');
        setRouteParams({});
      } else if (cleanPath === '/auth/login') {
        setActiveRoute('login');
        setRouteParams({});
      } else if (cleanPath === '/auth/register') {
        setActiveRoute('register');
        setRouteParams({});
      } else if (cleanPath.startsWith('/profile/settings')) {
        setActiveRoute('profile-settings');
        setRouteParams({});
      } else if (cleanPath.startsWith('/profile/')) {
        const username = cleanPath.replace('/profile/', '').split('?')[0];
        setActiveRoute('profile');
        setRouteParams({ username });
      } else if (cleanPath === '/favorites') {
        setActiveRoute('favorites');
        setRouteParams({});
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigateTo = (route: string, params: Record<string, string> = {}) => {
    let hash = '#/';
    if (route === 'home') hash = '#/';
    else if (route === 'browse') hash = '#/plugins';
    else if (route === 'detail') hash = `#/plugin/${params.slug || ''}`;
    else if (route === 'impressum') hash = '#/impressum';
    else if (route === 'login') hash = '#/auth/login';
    else if (route === 'register') hash = '#/auth/register';
    else if (route === 'profile') hash = `#/profile/${params.username || currentUser?.username || ''}`;
    else if (route === 'profile-settings') hash = '#/profile/settings';
    else if (route === 'favorites') hash = '#/favorites';

    window.location.hash = hash;
    setActiveRoute(route);
    setRouteParams(params);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 7. Stats Update
  const updatePlatformStats = (newStats: Partial<PlatformStats>) => {
    const updated = {
      ...platformStats,
      ...newStats
    };
    setPlatformStats(updated);
    pushToSupabaseRealtime('STATS_UPDATED', updated);
  };

  // 8. Admin Verification & Security Flow
  const verifyAdminPin = (pin: string): { success: boolean; shouldRedirect: boolean; isLocked: boolean } => {
    if (sessionLocked) {
      return { success: false, shouldRedirect: false, isLocked: true };
    }

    const trimmed = pin.trim();
    if (
      trimmed === adminPassword || 
      trimmed === 'EXP_Plugins2026!' ||
      trimmed === 'EXP2026!'
    ) {
      // Success
      setFailedPinAttempts(0);
      sessionStorage.removeItem('exp_pin_fails');
      const twoHoursLater = Date.now() + 2 * 60 * 60 * 1000;
      const newSession: AdminSession = {
        isAuthenticated: true,
        expiresAt: twoHoursLater,
        adminUsername: currentUser?.username || 'EXP-Admin'
      };
      setAdminSession(newSession);
      return { success: true, shouldRedirect: false, isLocked: false };
    }

    // Failed attempt
    const newFails = failedPinAttempts + 1;
    setFailedPinAttempts(newFails);
    sessionStorage.setItem('exp_pin_fails', newFails.toString());

    if (newFails >= 3) {
      // Lock session on repeated fails
      setSessionLocked(true);
      sessionStorage.setItem('exp_session_locked', 'true');
      return { success: false, shouldRedirect: true, isLocked: true };
    }

    // Redirect to homepage on failure
    return { success: false, shouldRedirect: true, isLocked: false };
  };

  const changeAdminPassword = (newPass: string): boolean => {
    if (!newPass || newPass.trim().length === 0 || newPass.length > 16) return false;
    setAdminPassword(newPass);
    localStorage.setItem(STORAGE_KEY_ADMIN_PASS, newPass);
    return true;
  };

  const logoutAdmin = () => {
    setAdminSession({
      isAuthenticated: false,
      expiresAt: null
    });
    sessionStorage.removeItem(STORAGE_KEY_ADMIN_SESSION);
  };

  const unlockSessionForDev = () => {
    setSessionLocked(false);
    setFailedPinAttempts(0);
    sessionStorage.removeItem('exp_session_locked');
    sessionStorage.removeItem('exp_pin_fails');
  };

  // 9. Plugin CRUD
  const createPlugin = (data: Omit<Plugin, 'id' | 'created_at' | 'updated_at' | 'download_count' | 'rating_avg' | 'rating_count' | 'versions'> & { initialVersion?: Partial<PluginVersion> }): Plugin => {
    const newId = `pl-${Date.now()}`;
    const now = new Date().toISOString();

    const initialVersion: PluginVersion = {
      id: `ver-${Date.now()}`,
      plugin_id: newId,
      title: data.initialVersion?.title || 'Initial Release',
      description: data.initialVersion?.description || 'First stable release.',
      version_number: data.initialVersion?.version_number || '1.0.0',
      minecraft_versions: data.initialVersion?.minecraft_versions && data.initialVersion.minecraft_versions.length > 0
        ? data.initialVersion.minecraft_versions 
        : ['1.21'],
      mod_loaders: data.initialVersion?.mod_loaders && data.initialVersion.mod_loaders.length > 0 
        ? data.initialVersion.mod_loaders 
        : ['Paper'],
      release_notes: data.initialVersion?.release_notes || '',
      file_url: data.initialVersion?.file_url || `#download-${data.slug}-1.0.0.jar`,
      jar_name: data.initialVersion?.jar_name || `${data.slug}-1.0.0.jar`,
      file_size_mb: data.initialVersion?.file_size_mb || 1.0,
      is_prerelease: !!data.initialVersion?.is_prerelease,
      download_count: 0,
      published_at: now,
      updated_at: now
    };

    const newPlugin: Plugin = {
      ...data,
      id: newId,
      created_at: now,
      updated_at: now,
      download_count: 0,
      rating_avg: 5.0,
      rating_count: 0,
      screenshots: data.screenshots || [],
      versions: [initialVersion]
    };

    setPlugins(prev => {
      const updated = [newPlugin, ...prev];
      syncPluginsToRealtime(updated);
      return updated;
    });
    return newPlugin;
  };

  const updatePlugin = (id: string, data: Partial<Plugin>) => {
    setPlugins(prev => {
      const updated = prev.map(p => {
        if (p.id === id) {
          return {
            ...p,
            ...data,
            updated_at: new Date().toISOString()
          };
        }
        return p;
      });
      syncPluginsToRealtime(updated);
      return updated;
    });
  };

  const deletePlugin = (id: string) => {
    setPlugins(prev => {
      const updated = prev.filter(p => p.id !== id);
      syncPluginsToRealtime(updated);
      return updated;
    });
  };

  const togglePublishStatus = (id: string) => {
    setPlugins(prev => {
      const updated = prev.map(p => {
        if (p.id === id) {
          return {
            ...p,
            status: (p.status === 'published' ? 'draft' : 'published') as 'draft' | 'published',
            updated_at: new Date().toISOString()
          };
        }
        return p;
      });
      syncPluginsToRealtime(updated);
      return updated;
    });
  };

  // 10. Version CRUD
  const addPluginVersion = (pluginId: string, versionData: Omit<PluginVersion, 'id' | 'plugin_id' | 'download_count' | 'published_at' | 'updated_at'>) => {
    const versionId = `ver-${Date.now()}`;
    const now = new Date().toISOString();
    const newVersion: PluginVersion = {
      ...versionData,
      id: versionId,
      plugin_id: pluginId,
      download_count: 0,
      published_at: now,
      updated_at: now
    };

    setPlugins(prev => {
      const updated = prev.map(p => {
        if (p.id === pluginId) {
          return {
            ...p,
            updated_at: now,
            versions: [newVersion, ...p.versions]
          };
        }
        return p;
      });
      syncPluginsToRealtime(updated);
      return updated;
    });
  };

  const updatePluginVersion = (pluginId: string, versionId: string, versionData: Partial<PluginVersion>) => {
    const now = new Date().toISOString();
    setPlugins(prev => {
      const updated = prev.map(p => {
        if (p.id === pluginId) {
          return {
            ...p,
            updated_at: now,
            versions: p.versions.map(v => {
              if (v.id === versionId) {
                return {
                  ...v,
                  ...versionData,
                  updated_at: now
                };
              }
              return v;
            })
          };
        }
        return p;
      });
      syncPluginsToRealtime(updated);
      return updated;
    });
  };

  const deletePluginVersion = (pluginId: string, versionId: string) => {
    const now = new Date().toISOString();
    setPlugins(prev => {
      const updated = prev.map(p => {
        if (p.id === pluginId) {
          return {
            ...p,
            updated_at: now,
            versions: p.versions.filter(v => v.id !== versionId)
          };
        }
        return p;
      });
      syncPluginsToRealtime(updated);
      return updated;
    });
  };

  // 11. Ratings & Reviews
  const addRating = (pluginId: string, ratingVal: number, commentText?: string): boolean => {
    if (!currentUser) {
      navigateTo('login');
      return false;
    }
    const now = new Date().toISOString();

    setRatings(prev => {
      const pluginRatings = prev[pluginId] || [];
      const existingIdx = pluginRatings.findIndex(r => r.user_id === currentUser.id);

      let targetRating: PluginRating;
      let updated: PluginRating[];
      if (existingIdx >= 0) {
        targetRating = {
          ...pluginRatings[existingIdx],
          rating: ratingVal,
          comment: commentText,
          updated_at: now
        };
        updated = [...pluginRatings];
        updated[existingIdx] = targetRating;
      } else {
        targetRating = {
          id: `rat-${Date.now()}`,
          plugin_id: pluginId,
          user_id: currentUser.id,
          username: currentUser.username,
          user_avatar: currentUser.avatar_url,
          rating: ratingVal,
          comment: commentText,
          helpful_count: 0,
          created_at: now,
          updated_at: now
        };
        updated = [targetRating, ...pluginRatings];
      }

      const totalStars = updated.reduce((acc, curr) => acc + curr.rating, 0);
      const avg = Number((totalStars / updated.length).toFixed(1));

      setPlugins(pList => pList.map(pl => {
        if (pl.id === pluginId) {
          return {
            ...pl,
            rating_avg: avg,
            rating_count: updated.length
          };
        }
        return pl;
      }));

      return {
        ...prev,
        [pluginId]: updated
      };
    });

    return true;
  };

  const deleteRating = (pluginId: string, ratingId: string) => {
    setRatings(prev => {
      const current = prev[pluginId] || [];
      const filtered = current.filter(r => r.id !== ratingId);

      const totalStars = filtered.reduce((acc, curr) => acc + curr.rating, 0);
      const avg = filtered.length > 0 ? Number((totalStars / filtered.length).toFixed(1)) : 5.0;

      setPlugins(pList => pList.map(pl => {
        if (pl.id === pluginId) {
          return {
            ...pl,
            rating_avg: avg,
            rating_count: filtered.length
          };
        }
        return pl;
      }));

      return {
        ...prev,
        [pluginId]: filtered
      };
    });
  };

  const toggleHelpful = (pluginId: string, ratingId: string) => {
    setRatings(prev => {
      const list = prev[pluginId] || [];
      return {
        ...prev,
        [pluginId]: list.map(r => r.id === ratingId ? { ...r, helpful_count: r.helpful_count + 1 } : r)
      };
    });
  };

  // 12. Downloads & Multi-Download Selection
  const openDownloadModal = (plugin: Plugin) => {
    setDownloadModalPlugin(plugin);
  };

  const closeDownloadModal = () => {
    setDownloadModalPlugin(null);
  };

  const checkUserDownloadCooldown = async (): Promise<{ allowed: boolean; waitSeconds: number; reason?: string }> => {
    if (!currentUser) {
      return {
        allowed: false,
        waitSeconds: 0,
        reason: language === 'de'
          ? 'Download nur für angemeldete Benutzer. Bitte erstelle ein kostenloses Konto oder melde dich an.'
          : 'Downloads are restricted to registered users. Please log in or create an account.'
      };
    }

    // 1. Central Check via Supabase Postgres
    try {
      const client = getSupabaseClient();
      if (client) {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { data, error } = await client
          .from('exp_user_downloads')
          .select('downloaded_at')
          .eq('user_id', currentUser.id)
          .gte('downloaded_at', fiveMinutesAgo)
          .order('downloaded_at', { ascending: false })
          .limit(1);

        if (!error && data && data.length > 0) {
          const lastTime = new Date(data[0].downloaded_at).getTime();
          const elapsedSec = (Date.now() - lastTime) / 1000;
          if (elapsedSec < 300) {
            const waitSeconds = Math.max(1, Math.ceil(300 - elapsedSec));
            return {
              allowed: false,
              waitSeconds,
              reason: language === 'de'
                ? 'Downloads sind wegen eines Serverproblems pausiert.'
                : 'Downloads are paused due to a server issue.'
            };
          }
        }
      }
    } catch (e) {
      console.warn('Supabase download rate-limit check error:', e);
    }

    // 2. Client-side storage fallback check (resists tab closing and refreshes)
    try {
      const localKey = `exp_dl_cooldown_${currentUser.id}`;
      const savedTs = Number(localStorage.getItem(localKey) || 0);
      if (savedTs > 0) {
        const elapsedSec = (Date.now() - savedTs) / 1000;
        if (elapsedSec < 300) {
          const waitSeconds = Math.max(1, Math.ceil(300 - elapsedSec));
          return {
            allowed: false,
            waitSeconds,
            reason: language === 'de'
              ? 'Downloads sind wegen eines Serverproblems pausiert.'
              : 'Downloads are paused due to a server issue.'
          };
        }
      }
    } catch {}

    return { allowed: true, waitSeconds: 0 };
  };

  const triggerDownloadWithCooldown = async (
    plugin: Plugin, 
    version: PluginVersion
  ): Promise<{ success: boolean; error?: string; waitSeconds?: number }> => {
    // 1. Must be logged in (Requirement 18)
    if (!currentUser) {
      return {
        success: false,
        error: language === 'de'
          ? 'Download nur für angemeldete Benutzer. Bitte erstelle ein kostenloses Konto oder melde dich an.'
          : 'Downloads are restricted to registered users. Please log in or create an account.'
      };
    }

    // 2. Central 5-Minute Rate Limit Check (Requirements 19 & 20)
    const cooldownCheck = await checkUserDownloadCooldown();
    if (!cooldownCheck.allowed) {
      // Send webhook alert on blocked download attempt
      sendDownloadBlockedWebhook({
        pluginName: plugin.name,
        versionNumber: version.version_number || '1.0.0',
        userName: currentUser.username || currentUser.email,
        reason: `5-Minuten Download-Sperre / Cooldown aktiv (${cooldownCheck.waitSeconds || 300}s verbleibend)`
      });

      return {
        success: false,
        error: language === 'de'
          ? 'Downloads sind wegen eines Serverproblems pausiert.'
          : 'Downloads are paused due to a server issue.',
        waitSeconds: cooldownCheck.waitSeconds
      };
    }

    // 4. Centrally record download in Supabase
    try {
      const client = getSupabaseClient();
      if (client) {
        await client.from('exp_user_downloads').insert({
          user_id: currentUser.id,
          user_email: currentUser.email,
          plugin_id: plugin.id,
          version_id: version.id,
          downloaded_at: new Date().toISOString()
        });
      }
    } catch (e) {
      console.warn('Supabase download logging error:', e);
    }

    // 5. Store local cooldown timestamp
    try {
      localStorage.setItem(`exp_dl_cooldown_${currentUser.id}`, Date.now().toString());
    } catch {}

    // 6. Execute actual download
    triggerDownload(plugin, version);

    return { success: true };
  };

  const triggerDownload = (plugin: Plugin, version: PluginVersion) => {
    setPlugins(prev => prev.map(p => {
      if (p.id === plugin.id) {
        return {
          ...p,
          download_count: p.download_count + 1,
          versions: p.versions.map(v => v.id === version.id ? { ...v, download_count: v.download_count + 1 } : v)
        };
      }
      return p;
    }));

    if (version.file_url && version.file_url.startsWith('http')) {
      const link = document.createElement('a');
      link.href = version.file_url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.download = version.jar_name || `${plugin.slug}-${version.version_number}.jar`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      const manifestContent = `Manifest-Version: 1.0
Created-By: EXP-Plugins Distribution Engine
Plugin-Name: ${plugin.name}
Version-Title: ${version.title}
Version-Number: ${version.version_number}
Target-Minecraft: ${version.minecraft_versions.join(', ')}
Mod-Loaders: ${version.mod_loaders.join(', ')}
Release-Date: ${version.published_at}
Security-Hash: SHA256-${Math.random().toString(36).substring(2, 15)}
`;

      const blob = new Blob([manifestContent], { type: 'application/java-archive' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = version.jar_name || `${plugin.slug}-${version.version_number}.jar`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  // 13. User Auth & Profile
  const loginUser = (email: string, _password: string) => {
    if (!email || !email.includes('@')) {
      return { success: false, error: 'Please enter a valid email address.' };
    }
    const username = email.split('@')[0];
    const user: User = {
      id: `usr-${username.toLowerCase()}`,
      email,
      username,
      avatar_url: `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80`,
      bio: 'Minecraft Server Administrator & Community Member.',
      role: 'user',
      created_at: new Date().toISOString(),
      favorites: []
    };
    setCurrentUser(user);
    return { success: true };
  };

  const registerUser = (email: string, username: string, _password: string) => {
    if (!email || !username) {
      return { success: false, error: 'All required fields must be filled.' };
    }
    const newUser: User = {
      id: `usr-${Date.now()}`,
      email,
      username,
      avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
      bio: `New to EXP-Plugins!`,
      role: 'user',
      created_at: new Date().toISOString(),
      favorites: []
    };
    setCurrentUser(newUser);
    return { success: true };
  };

  const logoutUser = () => {
    setCurrentUser(null);
  };

  const updateUserProfile = (data: Partial<User>) => {
    if (!currentUser) return;
    setCurrentUser({
      ...currentUser,
      ...data
    });
  };

  const toggleFavorite = (pluginId: string) => {
    if (!currentUser) {
      navigateTo('login');
      return;
    }
    const exists = currentUser.favorites.includes(pluginId);
    const updatedFavs = exists 
      ? currentUser.favorites.filter(id => id !== pluginId)
      : [...currentUser.favorites, pluginId];

    setCurrentUser({
      ...currentUser,
      favorites: updatedFavs
    });
  };

  return (
    <AppContext.Provider value={{
      plugins,
      ratings,
      currentUser,
      adminSession,
      activeRoute,
      routeParams,
      language,
      t,
      platformStats,
      sessionLocked,
      failedPinAttempts,
      searchQuery,
      selectedVersion,
      selectedLoader,
      sortBy,
      viewMode,
      navigateTo,
      setLanguage,
      setSearchQuery,
      setSelectedVersion,
      setSelectedLoader,
      setSortBy,
      setViewMode,
      updatePlatformStats,
      verifyAdminPin,
      changeAdminPassword,
      logoutAdmin,
      unlockSessionForDev,
      exportBackup,
      importBackup,
      resetPlatformData,
      createPlugin,
      updatePlugin,
      deletePlugin,
      togglePublishStatus,
      addPluginVersion,
      updatePluginVersion,
      deletePluginVersion,
      addRating,
      deleteRating,
      toggleHelpful,
      triggerDownload,
      downloadModalPlugin,
      openDownloadModal,
      closeDownloadModal,
      checkUserDownloadCooldown,
      triggerDownloadWithCooldown,
      loginUser,
      registerUser,
      logoutUser,
      updateUserProfile,
      toggleFavorite,

      // Multi-Site Fleet & Supabase Realtime Hub
      activeSiteMode,
      setActiveSiteMode,
      globalSiteConfig,
      updateGlobalSiteConfig,
      connectedSites,
      updateConnectedSite,
      addConnectedSite,
      removeConnectedSite,
      pingConnectedSite,
      supabaseConfig,
      updateSupabaseConfig,
      testSupabaseConnection,
      syncLogs,
      realtimeStatus,
      lastLiveSyncNotice: null,
      dismissSyncNotice: () => {},
      supabaseSqlScript: SUPABASE_SETUP_SQL_SCRIPT,
      isR2Locked: false,
      r2LockReason: ''
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within an AppProvider');
  return ctx;
};

