import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getConfigStore } from '../store';
import logger from './logger.service';

interface UserRecord {
  username: string;
  passwordHash: string;
  /** Incremented on every password change; embedded in JWT to invalidate old tokens */
  passwordVersion?: number;
  createdAt: string;
  updatedAt: string;
}

interface UsersFile {
  users: UserRecord[];
}

const USERS_KEY = 'users.json';
const JWT_SECRET = process.env.JWT_SECRET || 'tsign-dispatcher-default-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const BCRYPT_ROUNDS = 10;

/** Mask username: keep first char, mask the rest with '*' */
function maskUser(name: string): string {
  if (!name) return '***';
  if (name.length <= 1) return name[0] + '**';
  return name[0] + '*'.repeat(Math.min(name.length - 1, 5));
}

async function loadUsers(): Promise<UsersFile> {
  const data = await getConfigStore().read<UsersFile>(USERS_KEY, { users: [] });
  logger.debug(`Loaded ${data.users.length} user(s) from store`);
  return data;
}

async function saveUsers(data: UsersFile): Promise<void> {
  await getConfigStore().write(USERS_KEY, data);
}

/**
 * Initialize default admin user if no users exist.
 */
export async function initDefaultUser(): Promise<void> {
  const data = await loadUsers();
  if (data.users.length === 0) {
    const defaultPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'admin123';
    logger.info(`No users found. Creating default user.`, {
      passwordSource: process.env.ADMIN_DEFAULT_PASSWORD ? 'env' : 'hardcoded default',
      passwordLength: defaultPassword.length,
    });
    const hash = bcrypt.hashSync(defaultPassword, BCRYPT_ROUNDS);
    data.users.push({
      username: 'admin',
      passwordHash: hash,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await saveUsers(data);
    logger.info('Default user created. Please change the password immediately.');
  } else {
    logger.debug(`Found ${data.users.length} existing user(s), skipping default user creation.`);
  }
}

export async function authenticate(username: string, password: string): Promise<string | null> {
  const masked = maskUser(username);
  logger.debug(`Authentication attempt for user: ${masked}`);

  const data = await loadUsers();
  const user = data.users.find((u) => u.username === username);

  if (!user) {
    logger.warn(`Authentication failed: user not found`, { user: masked, totalUsers: data.users.length });
    return null;
  }

  logger.debug(`User found, verifying password...`, {
    user: masked,
    inputPasswordLength: password.length,
  });

  const passwordMatch = bcrypt.compareSync(password, user.passwordHash);
  if (!passwordMatch) {
    logger.warn(`Authentication failed: password mismatch`, {
      user: masked,
      inputPasswordLength: password.length,
      hashAlgorithm: user.passwordHash.substring(0, 4),
      userUpdatedAt: user.updatedAt,
    });
    return null;
  }

  const token = jwt.sign(
    { username: user.username, pwdVer: user.passwordVersion || 0 },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN as string | number } as jwt.SignOptions,
  );

  logger.debug(`Authentication successful for user: ${masked}`);
  return token;
}

export async function verifyToken(token: string): Promise<{ username: string } | null> {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { username: string; pwdVer?: number };

    // Check if token's password version matches current version
    const data = await loadUsers();
    const user = data.users.find((u) => u.username === decoded.username);
    if (user) {
      const currentVer = user.passwordVersion || 0;
      const tokenVer = decoded.pwdVer ?? 0;
      if (tokenVer !== currentVer) {
        logger.info(`Token rejected: password version mismatch (token=${tokenVer}, current=${currentVer})`, {
          user: maskUser(decoded.username),
        });
        return null;
      }
    }

    return { username: decoded.username };
  } catch (err: any) {
    logger.debug(`Token verification failed: ${err.message}`);
    return null;
  }
}

export async function changePassword(username: string, oldPassword: string, newPassword: string): Promise<boolean> {
  const masked = maskUser(username);
  logger.info(`Password change attempt for user: ${masked}`);

  const data = await loadUsers();
  const user = data.users.find((u) => u.username === username);
  if (!user) {
    logger.warn(`Password change failed: user not found`, { user: masked });
    return false;
  }
  if (!bcrypt.compareSync(oldPassword, user.passwordHash)) {
    logger.warn(`Password change failed: old password mismatch`, { user: masked });
    return false;
  }
  user.passwordHash = bcrypt.hashSync(newPassword, BCRYPT_ROUNDS);
  user.passwordVersion = (user.passwordVersion || 0) + 1;
  user.updatedAt = new Date().toISOString();
  await saveUsers(data);
  logger.info(`Password changed successfully for user: ${masked}`);
  return true;
}
