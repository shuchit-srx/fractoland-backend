'use strict';

const { v4: uuidv4 } = require('uuid');
const { adminSupabase } = require('../config/database');

const VENTURE_STATUSES = ['draft', 'under_verification', 'live', 'voting', 'sold', 'closed'];

function generateRef() {
  const t = Date.now().toString(36).toUpperCase();
  const r = uuidv4().slice(0, 6).toUpperCase();
  return `V-${t}-${r}`;
}

/**
 * List ventures with filters. Public: status=live only. Owner: owner_id=me. Admin: all.
 */
async function list({ status, state, min_value, owner_id, mature_for_bid, limit = 20, offset = 0 }, userId, userRole) {
  let q = adminSupabase.from('ventures').select('id, ref, name, owner_id, land_type, status, district, state, country, full_address, area_acres, total_value, expected_roi_percent, lock_in_months, map_center_lat, map_center_lng, created_at, updated_at, venture_tokens(token_price, total_tokens, available_tokens), venture_images(file_url)', { count: 'exact' });

  if (owner_id === 'me' && userId) {
    q = q.eq('owner_id', userId);
  } else if (owner_id) {
    q = q.eq('owner_id', owner_id);
  }

  if (status) q = q.eq('status', status);
  if (state) q = q.eq('state', state);
  if (min_value != null) q = q.gte('total_value', min_value);
  if (mature_for_bid === 'true') q = q.in('status', ['live', 'voting', 'sold']);

  const matureCatalogOk = mature_for_bid === 'true' && (userRole === 'developer' || userRole === 'admin');
  if (userRole !== 'admin' && owner_id !== 'me' && !owner_id) {
    if (!matureCatalogOk) {
      q = q.eq('status', 'live');
    }
  }

  q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await q;
  if (error) throw error;
  const items = (data || []).map((v) => {
    const raw = v.venture_tokens;
    const t = Array.isArray(raw) ? raw[0] : raw || {};
    const imgs = v.venture_images || [];
    const firstImg = Array.isArray(imgs) ? imgs[0] : imgs && typeof imgs === 'object' && 'file_url' in imgs ? imgs : null;
    const { venture_tokens, venture_images, ...rest } = v;
    return {
      ...rest,
      token_price: t.token_price ?? null,
      total_tokens: t.total_tokens ?? 0,
      available_tokens: t.available_tokens ?? 0,
      image_url: firstImg?.file_url ?? null,
    };
  });
  return { items, total: count ?? 0 };
}

/**
 * Get single venture by id with tokens, documents, images. Optionally join land_owner from users.
 */
async function findById(ventureId) {
  const { data: venture, error: vErr } = await adminSupabase
    .from('ventures')
    .select('*')
    .eq('id', ventureId)
    .single();

  if (vErr || !venture) return null;

  const [tokensRes, docsRes, imagesRes, ownerRes] = await Promise.all([
    adminSupabase.from('venture_tokens').select('id, token_price, total_tokens, available_tokens').eq('venture_id', ventureId).maybeSingle(),
    adminSupabase.from('venture_documents').select('id, name, file_key, file_url, file_size_bytes, file_type, verified').eq('venture_id', ventureId).order('created_at'),
    adminSupabase.from('venture_images').select('id, file_key, file_url, sort_order').eq('venture_id', ventureId).order('sort_order'),
    adminSupabase.from('users').select('id, name').eq('id', venture.owner_id).maybeSingle(),
  ]);

  const tokens = tokensRes.data;
  const documents = docsRes.data || [];
  const images = imagesRes.data || [];
  const owner = ownerRes.data;

  return {
    ...venture,
    tokens: tokens || { token_price: null, total_tokens: 0, available_tokens: 0 },
    documents,
    images,
    land_owner: owner ? { id: owner.id, name: owner.name } : null,
  };
}

/**
 * Create venture. Requires name, and either full_address or state; other fields optional.
 */
async function create(payload, ownerId) {
  const id = uuidv4();
  const ref = generateRef();
  const row = {
    id,
    ref,
    owner_id: ownerId,
    name: payload.name,
    land_type: payload.land_type || null,
    status: payload.status || 'draft',
    description: payload.description || null,
    litigation_description: payload.litigation_description || null,
    survey_number: payload.survey_number || null,
    village: payload.village || null,
    hobli: payload.hobli || null,
    mandal: payload.mandal || null,
    district: payload.district || null,
    state: payload.state || null,
    country: payload.country || 'India',
    full_address: payload.full_address || null,
    area_acres: payload.area_acres != null ? payload.area_acres : null,
    price_per_sqft: payload.price_per_sqft != null ? payload.price_per_sqft : null,
    total_value: payload.total_value != null ? payload.total_value : null,
    expected_roi_percent: payload.expected_roi_percent != null ? payload.expected_roi_percent : null,
    lock_in_months: payload.lock_in_months != null ? payload.lock_in_months : null,
    features: payload.features || [],
    exit_conditions: payload.exit_conditions || [],
    map_geojson: payload.map_geojson || null,
    map_center_lat: payload.map_center_lat != null ? payload.map_center_lat : null,
    map_center_lng: payload.map_center_lng != null ? payload.map_center_lng : null,
    contract_address: payload.contract_address || null,
    contract_venture_id: payload.contract_venture_id != null ? payload.contract_venture_id : null,
  };

  const { data, error } = await adminSupabase.from('ventures').insert(row).select().single();
  if (error) throw error;

  if (payload.token_price != null && payload.total_tokens != null) {
    await adminSupabase.from('venture_tokens').insert({
      id: uuidv4(),
      venture_id: id,
      token_price: payload.token_price,
      total_tokens: payload.total_tokens,
      available_tokens: payload.total_tokens,
    });
  }

  return data;
}

/**
 * Update venture (partial).
 */
async function update(ventureId, payload) {
  const allowed = [
    'name', 'land_type', 'status', 'description', 'litigation_description',
    'survey_number', 'village', 'hobli', 'mandal', 'district', 'state', 'country',
    'full_address', 'area_acres', 'price_per_sqft', 'total_value', 'expected_roi_percent',
    'lock_in_months', 'features', 'exit_conditions', 'map_geojson', 'map_center_lat', 'map_center_lng',
    'contract_address', 'contract_venture_id',
  ];
  const updates = {};
  for (const key of Object.keys(payload)) {
    const snake = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (allowed.includes(snake) || allowed.includes(key)) updates[snake] = payload[key];
  }
  if (Object.keys(updates).length === 0) return findById(ventureId);

  const { data, error } = await adminSupabase
    .from('ventures')
    .update(updates)
    .eq('id', ventureId)
    .select()
    .single();

  if (error) throw error;
  return findById(ventureId);
}

/**
 * Get token config for a venture.
 */
async function getTokens(ventureId) {
  const { data, error } = await adminSupabase
    .from('venture_tokens')
    .select('id, token_price, total_tokens, available_tokens')
    .eq('venture_id', ventureId)
    .maybeSingle();

  if (error) throw error;
  return data || { token_price: null, total_tokens: 0, available_tokens: 0 };
}

/**
 * Check if user can edit venture (owner or admin).
 */
function canEdit(venture, userId, userRole) {
  if (userRole === 'admin') return true;
  return venture && venture.owner_id === userId;
}

module.exports = {
  list,
  findById,
  create,
  update,
  getTokens,
  canEdit,
  VENTURE_STATUSES,
};
