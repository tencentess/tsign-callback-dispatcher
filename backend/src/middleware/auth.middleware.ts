import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/auth.service';

export interface AuthenticatedRequest extends Request {
  user?: { username: string };
}

export async function authRequired(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ code: 401, message: 'Authentication required' });
    return;
  }

  const token = authHeader.substring(7);
  try {
    const decoded = await verifyToken(token);
    if (!decoded) {
      res.status(401).json({ code: 401, message: 'Invalid or expired token' });
      return;
    }

    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ code: 401, message: 'Invalid or expired token' });
  }
}
