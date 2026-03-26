import { Request, Response } from 'express';
import { authenticate, changePassword } from '../services/auth.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import logger from '../services/logger.service';

/** Mask username: keep first char, mask the rest with '*' */
function maskUser(name: string): string {
  if (!name) return '***';
  if (name.length <= 1) return name[0] + '**';
  return name[0] + '*'.repeat(Math.min(name.length - 1, 5));
}

export async function login(req: Request, res: Response): Promise<void> {
  const { username, password } = req.body;

  if (!username || !password) {
    logger.warn(`Login rejected: missing credentials`, { hasUsername: !!username, hasPassword: !!password });
    res.status(400).json({ code: 400, message: 'Username and password are required' });
    return;
  }

  const masked = maskUser(username);

  try {
    const token = await authenticate(username, password);
    if (!token) {
      logger.warn(`Login failed`, { user: masked });
      res.status(401).json({ code: 401, message: 'Invalid username or password' });
      return;
    }

    logger.debug(`Login successful`, { user: masked });
    res.json({ code: 0, message: 'Login successful', data: { token, username } });
  } catch (err: any) {
    logger.error(`Login error: ${err.message}`, { user: masked, stack: err.stack });
    res.status(500).json({ code: 500, message: 'Internal server error' });
  }
}

export async function updatePassword(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { oldPassword, newPassword } = req.body;
  const username = req.user?.username;

  if (!username) {
    res.status(401).json({ code: 401, message: 'Authentication required' });
    return;
  }

  if (!oldPassword || !newPassword) {
    res.status(400).json({ code: 400, message: 'Old and new passwords are required' });
    return;
  }

  if (newPassword.length < 8) {
    res.status(400).json({ code: 400, message: 'Password must be at least 8 characters' });
    return;
  }

  const masked = maskUser(username);

  try {
    const success = await changePassword(username, oldPassword, newPassword);
    if (!success) {
      logger.warn(`Password update failed`, { user: masked });
      res.status(400).json({ code: 400, message: 'Old password is incorrect' });
      return;
    }

    logger.info(`Password updated`, { user: masked });
    res.json({ code: 0, message: 'Password updated successfully' });
  } catch (err: any) {
    logger.error(`Password update error: ${err.message}`, { user: masked, stack: err.stack });
    res.status(500).json({ code: 500, message: 'Internal server error' });
  }
}

export function getProfile(req: AuthenticatedRequest, res: Response): void {
  res.json({ code: 0, message: 'success', data: { username: req.user?.username } });
}
