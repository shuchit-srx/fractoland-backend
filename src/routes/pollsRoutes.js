'use strict';

const express = require('express');
const PollsController = require('../controllers/PollsController');
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/auth');

const router = express.Router();

router.post('/:id/vote', authMiddleware, PollsController.vote);
router.get('/:id', optionalAuthMiddleware, PollsController.getOne);
router.get('/', optionalAuthMiddleware, PollsController.list);

module.exports = router;
