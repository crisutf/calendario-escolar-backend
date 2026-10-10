import express from 'express';
import { getAdminEvents, createEvent, updateEvent, deleteEvent } from '../controllers/eventsController.js';
import { protect, tutorOnly } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect, tutorOnly);

router.get('/events', getAdminEvents);
router.post('/events', createEvent);
router.put('/events/:id', updateEvent);
router.delete('/events/:id', deleteEvent);

export default router;
