import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import logger from '../utils/logger';

const router = Router();

/**
 * Haal een kanaal op waar deze gebruiker echt bij hoort.
 *
 * De controle keek alleen of de gebruiker het instrument van het kanaal
 * speelt. De tabel instruments is gedeeld door alle verenigingen, dus dat zei
 * niets over de vereniging: een trompettist bij vereniging A kwam daarmee in
 * de trompetgroep van vereniging B, kon daar meelezen en meepraten. Een
 * kanaal hangt via zijn orkest aan een vereniging; die moet kloppen.
 */
function haalToegankelijkKanaal(req: AuthRequest, kanaalId: string): any {
  const kanaal = db
    .prepare(
      `
        SELECT scc.*, o.association_id
        FROM section_chat_channels scc
        JOIN orchestras o ON scc.orchestra_id = o.id
        JOIN user_instruments ui ON ui.instrument_id = scc.instrument_id AND ui.user_id = ?
        WHERE scc.id = ? AND o.association_id = ?
    `,
    )
    .get(req.user!.id, kanaalId, req.user!.associationId) as any;

  if (!kanaal) {
    throw new ApiError(403, 'Geen toegang tot dit kanaal');
  }

  return kanaal;
}

/**
 * Haal een bericht op dat in een kanaal van de eigen vereniging staat.
 *
 * Bewerken, verwijderen en vastpinnen zochten het bericht alleen op zijn id.
 * Verwijderen stond open voor elke beheerder en vastpinnen voor elke
 * beheerder, dirigent of commissielid - van welke vereniging dan ook.
 */
function haalBerichtVanEigenVereniging(req: AuthRequest, berichtId: string): any {
  const bericht = db
    .prepare(
      `
        SELECT scm.*, scc.orchestra_id, o.association_id
        FROM section_chat_messages scm
        JOIN section_chat_channels scc ON scm.channel_id = scc.id
        JOIN orchestras o ON scc.orchestra_id = o.id
        WHERE scm.id = ? AND o.association_id = ?
    `,
    )
    .get(berichtId, req.user!.associationId) as any;

  if (!bericht) {
    throw new ApiError(404, 'Bericht niet gevonden');
  }

  return bericht;
}

