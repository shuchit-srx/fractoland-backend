'use strict';

const express = require('express');
const AdminController = require('../controllers/AdminController');
const { authMiddleware } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');

const router = express.Router();

router.use(authMiddleware, requireRole(['admin']));

router.get('/analytics', AdminController.analytics);

router.get('/ventures', AdminController.listVentures);
router.get('/ventures/:id', AdminController.getVenture);
router.patch('/ventures/:id', AdminController.updateVenture);

router.get('/resale-requests', AdminController.listResaleQueue);
router.patch('/resale-requests/:id', AdminController.patchResaleRequest);

router.get('/polls', AdminController.listPolls);

router.get('/developer-bids', AdminController.listDeveloperBids);
router.patch('/developer-bids/:id', AdminController.patchDeveloperBid);

router.get('/payments', AdminController.listPayments);

router.get('/audit-logs', AdminController.listAuditLogs);

router.post('/govt-api-tokens', AdminController.createGovtToken);
router.get('/govt-api-tokens', AdminController.listGovtTokens);

module.exports = router;
