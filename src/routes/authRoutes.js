'use strict';

const express = require('express');
const AuthController = require('../controllers/AuthController');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.post('/otp/send', AuthController.sendOtp);
router.post('/otp/check', AuthController.checkOtp);
router.post('/otp/verify', AuthController.verifyOtp);
router.post('/refresh', AuthController.refresh);
router.post('/logout', authMiddleware, AuthController.logout);
router.post('/login-with-wallet', AuthController.loginWithWallet);
router.post('/link-wallet', authMiddleware, AuthController.linkWallet);

module.exports = router;
