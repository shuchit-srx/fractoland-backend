'use strict';

require('dotenv').config();
const { adminSupabase } = require('../src/config/database');

const SEED_OWNER_PHONE = '+919876543210';
const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800&h=500&fit=crop';

const VENTURES = [
  { name: 'Green Valley Plot A12', district: 'Bangalore Urban', state: 'Karnataka', location: 'Bangalore, Karnataka', total_value: 5000000, token_price: 25000, total_tokens: 200, available_tokens: 150, lock_in_months: 18, expected_roi_percent: 13.5, area_acres: 2.5, image: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=400&h=300&fit=crop' },
  { name: 'Sunrise Estate B7', district: 'Hyderabad', state: 'Telangana', location: 'Hyderabad, Telangana', total_value: 7500000, token_price: 50000, total_tokens: 150, available_tokens: 80, lock_in_months: 24, expected_roi_percent: 16.5, area_acres: 3.2, image: 'https://images.unsplash.com/photo-1628744448840-55bdb2497bd4?w=400&h=300&fit=crop' },
  { name: 'Metro Park C3', district: 'Chennai', state: 'Tamil Nadu', location: 'Chennai, Tamil Nadu', total_value: 3500000, token_price: 15000, total_tokens: 250, available_tokens: 200, lock_in_months: 12, expected_roi_percent: 9, area_acres: 1.8, image: 'https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?w=400&h=300&fit=crop' },
  { name: 'Lake View D9', district: 'Pune', state: 'Maharashtra', location: 'Pune, Maharashtra', total_value: 10000000, token_price: 100000, total_tokens: 100, available_tokens: 45, lock_in_months: 36, expected_roi_percent: 20, area_acres: 4, image: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=400&h=300&fit=crop' },
  { name: 'Highway Corridor E5', district: 'Mumbai', state: 'Maharashtra', location: 'Mumbai, Maharashtra', total_value: 25000000, token_price: 200000, total_tokens: 125, available_tokens: 30, lock_in_months: 48, expected_roi_percent: 22, area_acres: 5, image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop' },
  { name: 'Tech Park Zone F2', district: 'Bangalore Urban', state: 'Karnataka', location: 'Bangalore, Karnataka', total_value: 8500000, token_price: 75000, total_tokens: 120, available_tokens: 60, lock_in_months: 24, expected_roi_percent: 15.5, area_acres: 2.8, image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400&h=300&fit=crop' },
];

function ref() {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `V-SEED-${t}-${r}`;
}

async function run() {
  console.log('Seeding database...');

  let ownerId;
  const { data: existing } = await adminSupabase.from('users').select('id').eq('phone', SEED_OWNER_PHONE).maybeSingle();
  if (existing) {
    ownerId = existing.id;
    console.log('Using existing seed owner:', ownerId);
  } else {
    const { data: user, error: userErr } = await adminSupabase.from('users').insert({
      phone: SEED_OWNER_PHONE,
      name: 'Seed Land Owner',
      email: 'owner@fractoland-seed.com',
      role: 'owner',
      country_code: '+91',
    }).select('id').single();
    if (userErr) {
      console.error('Failed to create seed user:', userErr);
      process.exit(1);
    }
    ownerId = user.id;
    console.log('Created seed owner:', ownerId);
  }

  const { data: existingVentures } = await adminSupabase.from('ventures').select('id').like('ref', 'V-SEED-%').limit(1);
  if (existingVentures && existingVentures.length > 0) {
    console.log('Seed ventures already exist. Skipping venture creation.');
    console.log('Seed completed.');
    return;
  }

  for (const v of VENTURES) {
    const refId = ref();
    const { data: venture, error: ventureErr } = await adminSupabase.from('ventures').insert({
      ref: refId,
      owner_id: ownerId,
      name: v.name,
      status: 'live',
      district: v.district,
      state: v.state,
      country: 'India',
      full_address: `${v.name}, ${v.location}`,
      area_acres: v.area_acres,
      total_value: v.total_value,
      expected_roi_percent: v.expected_roi_percent,
      lock_in_months: v.lock_in_months,
      description: `Prime land parcel: ${v.name}. Government verified and blockchain registered.`,
      features: ['Government Verified', 'Blockchain Registered', 'Clear Title', 'Road Access'],
      exit_conditions: ['Minimum lock-in as per terms.', 'Exit window subject to buyer availability.'],
    }).select('id').single();

    if (ventureErr) {
      console.error('Failed to create venture', v.name, ventureErr);
      continue;
    }

    await adminSupabase.from('venture_tokens').insert({
      venture_id: venture.id,
      token_price: v.token_price,
      total_tokens: v.total_tokens,
      available_tokens: v.available_tokens,
    });

    await adminSupabase.from('venture_images').insert({
      venture_id: venture.id,
      file_url: v.image,
      sort_order: 0,
    });

    console.log('  Created venture:', v.name, venture.id);
  }

  console.log('Seed completed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
