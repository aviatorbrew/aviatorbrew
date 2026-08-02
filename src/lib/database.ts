import { Pool, type PoolClient } from "pg";

type DatabaseConfig = {
  connectionString: string;
  ssl?: { rejectUnauthorized: boolean };
};

let pool: Pool | undefined;
let schemaReady: Promise<void> | undefined;

const schemaStatements = [
  `CREATE SCHEMA IF NOT EXISTS website`,
  `CREATE SCHEMA IF NOT EXISTS flight_log`,
  `CREATE TABLE IF NOT EXISTS website.schema_migrations (
    version integer PRIMARY KEY,
    name text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS website.settings (
    key text PRIMARY KEY,
    value jsonb NOT NULL DEFAULT '{}'::jsonb,
    description text,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS website.content_blocks (
    id bigserial PRIMARY KEY,
    area text NOT NULL,
    slug text NOT NULL,
    eyebrow text,
    title text NOT NULL,
    body text,
    data jsonb NOT NULL DEFAULT '{}'::jsonb,
    published boolean NOT NULL DEFAULT false,
    starts_at timestamptz,
    ends_at timestamptz,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (area, slug)
  )`,
  `CREATE TABLE IF NOT EXISTS website.media_assets (
    id bigserial PRIMARY KEY,
    target text NOT NULL,
    target_slug text NOT NULL DEFAULT '',
    file_name text NOT NULL,
    url text NOT NULL,
    media_type text NOT NULL,
    alt_text text,
    caption text,
    is_featured boolean NOT NULL DEFAULT false,
    published boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (target, target_slug, file_name)
  )`,
  `CREATE TABLE IF NOT EXISTS website.events (
    id bigserial PRIMARY KEY,
    slug text NOT NULL UNIQUE,
    title text NOT NULL,
    event_type text NOT NULL DEFAULT 'special',
    starts_at timestamptz,
    ends_at timestamptz,
    location text,
    description text,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    published boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS website.beverages (
    id bigserial PRIMARY KEY,
    slug text NOT NULL UNIQUE,
    name text NOT NULL,
    beverage_type text NOT NULL,
    style text,
    abv text,
    description text,
    image_url text,
    published boolean NOT NULL DEFAULT true,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS website.keg_package_inventory (
    id bigserial PRIMARY KEY,
    beer_name text NOT NULL,
    normalized_name text NOT NULL,
    category text NOT NULL DEFAULT 'Other',
    packaging text NOT NULL DEFAULT 'Draft',
    sixth_bbl_kegs integer NOT NULL DEFAULT 0,
    sixth_bbl_price numeric(8,2) NOT NULL DEFAULT 0,
    fifty_l_kegs integer NOT NULL DEFAULT 0,
    fifty_l_price numeric(8,2) NOT NULL DEFAULT 0,
    cases_12oz integer NOT NULL DEFAULT 0,
    case_12oz_price numeric(8,2) NOT NULL DEFAULT 0,
    cases_16oz integer NOT NULL DEFAULT 0,
    case_16oz_price numeric(8,2) NOT NULL DEFAULT 0,
    case_size text,
    case_price numeric(8,2) NOT NULL DEFAULT 0,
    sixtels_available_via_backfill integer NOT NULL DEFAULT 0,
    total_bbl numeric(10,2) NOT NULL DEFAULT 0,
    inventory_value numeric(12,2) NOT NULL DEFAULT 0,
    batches text,
    source_file text,
    imported_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    hidden boolean NOT NULL DEFAULT false,
    UNIQUE (normalized_name)
  )`,
  `CREATE TABLE IF NOT EXISTS flight_log.profiles (
    id bigserial PRIMARY KEY,
    handle text NOT NULL UNIQUE,
    display_name text NOT NULL,
    email_hash text UNIQUE,
    avatar_url text,
    bio text,
    role text NOT NULL DEFAULT 'user',
    status text NOT NULL DEFAULT 'active',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS flight_log.posts (
    id bigserial PRIMARY KEY,
    profile_id bigint REFERENCES flight_log.profiles(id) ON DELETE SET NULL,
    post_type text NOT NULL DEFAULT 'post',
    title text,
    body text,
    location_slug text,
    event_slug text,
    beer_slug text,
    visibility text NOT NULL DEFAULT 'public',
    status text NOT NULL DEFAULT 'draft',
    published_at timestamptz,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS flight_log.comments (
    id bigserial PRIMARY KEY,
    post_id bigint NOT NULL REFERENCES flight_log.posts(id) ON DELETE CASCADE,
    profile_id bigint REFERENCES flight_log.profiles(id) ON DELETE SET NULL,
    body text NOT NULL,
    status text NOT NULL DEFAULT 'visible',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS flight_log.media_assets (
    id bigserial PRIMARY KEY,
    post_id bigint REFERENCES flight_log.posts(id) ON DELETE CASCADE,
    profile_id bigint REFERENCES flight_log.profiles(id) ON DELETE SET NULL,
    url text NOT NULL,
    media_type text NOT NULL,
    alt_text text,
    caption text,
    sort_order integer NOT NULL DEFAULT 0,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS flight_log.reactions (
    post_id bigint NOT NULL REFERENCES flight_log.posts(id) ON DELETE CASCADE,
    profile_id bigint NOT NULL REFERENCES flight_log.profiles(id) ON DELETE CASCADE,
    reaction text NOT NULL DEFAULT 'like',
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, profile_id, reaction)
  )`,
  `CREATE TABLE IF NOT EXISTS flight_log.post_reactions (
    target_type text NOT NULL,
    target_id text NOT NULL,
    profile_id bigint NOT NULL REFERENCES flight_log.profiles(id) ON DELETE CASCADE,
    reaction text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (target_type, target_id, profile_id),
    CONSTRAINT flight_log_post_reactions_target_check CHECK (target_type IN ('official','customer','comment')),
    CONSTRAINT flight_log_post_reactions_reaction_check CHECK (reaction IN ('thumbs_up','heart','laugh','beer','airplane'))
  )`,
  `ALTER TABLE IF EXISTS flight_log.post_reactions DROP CONSTRAINT IF EXISTS flight_log_post_reactions_target_check`,
  `ALTER TABLE IF EXISTS flight_log.post_reactions ADD CONSTRAINT flight_log_post_reactions_target_check CHECK (target_type IN ('official','customer','comment'))`,
  `CREATE INDEX IF NOT EXISTS flight_log_post_reactions_target_idx ON flight_log.post_reactions (target_type, target_id)`,
  `CREATE TABLE IF NOT EXISTS flight_log.post_comments (
    id bigserial PRIMARY KEY,
    target_type text NOT NULL,
    target_id text NOT NULL,
    profile_id bigint REFERENCES flight_log.profiles(id) ON DELETE SET NULL,
    body text NOT NULL,
    status text NOT NULL DEFAULT 'visible',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT flight_log_post_comments_target_check CHECK (target_type IN ('official','customer'))
  )`,
  `CREATE INDEX IF NOT EXISTS flight_log_post_comments_target_idx ON flight_log.post_comments (target_type, target_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS flight_log.post_tags (
    post_id bigint NOT NULL REFERENCES flight_log.posts(id) ON DELETE CASCADE,
    tagged_profile_id bigint NOT NULL REFERENCES flight_log.profiles(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, tagged_profile_id)
  )`,
  `CREATE INDEX IF NOT EXISTS flight_log_post_tags_profile_idx ON flight_log.post_tags (tagged_profile_id)`,

  `CREATE TABLE IF NOT EXISTS website.locations (
    slug text PRIMARY KEY,
    name text NOT NULL,
    data jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS website.coupon_offers (
    id text PRIMARY KEY,
    title text NOT NULL,
    description text NOT NULL,
    terms text NOT NULL DEFAULT '',
    code text NOT NULL,
    expires_at date NOT NULL,
    limit_count integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS website.coupon_claims (
    token text PRIMARY KEY,
    offer_id text NOT NULL REFERENCES website.coupon_offers(id) ON DELETE CASCADE,
    claimed_at timestamptz NOT NULL DEFAULT now(),
    expires_at date NOT NULL,
    redeemed_at timestamptz
  )`,
  `CREATE TABLE IF NOT EXISTS website.coupon_blackouts (
    date date PRIMARY KEY,
    label text NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS website.tour_signups (
    id text PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    name text NOT NULL,
    email text NOT NULL,
    tickets integer NOT NULL,
    message text NOT NULL DEFAULT '',
    tour_date date NOT NULL,
    tour_time text NOT NULL,
    payment_status text,
    stripe_session_id text
  )`,
  `CREATE TABLE IF NOT EXISTS website.tour_notifications (
    key text PRIMARY KEY,
    sent_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS website.tour_cancellations (
    key text PRIMARY KEY,
    cancelled_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS website.newsletter_subscribers (
    email text PRIMARY KEY,
    name text,
    phone text,
    source text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    subscribed_at timestamptz NOT NULL DEFAULT now(),
    confirmation_expires_at timestamptz,
    confirmation_sent_at timestamptz,
    confirmed_at timestamptz,
    welcome_sent_at timestamptz
  )`,
  `CREATE TABLE IF NOT EXISTS website.newsletter_campaigns (
    id text PRIMARY KEY,
    subject text NOT NULL,
    template text NOT NULL,
    recipients integer NOT NULL DEFAULT 0,
    sections jsonb NOT NULL DEFAULT '[]'::jsonb,
    sent_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS website.form_inquiries (
    id bigserial PRIMARY KEY,
    kind text NOT NULL,
    email text NOT NULL,
    name text,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    source text NOT NULL DEFAULT 'aviatorbrew.com',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS website.shop_categories (
    id bigserial PRIMARY KEY,
    slug text NOT NULL UNIQUE,
    name text NOT NULL,
    description text NOT NULL DEFAULT '',
    sort_order integer NOT NULL DEFAULT 0,
    published boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS website.shop_products (
    id bigserial PRIMARY KEY,
    slug text NOT NULL UNIQUE,
    category_id bigint REFERENCES website.shop_categories(id) ON DELETE SET NULL,
    name text NOT NULL,
    description text NOT NULL DEFAULT '',
    image_url text NOT NULL DEFAULT '',
    published boolean NOT NULL DEFAULT false,
    featured boolean NOT NULL DEFAULT false,
    sort_order integer NOT NULL DEFAULT 0,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS website.shop_product_variants (
    id bigserial PRIMARY KEY,
    product_id bigint NOT NULL REFERENCES website.shop_products(id) ON DELETE CASCADE,
    label text NOT NULL,
    sku text NOT NULL DEFAULT '',
    price_cents integer NOT NULL,
    inventory_count integer NOT NULL DEFAULT 0,
    published boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (product_id, label)
  )`,
  `CREATE TABLE IF NOT EXISTS website.shop_orders (
    id bigserial PRIMARY KEY,
    stripe_session_id text UNIQUE,
    customer_email text,
    status text NOT NULL DEFAULT 'pending',
    amount_total_cents integer NOT NULL DEFAULT 0,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    paid_at timestamptz
  )`,
  `CREATE TABLE IF NOT EXISTS website.shop_order_items (
    id bigserial PRIMARY KEY,
    order_id bigint NOT NULL REFERENCES website.shop_orders(id) ON DELETE CASCADE,
    product_id bigint REFERENCES website.shop_products(id) ON DELETE SET NULL,
    variant_id bigint REFERENCES website.shop_product_variants(id) ON DELETE SET NULL,
    product_name text NOT NULL,
    variant_label text NOT NULL,
    quantity integer NOT NULL,
    unit_price_cents integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE IF EXISTS website.shop_products ADD COLUMN IF NOT EXISTS additional_image_urls jsonb NOT NULL DEFAULT '[]'::jsonb`,
  `ALTER TABLE IF EXISTS website.shop_products ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manager'`,
  `ALTER TABLE IF EXISTS website.shop_products ADD COLUMN IF NOT EXISTS source_id text`,
  `ALTER TABLE IF EXISTS website.shop_product_variants ADD COLUMN IF NOT EXISTS compare_at_price_cents integer`,
  `ALTER TABLE IF EXISTS website.shop_product_variants ADD COLUMN IF NOT EXISTS weight_ounces numeric(9,2) NOT NULL DEFAULT 8`,
  `ALTER TABLE IF EXISTS website.shop_product_variants ADD COLUMN IF NOT EXISTS requires_shipping boolean NOT NULL DEFAULT true`,
  `ALTER TABLE IF EXISTS website.shop_product_variants ADD COLUMN IF NOT EXISTS track_inventory boolean NOT NULL DEFAULT true`,
  `ALTER TABLE IF EXISTS website.shop_product_variants ADD COLUMN IF NOT EXISTS available_for_sale boolean NOT NULL DEFAULT true`,
  `UPDATE website.shop_product_variants SET weight_ounces=GREATEST(1, ROUND(weight_ounces)) WHERE weight_ounces IS DISTINCT FROM GREATEST(1, ROUND(weight_ounces))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS website_shop_products_source_unique_idx ON website.shop_products (source, source_id) WHERE source_id IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS website.shop_settings (
    id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    bonus_enabled boolean NOT NULL DEFAULT true,
    bonus_threshold_cents integer NOT NULL DEFAULT 2000,
    bonus_variant_id bigint REFERENCES website.shop_product_variants(id) ON DELETE SET NULL,
    bonus_label text NOT NULL DEFAULT 'Free Aviator sticker',
    order_notification_email text NOT NULL DEFAULT 'orders@aviatorbrew.com',
    shipping_provider text NOT NULL DEFAULT 'easypost',
    origin_name text NOT NULL DEFAULT 'Aviator Brewing Company',
    origin_street1 text NOT NULL DEFAULT '688 Brewing Drive',
    origin_street2 text NOT NULL DEFAULT '',
    origin_city text NOT NULL DEFAULT 'Fuquay-Varina',
    origin_state text NOT NULL DEFAULT 'NC',
    origin_zip text NOT NULL DEFAULT '27526',
    origin_country text NOT NULL DEFAULT 'US',
    origin_phone text NOT NULL DEFAULT '9195672337',
    parcel_length numeric(8,2) NOT NULL DEFAULT 12,
    parcel_width numeric(8,2) NOT NULL DEFAULT 10,
    parcel_height numeric(8,2) NOT NULL DEFAULT 6,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `INSERT INTO website.shop_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`,
  `ALTER TABLE IF EXISTS website.shop_settings ADD COLUMN IF NOT EXISTS order_notification_email text NOT NULL DEFAULT 'orders@aviatorbrew.com'`,
  `ALTER TABLE IF EXISTS website.shop_orders ADD COLUMN IF NOT EXISTS subtotal_cents integer NOT NULL DEFAULT 0`,
  `ALTER TABLE IF EXISTS website.shop_orders ADD COLUMN IF NOT EXISTS shipping_cents integer NOT NULL DEFAULT 0`,
  `ALTER TABLE IF EXISTS website.shop_orders ADD COLUMN IF NOT EXISTS customer_name text`,
  `ALTER TABLE IF EXISTS website.shop_orders ADD COLUMN IF NOT EXISTS customer_phone text`,
  `ALTER TABLE IF EXISTS website.shop_orders ADD COLUMN IF NOT EXISTS shipping_address jsonb NOT NULL DEFAULT '{}'::jsonb`,
  `ALTER TABLE IF EXISTS website.shop_orders ADD COLUMN IF NOT EXISTS shipping_provider text`,
  `ALTER TABLE IF EXISTS website.shop_orders ADD COLUMN IF NOT EXISTS shipping_service text`,
  `ALTER TABLE IF EXISTS website.shop_orders ADD COLUMN IF NOT EXISTS shipping_rate_id text`,
  `ALTER TABLE IF EXISTS website.shop_orders ADD COLUMN IF NOT EXISTS notification_claimed_at timestamptz`,
  `ALTER TABLE IF EXISTS website.shop_orders ADD COLUMN IF NOT EXISTS notification_sent_at timestamptz`,
  `ALTER TABLE IF EXISTS website.shop_order_items ADD COLUMN IF NOT EXISTS is_bonus boolean NOT NULL DEFAULT false`,
  `CREATE TABLE IF NOT EXISTS website.private_event_payment_notifications (
    session_id text PRIMARY KEY,
    notified_at timestamptz NOT NULL DEFAULT now(),
    payload jsonb NOT NULL DEFAULT '{}'::jsonb
  )`,
  `CREATE INDEX IF NOT EXISTS website_shop_products_category_idx ON website.shop_products (category_id, published, sort_order)`,
  `CREATE INDEX IF NOT EXISTS website_shop_variants_product_idx ON website.shop_product_variants (product_id, published, inventory_count)`,
  `CREATE INDEX IF NOT EXISTS website_shop_orders_status_idx ON website.shop_orders (status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS website_coupon_claims_offer_idx ON website.coupon_claims (offer_id)`,
  `CREATE INDEX IF NOT EXISTS website_tour_signups_date_idx ON website.tour_signups (tour_date, tour_time)`,
  `CREATE INDEX IF NOT EXISTS website_newsletter_status_idx ON website.newsletter_subscribers (status, subscribed_at DESC)`,
  `CREATE INDEX IF NOT EXISTS website_form_inquiries_kind_idx ON website.form_inquiries (kind, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS website_content_blocks_area_published_idx ON website.content_blocks (area, published, sort_order)`,
  `CREATE INDEX IF NOT EXISTS website_media_assets_target_idx ON website.media_assets (target, target_slug, published, sort_order)`,
  `CREATE INDEX IF NOT EXISTS website_events_starts_at_idx ON website.events (starts_at, published)`,
  `CREATE INDEX IF NOT EXISTS website_beverages_type_published_idx ON website.beverages (beverage_type, published, name)`,
  `ALTER TABLE IF EXISTS website.keg_package_inventory ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Other'`,
  `ALTER TABLE IF EXISTS website.keg_package_inventory ADD COLUMN IF NOT EXISTS packaging text NOT NULL DEFAULT 'Draft'`,
  `ALTER TABLE IF EXISTS website.keg_package_inventory ADD COLUMN IF NOT EXISTS case_size text`,
  `ALTER TABLE IF EXISTS website.keg_package_inventory ADD COLUMN IF NOT EXISTS case_price numeric(8,2) NOT NULL DEFAULT 0`,
  `ALTER TABLE IF EXISTS website.keg_package_inventory ADD COLUMN IF NOT EXISTS sixtels_available_via_backfill integer NOT NULL DEFAULT 0`,
  `CREATE INDEX IF NOT EXISTS website_keg_package_inventory_visible_idx ON website.keg_package_inventory (hidden, beer_name)`,

  `ALTER TABLE IF EXISTS flight_log.profiles ADD COLUMN IF NOT EXISTS first_name text`,
  `ALTER TABLE IF EXISTS flight_log.profiles ADD COLUMN IF NOT EXISTS last_name text`,
  `ALTER TABLE IF EXISTS flight_log.profiles ADD COLUMN IF NOT EXISTS email text`,
  `ALTER TABLE IF EXISTS flight_log.profiles ADD COLUMN IF NOT EXISTS phone text`,
  `ALTER TABLE IF EXISTS flight_log.profiles ADD COLUMN IF NOT EXISTS avatar_url text`,
  `ALTER TABLE IF EXISTS flight_log.profiles ADD COLUMN IF NOT EXISTS bio text`,
  `ALTER TABLE IF EXISTS flight_log.profiles ADD COLUMN IF NOT EXISTS password_salt text`,
  `ALTER TABLE IF EXISTS flight_log.profiles ADD COLUMN IF NOT EXISTS password_hash text`,
  `ALTER TABLE IF EXISTS flight_log.profiles ADD COLUMN IF NOT EXISTS email_verified_at timestamptz`,
  `ALTER TABLE IF EXISTS flight_log.profiles ADD COLUMN IF NOT EXISTS verification_token_hash text`,
  `ALTER TABLE IF EXISTS flight_log.profiles ADD COLUMN IF NOT EXISTS verification_expires_at timestamptz`,
  `ALTER TABLE IF EXISTS flight_log.profiles ADD COLUMN IF NOT EXISTS reset_token_hash text`,
  `ALTER TABLE IF EXISTS flight_log.profiles ADD COLUMN IF NOT EXISTS reset_expires_at timestamptz`,
  `ALTER TABLE IF EXISTS flight_log.profiles ADD COLUMN IF NOT EXISTS flight_crew_joined_at timestamptz`,
  `ALTER TABLE IF EXISTS flight_log.profiles ADD COLUMN IF NOT EXISTS last_login_at timestamptz`,
  `CREATE UNIQUE INDEX IF NOT EXISTS flight_log_profiles_email_unique_idx ON flight_log.profiles (lower(email)) WHERE email IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS flight_log_profiles_handle_unique_idx ON flight_log.profiles (lower(handle))`,
  `ALTER TABLE IF EXISTS flight_log.profiles ALTER COLUMN role SET DEFAULT 'user'`,
  `UPDATE flight_log.profiles SET role='user' WHERE role IS NULL OR role NOT IN ('user','moderator','admin')`,
  `CREATE INDEX IF NOT EXISTS flight_log_profiles_role_idx ON flight_log.profiles (role, status)`,
  `CREATE TABLE IF NOT EXISTS flight_log.sessions (
    id bigserial PRIMARY KEY,
    profile_id bigint NOT NULL REFERENCES flight_log.profiles(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    last_seen_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS flight_log_sessions_profile_idx ON flight_log.sessions (profile_id, expires_at DESC)`,

  `CREATE TABLE IF NOT EXISTS flight_log.friendships (
    requester_profile_id bigint NOT NULL REFERENCES flight_log.profiles(id) ON DELETE CASCADE,
    addressee_profile_id bigint NOT NULL REFERENCES flight_log.profiles(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'pending',
    requested_at timestamptz NOT NULL DEFAULT now(),
    responded_at timestamptz,
    PRIMARY KEY (requester_profile_id, addressee_profile_id),
    CONSTRAINT flight_log_friendships_distinct_profiles CHECK (requester_profile_id <> addressee_profile_id)
  )`,
  `CREATE TABLE IF NOT EXISTS flight_log.check_ins (
    id bigserial PRIMARY KEY,
    profile_id bigint NOT NULL REFERENCES flight_log.profiles(id) ON DELETE CASCADE,
    checkin_type text NOT NULL,
    target_slug text,
    target_label text NOT NULL,
    notes text NOT NULL DEFAULT '',
    rating integer,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    checked_in_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT flight_log_check_ins_type_check CHECK (checkin_type IN ('beer','location','food','event'))
  )`,
  `CREATE INDEX IF NOT EXISTS flight_log_check_ins_profile_idx ON flight_log.check_ins (profile_id, checked_in_at DESC)`,
  `CREATE INDEX IF NOT EXISTS flight_log_check_ins_target_idx ON flight_log.check_ins (checkin_type, target_slug)`,

  `CREATE TABLE IF NOT EXISTS flight_log.friend_invites (
    id bigserial PRIMARY KEY,
    inviter_profile_id bigint REFERENCES flight_log.profiles(id) ON DELETE SET NULL,
    invite_email text,
    invite_phone text,
    carrier_gateway_email text,
    carrier_name text,
    carrier_lookup_status text NOT NULL DEFAULT 'not_requested',
    invite_channel text NOT NULL DEFAULT 'email',
    delivery_address text,
    token_hash text NOT NULL UNIQUE,
    status text NOT NULL DEFAULT 'pending',
    message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS flight_log_friendships_addressee_idx ON flight_log.friendships (addressee_profile_id, status)`,
  `ALTER TABLE IF EXISTS flight_log.friend_invites ADD COLUMN IF NOT EXISTS carrier_name text`,
  `ALTER TABLE IF EXISTS flight_log.friend_invites ADD COLUMN IF NOT EXISTS carrier_lookup_status text NOT NULL DEFAULT 'not_requested'`,
  `ALTER TABLE IF EXISTS flight_log.friend_invites ADD COLUMN IF NOT EXISTS invite_channel text NOT NULL DEFAULT 'email'`,
  `ALTER TABLE IF EXISTS flight_log.friend_invites ADD COLUMN IF NOT EXISTS delivery_address text`,
  `ALTER TABLE IF EXISTS flight_log.friend_invites ADD COLUMN IF NOT EXISTS twilio_message_sid text`,
  `ALTER TABLE IF EXISTS flight_log.friend_invites ADD COLUMN IF NOT EXISTS twilio_message_status text`,
  `ALTER TABLE IF EXISTS flight_log.friend_invites ADD COLUMN IF NOT EXISTS twilio_error_code text`,
  `ALTER TABLE IF EXISTS flight_log.friend_invites ADD COLUMN IF NOT EXISTS twilio_status_updated_at timestamptz`,
  `CREATE INDEX IF NOT EXISTS flight_log_friend_invites_contact_idx ON flight_log.friend_invites (invite_email, invite_phone, status)`,
  `CREATE INDEX IF NOT EXISTS flight_log_friend_invites_twilio_sid_idx ON flight_log.friend_invites (twilio_message_sid) WHERE twilio_message_sid IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS flight_log_posts_public_idx ON flight_log.posts (status, visibility, published_at DESC)`,
  `CREATE INDEX IF NOT EXISTS flight_log_comments_post_idx ON flight_log.comments (post_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS flight_log_media_post_idx ON flight_log.media_assets (post_id, sort_order)`,
  `INSERT INTO website.schema_migrations (version, name) VALUES (2, 'flight_log_roles_and_moderation') ON CONFLICT (version) DO NOTHING`,
  `INSERT INTO website.schema_migrations (version, name) VALUES (1, 'website_and_flight_log_foundation') ON CONFLICT (version) DO NOTHING`,
];


function databaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
}

function sslRequired(url: string) {
  return /sslmode=require/i.test(url) || process.env.POSTGRES_SSL === "true";
}

function config(): DatabaseConfig | null {
  const connectionString = databaseUrl();
  if (!connectionString) return null;
  return {
    connectionString,
    ...(sslRequired(connectionString) ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}

export function databaseConfigured() {
  return Boolean(config());
}

export function safeDatabaseSummary() {
  const url = databaseUrl();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parsed.port || "5432",
      database: parsed.pathname.replace(/^\//, "") || null,
      ssl: sslRequired(url),
    };
  } catch {
    return { host: "Configured", port: null, database: null, ssl: sslRequired(url) };
  }
}

function getPool() {
  const current = config();
  if (!current) throw new Error("DATABASE_URL is not configured.");
  if (!pool) pool = new Pool({ ...current, max: 3, idleTimeoutMillis: 30000, connectionTimeoutMillis: 7000 });
  return pool;
}

async function migrateDatabaseSchema() {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    for (const statement of schemaStatements) await client.query(statement);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    schemaReady = undefined;
    throw error;
  } finally {
    client.release();
  }
}

export async function ensureDatabaseSchema() {
  if (!databaseConfigured()) throw new Error("DATABASE_URL is not configured.");
  schemaReady ??= migrateDatabaseSchema();
  return schemaReady;
}

export async function withDatabase<T>(callback: (client: PoolClient) => Promise<T>, options: { skipSchema?: boolean } = {}) {
  if (!options.skipSchema) await ensureDatabaseSchema();
  const client = await getPool().connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

export function quoteIdentifier(value: string) {
  return '"' + value.replace(/"/g, '""') + '"';
}
