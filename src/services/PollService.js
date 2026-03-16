'use strict';

const { adminSupabase } = require('../config/database');

async function listActive({ userId, limit = 20, offset = 0 } = {}) {
  let q = adminSupabase
    .from('polls')
    .select('id, venture_id, type, question, description, ends_at, status, yes_count, no_count, ventures(id, name)', { count: 'exact' })
    .eq('status', 'active')
    .order('ends_at', { ascending: true })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await q;
  if (error) throw error;

  const items = (data || []).map((p) => ({
    id: p.id,
    venture_id: p.venture_id,
    venture_name: p.ventures?.name || null,
    type: p.type,
    question: p.question,
    description: p.description,
    ends_at: p.ends_at,
    status: p.status,
    yes_count: p.yes_count ?? 0,
    no_count: p.no_count ?? 0,
  }));

  return { items, total: count ?? 0 };
}

module.exports = { listActive };
