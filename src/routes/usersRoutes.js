'use strict';

const express = require('express');
const UsersController = require('../controllers/UsersController');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/me', UsersController.getMe);
router.patch('/me', UsersController.updateMe);
router.post('/me/kyc', UsersController.kycSubmit);

module.exports = router;
