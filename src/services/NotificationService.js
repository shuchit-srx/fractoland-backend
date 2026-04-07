'use strict';

const { adminSupabase } = require('../config/database');

const TYPES = ['success', 'action', 'info', 'alert'];

async function create(userId, { title, message, type = 'info', metadata = {} }) {
  if (!userId) return null;
  const t = TYPES.includes(type) ? type : 'info';
  const { data, error } = await adminSupabase
    .from('notifications')
    .insert({
      user_id: userId,
      title: String(title || '').slice(0, 255),
      message: message != null ? String(message) : null,
      type: t,
      read: false,
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
    })
    .select('id')
    .single();
  if (error) {
    console.error('notification insert failed', error.message);
    return null;
  }
  return data;
}

async function listForUser(userId, { read, limit = 30, offset = 0 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 30, 1), 100);
  const off = Math.max(Number(offset) || 0, 0);
  let q = adminSupabase
    .from('notifications')
    .select('id, title, message, type, read, metadata, created_at', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(off, off + lim - 1);
  if (read === 'true') q = q.eq('read', true);
  if (read === 'false') q = q.eq('read', false);
  const { data, error, count } = await q;
  if (error) throw error;
  return { items: data || [], total: count ?? 0 };
}

async function markRead(userId, notificationId) {
  const { data, error } = await adminSupabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const err = new Error('Notification not found');
    err.status = 404;
    throw err;
  }
  return data;
}

async function markAllRead(userId) {
  const { error } = await adminSupabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
  if (error) throw error;
  return { success: true };
}

async function remove(userId, notificationId) {
  const { data, error } = await adminSupabase.from('notifications').delete().eq('id', notificationId).eq('user_id', userId).select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    const err = new Error('Notification not found');
    err.status = 404;
    throw err;
  }
  return { success: true };
}

module.exports = { create, listForUser, markRead, markAllRead, remove, TYPES };
