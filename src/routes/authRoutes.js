import express from 'express';
import {
  loginWithPassword,
  googleLogin,
  handleGoogleCallback,
  getGoogleAuthUrl,
  adminLogin,
  me,
  logout,
} from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/login', loginWithPassword);
router.get('/google', handleGoogleCallback);
router.get('/google/callback', handleGoogleCallback);
router.get('/google/url', getGoogleAuthUrl);
router.post('/google', googleLogin);
router.post('/admin-login', adminLogin);
router.get('/me', protect, me);
router.post('/logout', protect, logout);

export default router;
