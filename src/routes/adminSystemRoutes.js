import express from 'express';
import { updateMaintenance, getSystemInfo } from '../controllers/systemController.js';
import { protect, adminOnly } from '../middleware/authMiddleware.js';

const router = express.Router();

router.put('/maintenance', protect, adminOnly, updateMaintenance);
router.get('/system/info', protect, adminOnly, getSystemInfo);

export default router;
