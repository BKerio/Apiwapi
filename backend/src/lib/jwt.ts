import jwt from 'jsonwebtoken';
import { env } from './env.js';
import { JwtPayload } from '../shared/types/index.js';

/**
 * Thin wrapper around `jsonwebtoken` (replaces @fastify/jwt). Kept as two
 * plain functions rather than a class - there's no state to hold.
 */
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as unknown as JwtPayload;
}
