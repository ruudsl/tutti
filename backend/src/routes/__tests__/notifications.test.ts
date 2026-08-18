import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../../__tests__/testApp';
import testDb from '../../__tests__/testDb';
import {
  createTestAssociation,
  createTestUser,
  generateTestToken,
  TestUser,
} from '../../__tests__/testUtils';

describe('Notifications API', () => {
  let adminUser: TestUser;
  let adminToken: string;
  let memberUser: TestUser;
  let memberToken: string;

  beforeEach(() => {
    const association = createTestAssociation();
    adminUser = createTestUser(association.id, { role: 'admin', email: 'admin@test.com' });
    memberUser = createTestUser(association.id, { role: 'member', email: 'member@test.com' });
    adminToken = generateTestToken(adminUser);
    memberToken = generateTestToken(memberUser);
  });

  describe('GET /api/notifications', () => {
    it('should return empty list when no notifications', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('should return user notifications', async () => {
      // Create notifications
      testDb.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body)
        VALUES (?, ?, ?, ?, ?)
      `).run(uuidv4(), memberUser.id, 'new_music', 'New music available', 'A new piece has been uploaded');

      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].title).toBe('New music available');
      expect(res.body[0].type).toBe('new_music');
    });

    it('should not return other user notifications', async () => {
      testDb.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body)
        VALUES (?, ?, ?, ?, ?)
      `).run(uuidv4(), adminUser.id, 'new_music', 'Admin notification', 'For admin only');

      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });

    it('should filter by unreadOnly', async () => {
      const readId = uuidv4();
      const unreadId = uuidv4();

      testDb.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body, is_read)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(readId, memberUser.id, 'info', 'Read notification', 'Test notification body', 1);

      testDb.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body, is_read)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(unreadId, memberUser.id, 'info', 'Unread notification', 'Test notification body', 0);

      const res = await request(app)
        .get('/api/notifications?unreadOnly=true')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].title).toBe('Unread notification');
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/notifications');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/notifications/unread-count', () => {
    it('should return 0 for no notifications', async () => {
      const res = await request(app)
        .get('/api/notifications/unread-count')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(0);
    });

    it('should count unread notifications', async () => {
      testDb.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body, is_read)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), memberUser.id, 'info', 'Notification 1', 'Test notification body', 0);

      testDb.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body, is_read)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), memberUser.id, 'info', 'Notification 2', 'Test notification body', 0);

      testDb.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body, is_read)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), memberUser.id, 'info', 'Read one', 'Test notification body', 1);

      const res = await request(app)
        .get('/api/notifications/unread-count')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(2);
    });
  });

  describe('POST /api/notifications/:id/read', () => {
    it('should mark notification as read', async () => {
      const notifId = uuidv4();
      testDb.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body, is_read)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(notifId, memberUser.id, 'info', 'Test', 'Test notification body', 0);

      const res = await request(app)
        .post(`/api/notifications/${notifId}/read`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);

      const notif = testDb.prepare('SELECT is_read FROM notifications WHERE id = ?').get(notifId) as any;
      expect(notif.is_read).toBe(1);
    });
  });

  describe('POST /api/notifications/read-all', () => {
    it('should mark all notifications as read', async () => {
      testDb.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body, is_read)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), memberUser.id, 'info', 'Notif 1', 'Test notification body', 0);

      testDb.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body, is_read)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), memberUser.id, 'info', 'Notif 2', 'Test notification body', 0);

      const res = await request(app)
        .post('/api/notifications/read-all')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);

      const count = testDb.prepare(
        'SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = 0'
      ).get(memberUser.id) as any;
      expect(count.cnt).toBe(0);
    });
  });

  describe('GET /api/notifications/preferences', () => {
    it('should return default preferences when none exist', async () => {
      const res = await request(app)
        .get('/api/notifications/preferences')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        newMusic: true,
        rehearsalChanges: true,
        seatingUpdates: true,
        emailEnabled: true,
        pushEnabled: true,
      });
    });

    it('should return existing preferences', async () => {
      testDb.prepare(`
        INSERT INTO notification_preferences (id, user_id, new_music, email_enabled)
        VALUES (?, ?, ?, ?)
      `).run(uuidv4(), memberUser.id, 0, 0);

      const res = await request(app)
        .get('/api/notifications/preferences')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.newMusic).toBe(false);
      expect(res.body.emailEnabled).toBe(false);
    });
  });

  describe('PATCH /api/notifications/preferences', () => {
    it('should update preferences', async () => {
      const res = await request(app)
        .patch('/api/notifications/preferences')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          newMusic: false,
          pushEnabled: false,
        });

      expect(res.status).toBe(200);

      const prefs = testDb.prepare(
        'SELECT * FROM notification_preferences WHERE user_id = ?'
      ).get(memberUser.id) as any;

      expect(prefs.new_music).toBe(0);
      expect(prefs.push_enabled).toBe(0);
    });
  });

  describe('POST /api/notifications/push-subscription', () => {
    it('should register push subscription', async () => {
      const res = await request(app)
        .post('/api/notifications/push-subscription')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          endpoint: 'https://push.example.com/abc123',
          keys: {
            p256dh: 'test-p256dh-key',
            auth: 'test-auth-key',
          },
        });

      expect(res.status).toBe(200);

      const sub = testDb.prepare(
        'SELECT * FROM push_subscriptions WHERE user_id = ?'
      ).get(memberUser.id) as any;

      expect(sub).toBeDefined();
      expect(sub.endpoint).toBe('https://push.example.com/abc123');
    });

    it('should reject invalid subscription', async () => {
      const res = await request(app)
        .post('/api/notifications/push-subscription')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          endpoint: 'https://push.example.com/abc123',
        });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/notifications/push-subscription', () => {
    it('should unregister push subscription', async () => {
      const endpoint = 'https://push.example.com/delete-me';
      testDb.prepare(`
        INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh_key, auth_key)
        VALUES (?, ?, ?, ?, ?)
      `).run(uuidv4(), memberUser.id, endpoint, 'key', 'auth');

      const res = await request(app)
        .delete('/api/notifications/push-subscription')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ endpoint });

      expect(res.status).toBe(200);

      const sub = testDb.prepare(
        'SELECT * FROM push_subscriptions WHERE endpoint = ?'
      ).get(endpoint);

      expect(sub).toBeUndefined();
    });

    it('should require endpoint', async () => {
      const res = await request(app)
        .delete('/api/notifications/push-subscription')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });
});
