import { z } from 'zod';

export const taskStatusSchema = z.enum(['todo', 'in_progress', 'review', 'done']);
export const taskPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);

export const createTaskSchema = z.object({
  title: z
    .string({ required_error: 'Title is required' })
    .trim()
    .min(1, 'Title cannot be empty')
    .max(255, 'Title must not exceed 255 characters'),
  description: z
    .string()
    .max(5000, 'Description must not exceed 5000 characters')
    .optional()
    .nullable()
    .transform((val) => (val && val.trim() !== '' ? val.trim() : null)),
  status: taskStatusSchema.default('todo'),
  priority: taskPrioritySchema.default('medium'),
  assignee_id: z
    .string()
    .optional()
    .nullable()
    .transform((val) => (val && val.trim() !== '' ? val.trim() : null)),
  due_date: z
    .string()
    .optional()
    .nullable()
    .transform((val) => (val && val.trim() !== '' ? val : null)),
});

export const updateTaskSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Title cannot be empty')
    .max(255, 'Title must not exceed 255 characters')
    .optional(),
  description: z
    .string()
    .max(5000, 'Description must not exceed 5000 characters')
    .optional()
    .nullable()
    .transform((val) => (val !== undefined ? (val && val.trim() !== '' ? val.trim() : null) : undefined)),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  assignee_id: z
    .string()
    .optional()
    .nullable()
    .transform((val) => (val !== undefined ? (val && val.trim() !== '' ? val.trim() : null) : undefined)),
  due_date: z
    .string()
    .optional()
    .nullable()
    .transform((val) => (val !== undefined ? (val && val.trim() !== '' ? val : null) : undefined)),
});

export type CreateTaskFormValues = z.input<typeof createTaskSchema>;
export type UpdateTaskFormValues = z.input<typeof updateTaskSchema>;
