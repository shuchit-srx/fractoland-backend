'use strict';

const express = require('express');
const WalletsController = require('../controllers/WalletsController');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.get('/me', authMiddleware, WalletsController.getMe);

module.exports = router;
