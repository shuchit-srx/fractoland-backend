'use strict';

const express = require('express');
const DeveloperBidsController = require('../controllers/DeveloperBidsController');
const { authMiddleware } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');

const router = express.Router();

router.use(authMiddleware, requireRole(['developer']));

router.post('/', DeveloperBidsController.place);
router.get('/me', DeveloperBidsController.listMe);
router.get('/me/projects', DeveloperBidsController.listProjects);

module.exports = router;
