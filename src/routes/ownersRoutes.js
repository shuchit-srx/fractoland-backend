'use strict';

const express = require('express');
const OwnersController = require('../controllers/OwnersController');
const { authMiddleware } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');

const router = express.Router();

router.use(authMiddleware, requireRole(['owner', 'admin']));

router.get('/me/polls', OwnersController.listPolls);
router.post('/me/polls', OwnersController.createPoll);
router.get('/me/proceeds', OwnersController.proceeds);

module.exports = router;
