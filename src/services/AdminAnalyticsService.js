'use strict';

const { adminSupabase } = require('../config/database');

async function getSummary() {
  const [
    usersRes,
    venturesRes,
    paymentsRes,
    investmentsRes,
    resaleRes,
    bidsRes,
    pollsRes,
  ] = await Promise.all([
    adminSupabase.from('users').select('role'),
    adminSupabase.from('ventures').select('status'),
    adminSupabase.from('payments').select('amount, type, status'),
    adminSupabase.from('investments').select('status'),
    adminSupabase.from('resale_requests').select('status'),
    adminSupabase.from('developer_bids').select('status'),
    adminSupabase.from('polls').select('status'),
  ]);

  const usersByRole = {};
  for (const r of usersRes.data || []) {
    const role = r.role || 'unknown';
    usersByRole[role] = (usersByRole[role] || 0) + 1;
  }

  const venturesByStatus = {};
  for (const r of venturesRes.data || []) {
    const s = r.status || 'unknown';
    venturesByStatus[s] = (venturesByStatus[s] || 0) + 1;
  }

  let paymentVolumeCompleted = 0;
  const paymentsByType = {};
  const paymentsByStatus = {};
  for (const p of paymentsRes.data || []) {
    paymentsByStatus[p.status] = (paymentsByStatus[p.status] || 0) + 1;
    if (p.status === 'completed') {
      const amt = Number(p.amount ?? 0);
      paymentVolumeCompleted += amt;
      const t = p.type || 'unknown';
      paymentsByType[t] = (paymentsByType[t] || 0) + amt;
    }
  }

  const investmentsByStatus = {};
  for (const r of investmentsRes.data || []) {
    const s = r.status || 'unknown';
    investmentsByStatus[s] = (investmentsByStatus[s] || 0) + 1;
  }

  const resaleByStatus = {};
  for (const r of resaleRes.data || []) {
    const s = r.status || 'unknown';
    resaleByStatus[s] = (resaleByStatus[s] || 0) + 1;
  }

  const bidsByStatus = {};
  for (const r of bidsRes.data || []) {
    const s = r.status || 'unknown';
    bidsByStatus[s] = (bidsByStatus[s] || 0) + 1;
  }

  const pollsByStatus = {};
  for (const r of pollsRes.data || []) {
    const s = r.status || 'unknown';
    pollsByStatus[s] = (pollsByStatus[s] || 0) + 1;
  }

  return {
    users_total: usersRes.data?.length ?? 0,
    users_by_role: usersByRole,
    ventures_total: venturesRes.data?.length ?? 0,
    ventures_by_status: venturesByStatus,
    payments_total: paymentsRes.data?.length ?? 0,
    payments_by_status: paymentsByStatus,
    payment_volume_completed_inr: paymentVolumeCompleted,
    payment_volume_by_type_inr: paymentsByType,
    investments_total: investmentsRes.data?.length ?? 0,
    investments_by_status: investmentsByStatus,
    resale_requests_total: resaleRes.data?.length ?? 0,
    resale_by_status: resaleByStatus,
    developer_bids_total: bidsRes.data?.length ?? 0,
    developer_bids_by_status: bidsByStatus,
    polls_total: pollsRes.data?.length ?? 0,
    polls_by_status: pollsByStatus,
  };
}

module.exports = { getSummary };
