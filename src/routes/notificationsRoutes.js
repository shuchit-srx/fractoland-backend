'use strict';

const express = require('express');
const NotificationsController = require('../controllers/NotificationsController');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

router.get('/me', NotificationsController.listMe);
router.patch('/me/read-all', NotificationsController.markAllRead);
router.patch('/me/:id/read', NotificationsController.markRead);
router.delete('/me/:id', NotificationsController.remove);

module.exports = router;
