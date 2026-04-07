'use strict';

const { adminSupabase } = require('../config/database');

/** Sum completed investment tokens per venture for a user. */
async function getTokenWeightByVenture(userId) {
  const { data, error } = await adminSupabase
    .from('investments')
    .select('venture_id, token_count')
    .eq('user_id', userId)
    .eq('status', 'completed');
  if (error) throw error;
  const map = {};
  for (const row of data || []) {
    const vid = row.venture_id;
    if (!vid) continue;
    map[vid] = (map[vid] || 0) + Number(row.token_count ?? 0);
  }
  return map;
}

function mapPollRow(p, voteRow, eligibleTokenWeight) {
  const voted = !!voteRow;
  const your_vote = voteRow?.vote || null;
  const your_token_weight = voteRow?.token_weight != null ? Number(voteRow.token_weight) : null;
  return {
    id: p.id,
    venture_id: p.venture_id,
    venture_name: p.ventures?.name || null,
    type: p.type,
    question: p.question,
    description: p.description,
    rule: p.rule ?? null,
    starts_at: p.starts_at ?? null,
    ends_at: p.ends_at ?? null,
    status: p.status,
    result: p.result ?? null,
    yes_count: p.yes_count ?? 0,
    no_count: p.no_count ?? 0,
    total_eligible_tokens: p.total_eligible_tokens != null ? Number(p.total_eligible_tokens) : null,
    voted,
    your_vote,
    your_token_weight,
    eligible_token_weight: eligibleTokenWeight != null ? Number(eligibleTokenWeight) : 0,
  };
}

/**
 * Polls for ventures the user holds completed tokens in. Empty list if not authenticated or no holdings.
 */
async function listForUser({ userId, status = 'active', limit = 20, offset = 0 } = {}) {
  if (!userId) {
    return { items: [], total: 0 };
  }

  const weightByVenture = await getTokenWeightByVenture(userId);
  const ventureIds = Object.keys(weightByVenture).filter((vid) => weightByVenture[vid] > 0);
  if (ventureIds.length === 0) {
    return { items: [], total: 0 };
  }

  let q = adminSupabase
    .from('polls')
    .select(
      'id, venture_id, type, question, description, rule, starts_at, ends_at, status, result, yes_count, no_count, total_eligible_tokens, ventures(id, name)',
      { count: 'exact' }
    )
    .in('venture_id', ventureIds)
    .order('ends_at', { ascending: true })
    .range(offset, offset + limit - 1);

  if (status === 'active') q = q.eq('status', 'active');
  else if (status === 'closed') q = q.eq('status', 'closed');

  const { data, error, count } = await q;
  if (error) throw error;

  const polls = data || [];
  const pollIds = polls.map((p) => p.id);
  let votesByPoll = {};
  if (pollIds.length > 0) {
    const { data: voteRows, error: vErr } = await adminSupabase
      .from('poll_votes')
      .select('poll_id, vote, token_weight')
      .eq('user_id', userId)
      .in('poll_id', pollIds);
    if (vErr) throw vErr;
    for (const v of voteRows || []) {
      votesByPoll[v.poll_id] = v;
    }
  }

  const items = polls.map((p) =>
    mapPollRow(p, votesByPoll[p.id], weightByVenture[p.venture_id] || 0)
  );

  return { items, total: count ?? 0 };
}

async function getByIdForUser(pollId, userId) {
  if (!userId) {
    const err = new Error('Authentication required');
    err.status = 401;
    throw err;
  }

  const weightByVenture = await getTokenWeightByVenture(userId);

  const { data: poll, error } = await adminSupabase
    .from('polls')
    .select(
      'id, venture_id, type, question, description, rule, starts_at, ends_at, status, result, yes_count, no_count, total_eligible_tokens, ventures(id, name)'
    )
    .eq('id', pollId)
    .maybeSingle();
  if (error) throw error;
  if (!poll) {
    const err = new Error('Poll not found');
    err.status = 404;
    throw err;
  }

  const weight = weightByVenture[poll.venture_id] || 0;
  if (weight <= 0) {
    const err = new Error('You are not eligible to view this poll');
    err.status = 403;
    throw err;
  }

  const { data: voteRow } = await adminSupabase
    .from('poll_votes')
    .select('poll_id, vote, token_weight')
    .eq('poll_id', pollId)
    .eq('user_id', userId)
    .maybeSingle();

  return mapPollRow(poll, voteRow, weight);
}

async function castVote(userId, pollId, voteRaw) {
  const vote = String(voteRaw || '').toLowerCase();
  if (!['yes', 'no'].includes(vote)) {
    const err = new Error('vote must be yes or no');
    err.status = 400;
    throw err;
  }

  const { data: poll, error: pollErr } = await adminSupabase
    .from('polls')
    .select('id, venture_id, status, starts_at, ends_at')
    .eq('id', pollId)
    .maybeSingle();
  if (pollErr) throw pollErr;
  if (!poll) {
    const err = new Error('Poll not found');
    err.status = 404;
    throw err;
  }
  if (poll.status !== 'active') {
    const err = new Error('Poll is not active');
    err.status = 400;
    throw err;
  }

  const now = new Date();
  if (poll.starts_at) {
    const start = new Date(poll.starts_at);
    if (now < start) {
      const err = new Error('Poll has not started yet');
      err.status = 400;
      throw err;
    }
  }
  if (poll.ends_at) {
    const end = new Date(poll.ends_at);
    if (now > end) {
      const err = new Error('Poll has ended');
      err.status = 400;
      throw err;
    }
  }

  const weightByVenture = await getTokenWeightByVenture(userId);
  const tokenWeight = weightByVenture[poll.venture_id] || 0;
  if (tokenWeight <= 0) {
    const err = new Error('You must hold tokens in this venture to vote');
    err.status = 403;
    throw err;
  }

  const { data: existing } = await adminSupabase
    .from('poll_votes')
    .select('id')
    .eq('poll_id', pollId)
    .eq('user_id', userId)
    .maybeSingle();
  if (existing) {
    const err = new Error('You have already voted on this poll');
    err.status = 409;
    throw err;
  }

  const { error: insErr } = await adminSupabase.from('poll_votes').insert({
    poll_id: pollId,
    user_id: userId,
    vote,
    token_weight: tokenWeight,
  });
  if (insErr) {
    if (insErr.code === '23505') {
      const err = new Error('You have already voted on this poll');
      err.status = 409;
      throw err;
    }
    throw insErr;
  }

  const { error: rpcErr } = await adminSupabase.rpc('refresh_poll_vote_tallies', { p_poll_id: pollId });
  if (rpcErr) {
    console.error('refresh_poll_vote_tallies failed (run migration 006):', rpcErr.message);
    const { data: votes } = await adminSupabase.from('poll_votes').select('vote, token_weight').eq('poll_id', pollId);
    let yesSum = 0;
    let noSum = 0;
    for (const row of votes || []) {
      const w = Number(row.token_weight ?? 0);
      if (row.vote === 'yes') yesSum += w;
      else if (row.vote === 'no') noSum += w;
    }
    await adminSupabase.from('polls').update({ yes_count: yesSum, no_count: noSum }).eq('id', pollId);
  }

  return { success: true, token_weight: tokenWeight, vote };
}

module.exports = { listForUser, getByIdForUser, castVote, getTokenWeightByVenture };
