import express from 'express';
import { getPublicEvents } from '../controllers/eventsController.js';

const router = express.Router();

router.get('/', getPublicEvents);

export default router;
