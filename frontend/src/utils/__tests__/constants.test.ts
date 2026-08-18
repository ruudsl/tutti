import { describe, it, expect } from 'vitest';
import { ROLES, ROUTES, STORAGE_KEYS } from '../constants';

describe('ROLES', () => {
  it('has all expected role values', () => {
    expect(ROLES.ADMIN).toBe('admin');
    expect(ROLES.MUSIC_COMMITTEE).toBe('music_committee');
    expect(ROLES.CONDUCTOR).toBe('conductor');
    expect(ROLES.MEMBER).toBe('member');
  });
});

describe('ROUTES', () => {
  it('has dashboard at root', () => {
    expect(ROUTES.DASHBOARD).toBe('/');
  });

  it('all routes start with /', () => {
    Object.values(ROUTES).forEach((route) => {
      expect(route).toMatch(/^\//);
    });
  });
});

describe('STORAGE_KEYS', () => {
  it('has token and user keys', () => {
    expect(STORAGE_KEYS.TOKEN).toBe('token');
    expect(STORAGE_KEYS.USER).toBe('user');
  });
});
