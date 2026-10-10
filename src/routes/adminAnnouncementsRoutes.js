import express from 'express';
import { getAdminAnnouncements, createAnnouncement, deleteAnnouncement } from '../controllers/announcementsController.js';
import { protect, tutorOnly } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.get('/announcements', tutorOnly, getAdminAnnouncements);
router.post('/announcements', tutorOnly, createAnnouncement);
router.delete('/announcements/:id', tutorOnly, deleteAnnouncement);

export default router;
