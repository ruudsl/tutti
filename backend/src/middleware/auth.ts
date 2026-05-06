import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';

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
    // Check Authorization header first, then query parameter (for downloads)
    const token = (authHeader && authHeader.split(' ')[1]) || (req.query.token as string);

    if (!token) {
        return res.status(401).json({ error: 'Toegang geweigerd. Geen token opgegeven.' });
    }

    try {
        const decoded = jwt.verify(token, config.jwtSecret) as UserPayload;

        // Fetch current association_id from database to handle association switches
        // Import db dynamically to avoid circular dependency
        import('../database/connection').then(({ default: db }) => {
            const user = db.prepare('SELECT association_id, role FROM users WHERE id = ?')
                .get(decoded.id) as { association_id: string | null; role: string } | undefined;

            const jwtAssocId = decoded.associationId;
            if (user) {
                decoded.associationId = user.association_id;
                decoded.role = user.role;
                if (jwtAssocId !== user.association_id) {
                    console.log(`[AUTH] Association mismatch for user ${decoded.id}: JWT=${jwtAssocId}, DB=${user.association_id}`);
                }
            }

            req.user = decoded;
            next();
        }).catch((err) => {
            console.error('[AUTH] DB lookup failed:', err);
            req.user = decoded;
            next();
        });
    } catch (error) {
        return res.status(401).json({ error: 'Token verlopen of ongeldig.' });
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
        config.jwtSecret,
        { expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'] }
    );
}

/**
 * Optional authentication - attaches user if token is present, but allows unauthenticated access
 */
/**
 * Check if user has at least the specified role level
 * Hierarchy: admin > music_committee > conductor > section_leader > member
 */
export function requireMinRole(minRole: 'admin' | 'music_committee' | 'conductor' | 'section_leader' | 'member') {
    const roleHierarchy: Record<string, number> = {
        admin: 5,
        music_committee: 4,
        conductor: 3,
        section_leader: 2,
        member: 1,
    };

    return (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Niet geauthenticeerd.' });
        }

        const userLevel = roleHierarchy[req.user.role] || 0;
        const requiredLevel = roleHierarchy[minRole] || 0;

        if (userLevel < requiredLevel) {
            return res.status(403).json({ error: 'Onvoldoende rechten voor deze actie.' });
        }

        next();
    };
}

/**
 * Check if user is section leader for a specific instrument section
 */
export function requireSectionLeader(getInstrumentId: (req: AuthRequest) => string | undefined) {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Niet geauthenticeerd.' });
        }

        // Admin, music_committee, and conductor can always access
        if (['admin', 'music_committee', 'conductor'].includes(req.user.role)) {
            return next();
        }

        // Section leaders can only manage their own section
        if (req.user.role === 'section_leader') {
            const instrumentId = getInstrumentId(req);
            if (instrumentId) {
                // Import db dynamically to avoid circular dependency
                const db = (await import('../database/connection')).default;
                const userInstrument = db.prepare(
                    'SELECT 1 FROM user_instruments WHERE user_id = ? AND instrument_id = ?'
                ).get(req.user.id, instrumentId);

                if (userInstrument) {
                    return next();
                }
            }
        }

        return res.status(403).json({ error: 'Je kunt alleen je eigen sectie beheren.' });
    };
}

/**
 * Optional authentication - attaches user if token is present, but allows unauthenticated access
 */
export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction) {
    const authHeader = req.headers['authorization'];
    const token = (authHeader && authHeader.split(' ')[1]) || (req.query.token as string);

    if (!token) {
        return next();
    }

    try {
        const decoded = jwt.verify(token, config.jwtSecret) as UserPayload;
        req.user = decoded;
    } catch {
        // Ignore invalid tokens in optional auth
    }

    next();
}