/**
 * @swagger
 * /section-chat/channels:
 *   get:
 *     summary: Get chat channels for user's instruments
 *     tags: [Section Chat]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/channels',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { orchestraId } = req.query;

    // Get user's instruments
    const userInstruments = db
      .prepare(
        `
        SELECT instrument_id FROM user_instruments WHERE user_id = ?
    `,
      )
      .all(req.user!.id) as { instrument_id: string }[];

    if (userInstruments.length === 0) {
      return res.json([]);
    }

    const instrumentIds = userInstruments.map((ui) => ui.instrument_id);
    const placeholders = instrumentIds.map(() => '?').join(',');

    let query = `
        SELECT scc.*,
               i.name as instrument_name,
               i.tuning as instrument_tuning,
               o.name as orchestra_name,
               (SELECT COUNT(*) FROM section_chat_messages WHERE channel_id = scc.id) as message_count,
               (SELECT scm.created_at FROM section_chat_messages scm
                WHERE scm.channel_id = scc.id ORDER BY scm.created_at DESC LIMIT 1) as last_message_at,
               (SELECT COUNT(*) FROM section_chat_messages scm
                WHERE scm.channel_id = scc.id
                AND scm.created_at > COALESCE(
                    (SELECT last_read_at FROM section_chat_read_status
                     WHERE channel_id = scc.id AND user_id = ?),
                    '1970-01-01'
                )) as unread_count
        FROM section_chat_channels scc
        JOIN instruments i ON scc.instrument_id = i.id
        JOIN orchestras o ON scc.orchestra_id = o.id
        WHERE scc.instrument_id IN (${placeholders}) AND o.association_id = ?
    `;
    const params: any[] = [req.user!.id, ...instrumentIds, req.user!.associationId];

    if (orchestraId) {
      query += ' AND scc.orchestra_id = ?';
      params.push(orchestraId);
    }

    query += ' ORDER BY last_message_at DESC NULLS LAST, scc.name';

    const channels = db.prepare(query).all(...params);

    res.json(
      channels.map((c: any) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        createdAt: c.created_at,
        instrument: {
          id: c.instrument_id,
          name: c.instrument_name,
          tuning: c.instrument_tuning,
        },
        orchestra: {
          id: c.orchestra_id,
          name: c.orchestra_name,
        },
        messageCount: c.message_count,
        unreadCount: c.unread_count,
        lastMessageAt: c.last_message_at,
      })),
    );
  }),
);

/**
 * @swagger
 * /section-chat/channels/{id}/messages:
 *   get:
 *     summary: Get messages in a channel
 *     tags: [Section Chat]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/channels/:id/messages',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { before, limit = '50' } = req.query;

    haalToegankelijkKanaal(req, req.params.id);

    let query = `
        SELECT scm.*,
               u.first_name || ' ' || u.last_name as user_name,
               u.profile_photo_path as user_photo,
               reply.content as reply_content,
               reply_user.first_name || ' ' || reply_user.last_name as reply_user_name
        FROM section_chat_messages scm
        JOIN users u ON scm.user_id = u.id
        LEFT JOIN section_chat_messages reply ON scm.reply_to_id = reply.id
        LEFT JOIN users reply_user ON reply.user_id = reply_user.id
        WHERE scm.channel_id = ?
    `;
    const params: any[] = [req.params.id];

    if (before) {
      query += ' AND scm.created_at < ?';
      params.push(before);
    }

    // created_at heeft een resolutie van een seconde, dus twee berichten die
    // vlak na elkaar komen krijgen dezelfde tijdstempel en stonden daarna in
    // willekeurige volgorde. rowid loopt op in de volgorde van invoegen en is
    // hier de enige betrouwbare tiebreaker.
    query += ` ORDER BY scm.created_at DESC, scm.rowid DESC LIMIT ?`;
    params.push(parseInt(limit as string) || 50);

    const messages = db.prepare(query).all(...params);

    // Update read status
    const lastMessage = messages[0];
    if (lastMessage) {
      db.prepare(
        `
            INSERT INTO section_chat_read_status (id, channel_id, user_id, last_read_message_id, last_read_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(channel_id, user_id) DO UPDATE SET
                last_read_message_id = excluded.last_read_message_id,
                last_read_at = CURRENT_TIMESTAMP
        `,
      ).run(uuidv4(), req.params.id, req.user!.id, lastMessage.id);
    }

    res.json(
      messages.reverse().map((m: any) => ({
        id: m.id,
        content: m.content,
        isPinned: !!m.is_pinned,
        isEdited: !!m.is_edited,
        editedAt: m.edited_at,
        createdAt: m.created_at,
        user: {
          id: m.user_id,
          name: m.user_name,
          photo: m.user_photo,
        },
        replyTo: m.reply_to_id
          ? {
              id: m.reply_to_id,
              content: m.reply_content,
              userName: m.reply_user_name,
            }
          : null,
      })),
    );
  }),
);

/**
 * @swagger
 * /section-chat/channels/{id}/messages:
 *   post:
 *     summary: Send a message in a channel
 *     tags: [Section Chat]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/channels/:id/messages',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { content, replyToId } = req.body;

    if (!content || content.trim().length === 0) {
      throw new ApiError(400, 'Bericht mag niet leeg zijn');
    }

    haalToegankelijkKanaal(req, req.params.id);

    // If replying, check if reply message exists
    if (replyToId) {
      const replyMsg = db
        .prepare(
          `
            SELECT id FROM section_chat_messages WHERE id = ? AND channel_id = ?
        `,
        )
        .get(replyToId, req.params.id);
      if (!replyMsg) {
        throw new ApiError(404, 'Bericht om op te reageren niet gevonden');
      }
    }

    const id = uuidv4();
    db.prepare(
      `
        INSERT INTO section_chat_messages (id, channel_id, user_id, content, reply_to_id)
        VALUES (?, ?, ?, ?, ?)
    `,
    ).run(id, req.params.id, req.user!.id, content.trim(), replyToId || null);

    // Update read status for sender
    db.prepare(
      `
        INSERT INTO section_chat_read_status (id, channel_id, user_id, last_read_message_id, last_read_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(channel_id, user_id) DO UPDATE SET
            last_read_message_id = excluded.last_read_message_id,
            last_read_at = CURRENT_TIMESTAMP
    `,
    ).run(uuidv4(), req.params.id, req.user!.id, id);

    const message = db
      .prepare(
        `
        SELECT scm.*,
               u.first_name || ' ' || u.last_name as user_name,
               u.profile_photo_path as user_photo
        FROM section_chat_messages scm
        JOIN users u ON scm.user_id = u.id
        WHERE scm.id = ?
    `,
      )
      .get(id) as any;

    logger.info(`Chat message sent: ${id} in channel ${req.params.id} by user ${req.user!.id}`);

    res.status(201).json({
      id: message.id,
      content: message.content,
      isPinned: false,
      isEdited: false,
      createdAt: message.created_at,
      user: {
        id: message.user_id,
        name: message.user_name,
        photo: message.user_photo,
      },
      replyTo: null,
    });
  }),
);

/**
 * @swagger
 * /section-chat/messages/{id}:
 *   patch:
 *     summary: Edit a message
 *     tags: [Section Chat]
 *     security:
 *       - bearerAuth: []
 */
