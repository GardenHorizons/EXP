export type ModLoader = 'Paper' | 'Spigot' | 'Bukkit';

export type MinecraftVersion = 
  | '1.21'
  | '1.21.1'
  | '1.21.3'
  | '1.21.4'
  | '1.21.5'
  | '1.21.6'
  | '1.21.7'
  | '1.21.8'
  | '1.21.9'
  | '1.21.10'
  | '1.21.11'
  | '26.1'
  | '26.1.1'
  | '26.1.2'
  | '26.2';

export type Language = 'en' | 'de';

export interface PlatformStats {
  totalDownloads: number;
  activeUsers: number;
  totalPlugins: number;
  serverCommunity: string;
  avgRating: number;
}

export interface PluginVersion {
  id: string;
  plugin_id: string;
  title: string;
  description: string;
  version_number: string;
  minecraft_version?: string;
  minecraft_versions: MinecraftVersion[];
  mod_loader?: string;
  mod_loaders: ModLoader[];
  release_notes?: string;
  file_url: string;
  jar_name: string;
  file_size_mb: number;
  upload_date?: string;
  is_prerelease: boolean;
  download_count: number;
  cloudflare_key?: string;
  published_at: string;
  updated_at: string;
}

export interface PluginScreenshot {
  id: string;
  plugin_id: string;
  image_url: string;
  caption?: string;
  order_index: number;
}

export interface PluginRating {
  id: string;
  plugin_id: string;
  user_id: string;
  username: string;
  user_avatar?: string;
  rating: number; // 1-5
  comment?: string;
  helpful_count: number;
  created_at: string;
  updated_at: string;
}

export interface Plugin {
  id: string;
  slug: string;
  name: string;
  short_description: string;
  description: string;
  author_id: string;
  author_name: string;
  author_avatar?: string;
  website_url?: string;
  github_url?: string;
  hero_image_url: string;
  status: 'draft' | 'published';
  created_at: string;
  updated_at: string;
  download_count: number;
  rating_avg: number;
  rating_count: number;
  requirements?: string;
  tags: string[];
  screenshots: string[];
  versions: PluginVersion[];
}

export interface User {
  id: string;
  email: string;
  username: string;
  avatar_url?: string;
  bio?: string;
  role: 'user' | 'admin' | 'creator';
  created_at: string;
  favorites: string[]; // plugin slugs or IDs
  vip?: boolean;
  dev?: boolean;
}

export interface AdminSession {
  isAuthenticated: boolean;
  expiresAt: number | null;
  adminUsername?: string;
}

export type SortOption = 'downloads' | 'rating' | 'newest' | 'updated';

// Multi-Site & Central Admin Fleet Types
export interface ConnectedWebsite {
  id: string;
  name: string;
  type: 'public-vercel' | 'google-ai-studio' | 'website-b' | 'custom-app';
  url: string;
  status: 'online' | 'syncing' | 'offline';
  lastHeartbeat: string;
  latencyMs?: number;
  environment: 'production' | 'preview' | 'staging';
  enabled: boolean;
  notes?: string;
}

export interface ImpressumData {
  companyName: string;
  address: string;
  email: string;
  phone?: string;
  taxId?: string;
  authorizedRepresentative?: string;
  additionalInfo?: string;
  disclaimerText?: string;
}

export interface GlobalAnnouncement {
  enabled: boolean;
  text: string;
  type: 'info' | 'warning' | 'success' | 'alert';
  linkText?: string;
  linkUrl?: string;
}

export interface GlobalSiteConfig {
  siteTitle: string;
  siteSubtitle: string;
  siteLogoUrl?: string; // Central logo for Header & Footer (1:1 round, transparent)
  announcement: GlobalAnnouncement;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  featuredPluginSlug: string;
  communityServerName: string;
  heroBadgeText: string;
  heroBadgeColor: string;
  updatedAt: string;
  updatedBy: string;
  impressum?: ImpressumData;
}

export interface SupabaseSyncConfig {
  url: string;
  anonKey: string;
  autoSync: boolean;
  realtimeChannel: string;
  isConnected: boolean;
  lastSyncTimestamp: string | null;
  syncMode: 'supabase' | 'broadcast_local' | 'hybrid';
}

export interface SyncEventLog {
  id: string;
  timestamp: string;
  source: string;
  action: 'PLUGIN_CREATED' | 'PLUGIN_UPDATED' | 'PLUGIN_DELETED' | 'CONFIG_UPDATED' | 'STATS_UPDATED' | 'BROADCAST_MESSAGE' | 'HEARTBEAT';
  details: string;
  syncedTo: string[];
}

