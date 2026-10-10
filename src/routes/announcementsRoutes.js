import express from 'express';
import { getPublicAnnouncements } from '../controllers/announcementsController.js';

const router = express.Router();

router.get('/', getPublicAnnouncements);

export default router;
