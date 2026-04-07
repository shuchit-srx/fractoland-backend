'use strict';

const express = require('express');
const InvestmentsController = require('../controllers/InvestmentsController');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.post('/', authMiddleware, InvestmentsController.create);
router.get('/me', authMiddleware, InvestmentsController.listMe);
router.get('/me/stats', authMiddleware, InvestmentsController.getStats);

module.exports = router;
