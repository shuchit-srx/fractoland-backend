'use strict';

const express = require('express');
const ReferralsController = require('../controllers/ReferralsController');
const { authMiddleware } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');

const router = express.Router();

router.post('/track/:code', ReferralsController.trackClick);

router.get('/me/links', authMiddleware, requireRole(['agent', 'admin']), ReferralsController.listLinks);
router.post('/me/links', authMiddleware, requireRole(['agent', 'admin']), ReferralsController.createLink);
router.patch('/me/links/:id', authMiddleware, requireRole(['agent', 'admin']), ReferralsController.updateLink);
router.delete('/me/links/:id', authMiddleware, requireRole(['agent', 'admin']), ReferralsController.deleteLink);

router.get('/me/referred-users', authMiddleware, requireRole(['agent', 'admin']), ReferralsController.referredUsers);
router.get('/me/earnings', authMiddleware, requireRole(['agent', 'admin']), ReferralsController.earnings);
router.post('/me/withdraw', authMiddleware, requireRole(['agent', 'admin']), ReferralsController.withdraw);
router.get('/me/withdrawals', authMiddleware, requireRole(['agent', 'admin']), ReferralsController.listWithdrawals);
router.get('/me/ledger', authMiddleware, requireRole(['agent', 'admin']), ReferralsController.ledger);

module.exports = router;
