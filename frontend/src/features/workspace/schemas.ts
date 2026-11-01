import { z } from 'zod';

export const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const createWorkspaceSchema = z.object({
  name: z
    .string()
    .min(1, 'Workspace name is required')
    .max(255, 'Workspace name must be at most 255 characters'),
  slug: z
    .string()
    .optional()
    .refine((val) => !val || (val.length >= 3 && val.length <= 63 && slugRegex.test(val)), {
      message: 'Slug must be 3-63 characters of lowercase letters, numbers, and hyphens without consecutive hyphens',
    }),
  description: z.string().max(1000, 'Description must be at most 1000 characters').optional(),
});

export type CreateWorkspaceFormValues = z.infer<typeof createWorkspaceSchema>;

export const updateWorkspaceSchema = z.object({
  name: z
    .string()
    .min(1, 'Workspace name is required')
    .max(255, 'Workspace name must be at most 255 characters')
    .optional(),
  slug: z
    .string()
    .optional()
    .refine((val) => !val || (val.length >= 3 && val.length <= 63 && slugRegex.test(val)), {
      message: 'Slug must be 3-63 characters of lowercase letters, numbers, and hyphens without consecutive hyphens',
    }),
  description: z.string().max(1000, 'Description must be at most 1000 characters').optional(),
});

export type UpdateWorkspaceFormValues = z.infer<typeof updateWorkspaceSchema>;

export const addMemberSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Please enter a valid email address'),
  role: z.enum(['admin', 'member', 'viewer'], {
    errorMap: () => ({ message: 'Please select a valid role' }),
  }),
});

export type AddMemberFormValues = z.infer<typeof addMemberSchema>;

