'use strict';

const express = require('express');
const WishlistController = require('../controllers/WishlistController');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, WishlistController.list);
router.post('/', authMiddleware, WishlistController.create);
router.delete('/:id', authMiddleware, WishlistController.removeItem);

module.exports = router;
