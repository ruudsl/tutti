import db from '../database/connection';
import logger from '../utils/logger';

export const up = (): void => {
  logger.info('Running migration: chat_and_annotations (up)');

  // Chat messages table
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      association_id TEXT NOT NULL,
      orchestra_id TEXT,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (association_id) REFERENCES associations(id),
      FOREIGN KEY (orchestra_id) REFERENCES orchestras(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_chat_messages_association ON chat_messages(association_id, created_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_chat_messages_orchestra ON chat_messages(orchestra_id, created_at)`);

  // PDF annotations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS pdf_annotations (
      id TEXT PRIMARY KEY,
      music_piece_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      annotation_type TEXT NOT NULL CHECK (annotation_type IN ('freehand', 'highlight', 'text', 'stamp', 'shape')),
      data TEXT NOT NULL,
      color TEXT DEFAULT '#FF0000',
      stroke_width REAL DEFAULT 2.0,
      opacity REAL DEFAULT 1.0,
      is_shared INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (music_piece_id) REFERENCES music_pieces(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_pdf_annotations_piece_page ON pdf_annotations(music_piece_id, page_number)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_pdf_annotations_user ON pdf_annotations(user_id)`);

  // Annotation stamps library
  db.exec(`
    CREATE TABLE IF NOT EXISTS annotation_stamps (
      id TEXT PRIMARY KEY,
      association_id TEXT,
      user_id TEXT,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      svg_data TEXT NOT NULL,
      is_builtin INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (association_id) REFERENCES associations(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Insert built-in stamps for music notation
  const builtinStamps = [
    {
      id: 'stamp-ff',
      name: 'ff',
      category: 'dynamics',
      svg: '<text font-size="20" font-style="italic" font-weight="bold">ff</text>',
    },
    {
      id: 'stamp-f',
      name: 'f',
      category: 'dynamics',
      svg: '<text font-size="20" font-style="italic" font-weight="bold">f</text>',
    },
    {
      id: 'stamp-mf',
      name: 'mf',
      category: 'dynamics',
      svg: '<text font-size="20" font-style="italic" font-weight="bold">mf</text>',
    },
    {
      id: 'stamp-mp',
      name: 'mp',
      category: 'dynamics',
      svg: '<text font-size="20" font-style="italic" font-weight="bold">mp</text>',
    },
    {
      id: 'stamp-p',
      name: 'p',
      category: 'dynamics',
      svg: '<text font-size="20" font-style="italic" font-weight="bold">p</text>',
    },
    {
      id: 'stamp-pp',
      name: 'pp',
      category: 'dynamics',
      svg: '<text font-size="20" font-style="italic" font-weight="bold">pp</text>',
    },
    {
      id: 'stamp-cresc',
      name: 'cresc.',
      category: 'dynamics',
      svg: '<text font-size="16" font-style="italic">cresc.</text>',
    },
    {
      id: 'stamp-dim',
      name: 'dim.',
      category: 'dynamics',
      svg: '<text font-size="16" font-style="italic">dim.</text>',
    },
    { id: 'stamp-rit', name: 'rit.', category: 'tempo', svg: '<text font-size="16" font-style="italic">rit.</text>' },
    {
      id: 'stamp-accel',
      name: 'accel.',
      category: 'tempo',
      svg: '<text font-size="16" font-style="italic">accel.</text>',
    },
    {
      id: 'stamp-atempo',
      name: 'a tempo',
      category: 'tempo',
      svg: '<text font-size="16" font-style="italic">a tempo</text>',
    },
    {
      id: 'stamp-fermata',
      name: 'Fermata',
      category: 'symbols',
      svg: '<path d="M0,15 Q15,-5 30,15" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="15" cy="12" r="3" fill="currentColor"/>',
    },
    { id: 'stamp-breath', name: 'Breath', category: 'symbols', svg: '<text font-size="24">,</text>' },
    {
      id: 'stamp-accent',
      name: 'Accent',
      category: 'articulation',
      svg: '<path d="M0,10 L15,0 L30,10" fill="none" stroke="currentColor" stroke-width="2"/>',
    },
    {
      id: 'stamp-staccato',
      name: 'Staccato',
      category: 'articulation',
      svg: '<circle cx="10" cy="10" r="4" fill="currentColor"/>',
    },
    {
      id: 'stamp-tenuto',
      name: 'Tenuto',
      category: 'articulation',
      svg: '<line x1="0" y1="10" x2="20" y2="10" stroke="currentColor" stroke-width="3"/>',
    },
    { id: 'stamp-sharp', name: 'Sharp', category: 'accidentals', svg: '<text font-size="24">#</text>' },
    { id: 'stamp-flat', name: 'Flat', category: 'accidentals', svg: '<text font-size="24">b</text>' },
    { id: 'stamp-natural', name: 'Natural', category: 'accidentals', svg: '<text font-size="24">♮</text>' },
    { id: 'stamp-coda', name: 'Coda', category: 'navigation', svg: '<text font-size="24">𝄌</text>' },
    { id: 'stamp-segno', name: 'Segno', category: 'navigation', svg: '<text font-size="24">𝄋</text>' },
    {
      id: 'stamp-check',
      name: 'Checkmark',
      category: 'general',
      svg: '<path d="M5,15 L12,22 L25,5" fill="none" stroke="currentColor" stroke-width="3"/>',
    },
    {
      id: 'stamp-x',
      name: 'X Mark',
      category: 'general',
      svg: '<path d="M5,5 L25,25 M25,5 L5,25" fill="none" stroke="currentColor" stroke-width="3"/>',
    },
    {
      id: 'stamp-circle',
      name: 'Circle',
      category: 'general',
      svg: '<circle cx="15" cy="15" r="12" fill="none" stroke="currentColor" stroke-width="2"/>',
    },
    {
      id: 'stamp-arrow-up',
      name: 'Arrow Up',
      category: 'general',
      svg: '<path d="M15,25 L15,5 M5,15 L15,5 L25,15" fill="none" stroke="currentColor" stroke-width="2"/>',
    },
    {
      id: 'stamp-arrow-down',
      name: 'Arrow Down',
      category: 'general',
      svg: '<path d="M15,5 L15,25 M5,15 L15,25 L25,15" fill="none" stroke="currentColor" stroke-width="2"/>',
    },
  ];

  const insertStamp = db.prepare(`
    INSERT OR IGNORE INTO annotation_stamps (id, name, category, svg_data, is_builtin, sort_order)
    VALUES (?, ?, ?, ?, 1, ?)
  `);

  builtinStamps.forEach((stamp, index) => {
    insertStamp.run(stamp.id, stamp.name, stamp.category, stamp.svg, index);
  });

  // Offline sync tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
      data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      synced_at DATETIME,
      conflict_resolved INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_sync_queue_user ON sync_queue(user_id, synced_at)`);

  // Entity version tracking for conflict detection
  db.exec(`
    ALTER TABLE music_pieces ADD COLUMN version INTEGER DEFAULT 1
  `);
  db.exec(`
    ALTER TABLE music_pieces ADD COLUMN last_modified_by TEXT
  `);

  logger.info('Migration completed: chat_and_annotations');
};

export const down = (): void => {
  logger.info('Running migration: chat_and_annotations (down)');

  db.exec(`DROP TABLE IF EXISTS chat_messages`);
  db.exec(`DROP TABLE IF EXISTS pdf_annotations`);
  db.exec(`DROP TABLE IF EXISTS annotation_stamps`);
  db.exec(`DROP TABLE IF EXISTS sync_queue`);

  logger.info('Rollback completed: chat_and_annotations');
};
