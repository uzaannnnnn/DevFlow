import { describe, it, expect } from 'vitest';
import { createTaskSchema, updateTaskSchema } from '../schemas';

describe('Task Validation Schemas', () => {
  describe('createTaskSchema', () => {
    it('accepts valid minimal input with default status and priority', () => {
      const result = createTaskSchema.safeParse({
        title: 'Build task list UI',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe('Build task list UI');
        expect(result.data.status).toBe('todo');
        expect(result.data.priority).toBe('medium');
        expect(result.data.assignee_id).toBeNull();
        expect(result.data.description).toBeNull();
        expect(result.data.due_date).toBeNull();
      }
    });

    it('accepts complete input with all valid properties', () => {
      const result = createTaskSchema.safeParse({
        title: 'Fix race condition',
        description: 'Ensure row lock on project_members table',
        status: 'in_progress',
        priority: 'urgent',
        assignee_id: '123e4567-e89b-12d3-a456-426614174000',
        due_date: '2026-12-31T23:59:59.000Z',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('in_progress');
        expect(result.data.priority).toBe('urgent');
        expect(result.data.assignee_id).toBe('123e4567-e89b-12d3-a456-426614174000');
      }
    });

    it('rejects empty title or whitespace-only title', () => {
      const resEmpty = createTaskSchema.safeParse({ title: '' });
      expect(resEmpty.success).toBe(false);

      const resWhitespace = createTaskSchema.safeParse({ title: '    ' });
      expect(resWhitespace.success).toBe(false);
    });

    it('rejects title longer than 255 characters', () => {
      const longTitle = 'a'.repeat(256);
      const result = createTaskSchema.safeParse({ title: longTitle });
      expect(result.success).toBe(false);
    });

    it('rejects invalid status enum', () => {
      const result = createTaskSchema.safeParse({
        title: 'Test',
        status: 'invalid_status',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid priority enum', () => {
      const result = createTaskSchema.safeParse({
        title: 'Test',
        priority: 'super_urgent',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updateTaskSchema', () => {
    it('accepts partial updates', () => {
      const resStatus = updateTaskSchema.safeParse({ status: 'done' });
      expect(resStatus.success).toBe(true);

      const resTitle = updateTaskSchema.safeParse({ title: 'Updated Title' });
      expect(resTitle.success).toBe(true);
    });

    it('transforms empty strings to null for nullable fields', () => {
      const result = updateTaskSchema.safeParse({
        assignee_id: '',
        description: '',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.assignee_id).toBeNull();
        expect(result.data.description).toBeNull();
      }
    });
  });
});
