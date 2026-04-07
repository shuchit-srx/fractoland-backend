'use strict';

const express = require('express');
const GovtController = require('../controllers/GovtController');
const { govtAuth } = require('../middleware/govtAuth');

const router = express.Router();

router.get('/v1/ventures', govtAuth(['ventures.list']), GovtController.listVentures);
router.get('/v1/ventures/:id', govtAuth(['ventures.read']), GovtController.getVenture);
router.get('/v1/ventures/:id/ownership', govtAuth(['ownership.read']), GovtController.ownershipSnapshot);

module.exports = router;
