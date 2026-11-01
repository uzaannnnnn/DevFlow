import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),
  password: z
    .string()
    .min(1, 'Password is required'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),
  name: z
    .string()
    .max(255, 'Name cannot exceed 255 characters')
    .optional(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(72, 'Password cannot exceed 72 characters'),
});

export type RegisterFormValues = z.infer<typeof registerSchema>;

