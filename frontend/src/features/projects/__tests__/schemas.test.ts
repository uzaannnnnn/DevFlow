import { describe, it, expect } from 'vitest';
import {
  projectKeyRegex,
  generateSuggestedKey,
  createProjectSchema,
  updateProjectSchema,
  addProjectMemberSchema,
} from '../schemas';

describe('Project Validation Schemas & Helpers', () => {
  describe('projectKeyRegex & generateSuggestedKey', () => {
    it('validates project key regex rules correctly', () => {
      expect(projectKeyRegex.test('DEV')).toBe(true);
      expect(projectKeyRegex.test('D1')).toBe(true);
      expect(projectKeyRegex.test('PROJECT100')).toBe(true);

      // Invalid cases
      expect(projectKeyRegex.test('')).toBe(false);
      expect(projectKeyRegex.test('A')).toBe(false); // min 2 chars
      expect(projectKeyRegex.test('1DEV')).toBe(false); // cannot start with digit
      expect(projectKeyRegex.test('TOOLONGA1234')).toBe(false); // max 10 chars
      expect(projectKeyRegex.test('dev')).toBe(false); // lowercase disallowed
      expect(projectKeyRegex.test('DEV-1')).toBe(false); // hyphens disallowed
    });

    it('generates suggested key from project name', () => {
      expect(generateSuggestedKey('DevFlow Platform')).toBe('DP');
      expect(generateSuggestedKey('DevFlow')).toBe('DEVF');
      expect(generateSuggestedKey('API')).toBe('API');
      expect(generateSuggestedKey('123 Numbers')).toBe('P1N'); // prepends P if starts with number
    });
  });

  describe('createProjectSchema', () => {
    it('accepts valid project input without key', () => {
      const res = createProjectSchema.safeParse({
        name: 'Backend Core',
        description: 'Core microservices',
      });
      expect(res.success).toBe(true);
    });

    it('accepts valid project input with explicit key', () => {
      const res = createProjectSchema.safeParse({
        name: 'Backend Core',
        key: 'BACK',
        description: 'Core microservices',
      });
      expect(res.success).toBe(true);
    });

    it('rejects invalid key format', () => {
      const res = createProjectSchema.safeParse({
        name: 'Backend Core',
        key: 'invalid_key',
      });
      expect(res.success).toBe(false);
    });

    it('rejects empty name', () => {
      const res = createProjectSchema.safeParse({
        name: '',
      });
      expect(res.success).toBe(false);
    });
  });

  describe('updateProjectSchema', () => {
    it('validates updated name and description', () => {
      const valid = updateProjectSchema.safeParse({
        name: 'Updated Project Name',
        description: 'New description',
      });
      expect(valid.success).toBe(true);

      const invalid = updateProjectSchema.safeParse({
        name: '',
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe('addProjectMemberSchema', () => {
    it('validates user uuid and role', () => {
      const valid = addProjectMemberSchema.safeParse({
        user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        role: 'admin',
      });
      expect(valid.success).toBe(true);

      const invalidRole = addProjectMemberSchema.safeParse({
        user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        role: 'owner', // cannot add as owner directly
      });
      expect(invalidRole.success).toBe(false);
    });
  });
});
