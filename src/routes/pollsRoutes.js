'use strict';

const express = require('express');
const PollsController = require('../controllers/PollsController');
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/auth');

const router = express.Router();
router.get('/', optionalAuthMiddleware, PollsController.list);

module.exports = router;
