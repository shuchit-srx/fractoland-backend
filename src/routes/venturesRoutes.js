'use strict';

const express = require('express');
const multer = require('multer');
const VenturesController = require('../controllers/VenturesController');
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

router.get('/', optionalAuthMiddleware, VenturesController.list);
router.get('/:id', optionalAuthMiddleware, VenturesController.getById);
router.get('/:id/tokens', optionalAuthMiddleware, VenturesController.getTokens);

router.post('/', authMiddleware, requireRole(['owner', 'admin']), VenturesController.create);
router.patch('/:id', authMiddleware, requireRole(['owner', 'admin']), VenturesController.update);
router.post('/:id/documents', authMiddleware, requireRole(['owner', 'admin']), upload.single('file'), VenturesController.uploadDocument);
router.post('/:id/images', authMiddleware, requireRole(['owner', 'admin']), upload.single('file'), VenturesController.uploadImage);

module.exports = router;
