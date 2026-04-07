'use strict';

const express = require('express');
const PaymentsController = require('../controllers/PaymentsController');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/me', authMiddleware, PaymentsController.listMe);
router.post('/add-funds', authMiddleware, PaymentsController.addFunds);
router.post('/add-funds/callback', PaymentsController.addFundsCallback);
router.post('/withdraw', authMiddleware, PaymentsController.withdraw);

module.exports = router;

