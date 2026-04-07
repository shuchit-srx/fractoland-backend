'use strict';

const express = require('express');
const ResaleController = require('../controllers/ResaleController');
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');

const router = express.Router();

router.get('/marketplace', optionalAuthMiddleware, ResaleController.marketplace);
router.post('/:id/purchase', authMiddleware, ResaleController.purchase);

router.post('/', authMiddleware, ResaleController.create);
router.get('/me', authMiddleware, ResaleController.listMe);
router.get('/me/ventures/:ventureId/availability', authMiddleware, ResaleController.availability);
router.post('/me/:id/cancel', authMiddleware, ResaleController.cancel);

router.get('/admin/queue', authMiddleware, requireRole(['admin']), ResaleController.adminList);
router.patch('/admin/:id', authMiddleware, requireRole(['admin']), ResaleController.adminPatch);

module.exports = router;
