import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import db from '../database/connection';

const JWT_SECRET = process.env.JWT_SECRET || 'harmonie-secret-key-change-in-production';

export interface UserPayload {
    id: string;
    email: string;
    role: string;
    associationId: string | null;
}

export interface AuthRequest extends Request {
    user?: UserPayload;
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Toegang geweigerd. Geen token opgegeven.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as UserPayload;
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Ongeldige token.' });
    }
}

export function requireRole(...roles: string[]) {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Niet geauthenticeerd.' });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Onvoldoende rechten voor deze actie.' });
        }

        next();
    };
}

export function generateToken(user: { id: string; email: string; role: string; association_id: string | null }): string {
    return jwt.sign(
        {
            id: user.id,
            email: user.email,
            role: user.role,
            associationId: user.association_id,
        },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}