router.patch(
  '/messages/:id',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      throw new ApiError(400, 'Bericht mag niet leeg zijn');
    }

    const message = haalBerichtVanEigenVereniging(req, req.params.id);

    if (message.user_id !== req.user!.id) {
      throw new ApiError(403, 'Je kunt alleen je eigen berichten bewerken');
    }

    db.prepare(
      `
        UPDATE section_chat_messages
        SET content = ?, is_edited = 1, edited_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `,
    ).run(content.trim(), req.params.id);

    res.json({ message: 'Bericht bijgewerkt' });
  }),
);

/**
 * @swagger
 * /section-chat/messages/{id}:
 *   delete:
 *     summary: Delete a message
 *     tags: [Section Chat]
 *     security:
 *       - bearerAuth: []
 */
router.delete(
  '/messages/:id',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const message = haalBerichtVanEigenVereniging(req, req.params.id);

    // Only owner or admin can delete
    if (message.user_id !== req.user!.id && req.user!.role !== 'admin') {
      throw new ApiError(403, 'Geen rechten om dit bericht te verwijderen');
    }

    db.prepare('DELETE FROM section_chat_messages WHERE id = ?').run(req.params.id);

    res.json({ message: 'Bericht verwijderd' });
  }),
);

/**
 * @swagger
 * /section-chat/messages/{id}/pin:
 *   post:
 *     summary: Pin/unpin a message
 *     tags: [Section Chat]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/messages/:id/pin',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const message = haalBerichtVanEigenVereniging(req, req.params.id);

    // Only admin/conductor can pin
    if (!['admin', 'conductor', 'music_committee'].includes(req.user!.role)) {
      throw new ApiError(403, 'Geen rechten om berichten vast te pinnen');
    }

    const newPinned = !message.is_pinned;
    db.prepare('UPDATE section_chat_messages SET is_pinned = ? WHERE id = ?').run(newPinned ? 1 : 0, req.params.id);

    res.json({ pinned: newPinned });
  }),
);

/**
 * @swagger
 * /section-chat/channels/{id}/pinned:
 *   get:
 *     summary: Get pinned messages in a channel
 *     tags: [Section Chat]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/channels/:id/pinned',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    // Op deze route stond helemaal geen controle: elke ingelogde gebruiker kon
    // de vastgepinde berichten van elk kanaal opvragen, van welke vereniging
    // dan ook, zonder het instrument te spelen.
    haalToegankelijkKanaal(req, req.params.id);

    const messages = db
      .prepare(
        `
        SELECT scm.*,
               u.first_name || ' ' || u.last_name as user_name
        FROM section_chat_messages scm
        JOIN users u ON scm.user_id = u.id
        WHERE scm.channel_id = ? AND scm.is_pinned = 1
        ORDER BY scm.created_at DESC, scm.rowid DESC
    `,
      )
      .all(req.params.id);

    res.json(
      messages.map((m: any) => ({
        id: m.id,
        content: m.content,
        createdAt: m.created_at,
        user: {
          id: m.user_id,
          name: m.user_name,
        },
      })),
    );
  }),
);

/**
 * @swagger
 * /section-chat/channels/ensure:
 *   post:
 *     summary: Ensure chat channels exist for all instrument/orchestra combinations
 *     tags: [Section Chat]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/channels/ensure',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    // Only admin can create channels
    if (req.user!.role !== 'admin') {
      throw new ApiError(403, 'Alleen beheerders kunnen kanalen aanmaken');
    }

    // Get all orchestras in association
    const orchestras = db
      .prepare(
        `
        SELECT id, name FROM orchestras WHERE association_id = ?
    `,
      )
      .all(req.user!.associationId) as { id: string; name: string }[];

    // Get all instruments that have users
    const instruments = db
      .prepare(
        `
        SELECT DISTINCT i.id, i.name, i.tuning
        FROM instruments i
        JOIN user_instruments ui ON ui.instrument_id = i.id
        JOIN users u ON ui.user_id = u.id
        WHERE u.association_id = ?
    `,
      )
      .all(req.user!.associationId) as { id: string; name: string; tuning: string }[];

    let created = 0;
    for (const orchestra of orchestras) {
      for (const instrument of instruments) {
        const existing = db
          .prepare(
            `
                SELECT id FROM section_chat_channels
                WHERE orchestra_id = ? AND instrument_id = ?
            `,
          )
          .get(orchestra.id, instrument.id);

        if (!existing) {
          const channelName = instrument.tuning ? `${instrument.name} (${instrument.tuning})` : instrument.name;

          db.prepare(
            `
                    INSERT INTO section_chat_channels (id, orchestra_id, instrument_id, name)
                    VALUES (?, ?, ?, ?)
                `,
          ).run(uuidv4(), orchestra.id, instrument.id, channelName);
          created++;
        }
      }
    }

    res.json({ message: `${created} kanalen aangemaakt` });
  }),
);

export default router;
