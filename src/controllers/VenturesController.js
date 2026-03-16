'use strict';

const { v4: uuidv4 } = require('uuid');
const VentureService = require('../services/VentureService');
const StorageService = require('../services/StorageService');
const { adminSupabase } = require('../config/database');

async function list(req, res) {
  try {
    const { status, state, min_value, owner_id, mature_for_bid, limit, offset } = req.query;
    const result = await VentureService.list(
      {
        status,
        state,
        min_value: min_value != null ? Number(min_value) : undefined,
        owner_id,
        mature_for_bid,
        limit: limit != null ? Math.min(Number(limit), 100) : 20,
        offset: offset != null ? Number(offset) : 0,
      },
      req.userId,
      req.userRole
    );
    res.json(result);
  } catch (e) {
    console.error('ventures list error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

async function getById(req, res) {
  try {
    const venture = await VentureService.findById(req.params.id);
    if (!venture) return res.status(404).json({ error: 'Not found', message: 'Venture not found' });
    if (venture.status !== 'live' && req.userRole !== 'admin' && venture.owner_id !== req.userId) {
      return res.status(404).json({ error: 'Not found', message: 'Venture not found' });
    }
    res.json(venture);
  } catch (e) {
    console.error('ventures getById error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

async function getTokens(req, res) {
  try {
    const tokens = await VentureService.getTokens(req.params.id);
    const venture = await VentureService.findById(req.params.id);
    if (!venture) return res.status(404).json({ error: 'Not found', message: 'Venture not found' });
    if (venture.status !== 'live' && req.userRole !== 'admin' && venture.owner_id !== req.userId) {
      return res.status(404).json({ error: 'Not found', message: 'Venture not found' });
    }
    res.json(tokens);
  } catch (e) {
    console.error('ventures getTokens error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

async function create(req, res) {
  try {
    const payload = req.body || {};
    if (!payload.name) {
      return res.status(400).json({ error: 'Bad request', message: 'name is required' });
    }
    const ownerId = req.userRole === 'admin' && payload.owner_id ? payload.owner_id : req.userId;
    const venture = await VentureService.create(payload, ownerId);
    res.status(201).json(venture);
  } catch (e) {
    console.error('ventures create error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

async function update(req, res) {
  try {
    const venture = await VentureService.findById(req.params.id);
    if (!venture) return res.status(404).json({ error: 'Not found', message: 'Venture not found' });
    if (!VentureService.canEdit(venture, req.userId, req.userRole)) {
      return res.status(403).json({ error: 'Forbidden', message: 'Cannot edit this venture' });
    }
    const updated = await VentureService.update(req.params.id, req.body || {});
    res.json(updated);
  } catch (e) {
    console.error('ventures update error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

async function uploadDocument(req, res) {
  try {
    const ventureId = req.params.id;
    const venture = await VentureService.findById(ventureId);
    if (!venture) return res.status(404).json({ error: 'Not found', message: 'Venture not found' });
    if (!VentureService.canEdit(venture, req.userId, req.userRole)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!StorageService.isConfigured()) {
      return res.status(503).json({ error: 'Service unavailable', message: 'File storage not configured' });
    }
    const file = req.file;
    if (!file || !file.buffer) {
      return res.status(400).json({ error: 'Bad request', message: 'No file uploaded' });
    }
    const name = req.body.name || file.originalname || 'Document';
    const key = StorageService.buildKey(ventureId, 'documents', file.originalname);
    await StorageService.uploadBuffer(file.buffer, key, file.mimetype || 'application/octet-stream');
    const fileUrl = await StorageService.getSignedDownloadUrl(key) || key;

    const id = uuidv4();
    const { data, error } = await adminSupabase
      .from('venture_documents')
      .insert({
        id,
        venture_id: ventureId,
        name,
        file_key: key,
        file_url: fileUrl,
        file_size_bytes: file.size,
        file_type: (file.mimetype || '').split('/').pop() || 'bin',
        verified: false,
      })
      .select('id, name, file_url, verified')
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('ventures uploadDocument error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

async function uploadImage(req, res) {
  try {
    const ventureId = req.params.id;
    const venture = await VentureService.findById(ventureId);
    if (!venture) return res.status(404).json({ error: 'Not found', message: 'Venture not found' });
    if (!VentureService.canEdit(venture, req.userId, req.userRole)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!StorageService.isConfigured()) {
      return res.status(503).json({ error: 'Service unavailable', message: 'File storage not configured' });
    }
    const file = req.file;
    if (!file || !file.buffer) {
      return res.status(400).json({ error: 'Bad request', message: 'No file uploaded' });
    }
    const sortOrder = req.body.sort_order != null ? Number(req.body.sort_order) : 0;
    const key = StorageService.buildKey(ventureId, 'images', file.originalname);
    await StorageService.uploadBuffer(file.buffer, key, file.mimetype || 'image/jpeg');
    const fileUrl = await StorageService.getSignedDownloadUrl(key) || key;

    const id = uuidv4();
    const { data, error } = await adminSupabase
      .from('venture_images')
      .insert({
        id,
        venture_id: ventureId,
        file_key: key,
        file_url: fileUrl,
        sort_order: sortOrder,
      })
      .select('id, file_url, sort_order')
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('ventures uploadImage error', e);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = {
  list,
  getById,
  getTokens,
  create,
  update,
  uploadDocument,
  uploadImage,
};
