import { z } from 'zod';

export const projectKeyRegex = /^[A-Z][A-Z0-9]{1,9}$/;

export function generateSuggestedKey(name: string): string {
  if (!name.trim()) return '';
  const cleaned = name.trim().toUpperCase().replace(/[^A-Z0-9\s_-]/g, '');
  const words = cleaned.split(/[\s_-]+/).filter(Boolean);

  let candidate = '';
  if (words.length > 1) {
    candidate = words.map(w => w[0]).join('');
  } else if (words.length === 1) {
    candidate = words[0].slice(0, 4);
  }

  // Ensure starts with a letter
  if (!/^[A-Z]/.test(candidate)) {
    candidate = 'P' + candidate;
  }

  // Ensure length between 2 and 10
  if (candidate.length < 2) {
    candidate = (candidate + 'ROJ').slice(0, 4);
  } else if (candidate.length > 10) {
    candidate = candidate.slice(0, 10);
  }

  return candidate;
}

export const createProjectSchema = z.object({
  name: z
    .string()
    .min(1, 'Project name is required')
    .max(255, 'Project name must be at most 255 characters'),
  key: z
    .string()
    .optional()
    .refine(
      (val) => !val || projectKeyRegex.test(val),
      {
        message: 'Key must be 2-10 uppercase alphanumeric characters starting with a letter (e.g. DEV, PROJ1)',
      }
    ),
  description: z.string().max(1000, 'Description must be at most 1000 characters').optional(),
});

export type CreateProjectFormValues = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.object({
  name: z
    .string()
    .min(1, 'Project name is required')
    .max(255, 'Project name must be at most 255 characters'),
  description: z.string().max(1000, 'Description must be at most 1000 characters').optional(),
});

export type UpdateProjectFormValues = z.infer<typeof updateProjectSchema>;

export const addProjectMemberSchema = z.object({
  user_id: z.string().uuid('Please select a valid user'),
  role: z.enum(['admin', 'member'], {
    errorMap: () => ({ message: 'Please select a valid role' }),
  }),
});

export type AddProjectMemberFormValues = z.infer<typeof addProjectMemberSchema>;
