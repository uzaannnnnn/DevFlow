import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { registerSchema, RegisterFormValues } from '../schemas';
import { useAuth } from '../AuthContext';
import { ApiClientError } from '../../../shared/lib/api-client';
import { LoadingSpinner } from '../../../shared/ui/LoadingSpinner';

export interface RegisterFormProps {
  onSuccess?: () => void;
}

export const RegisterForm: React.FC<RegisterFormProps> = ({ onSuccess }) => {
  const { register: registerUser, login } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      name: '',
      password: '',
    },
  });

  const onSubmit = async (values: RegisterFormValues) => {
    setServerError(null);
    try {
      // 1. Register the user
      await registerUser({
        email: values.email,
        password: values.password,
        name: values.name || undefined,
      });

      // 2. Automatically log in after registration
      await login({
        email: values.email,
        password: values.password,
      });

      if (onSuccess) {
        onSuccess();
      } else {
        navigate('/', { replace: true });
      }
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        if (err.code === 'CONFLICT' || err.status === 409) {
          setServerError('An account with this email address already exists');
        } else {
          setServerError(err.message || 'Registration failed');
        }
      } else {
        setServerError('An unexpected error occurred. Please try again.');
      }
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 w-full max-w-sm" noValidate>
      {serverError && (
        <div
          role="alert"
          className="p-3 text-xs text-danger bg-danger-soft border border-danger/25 rounded-md"
        >
          {serverError}
        </div>
      )}

      <div>
        <label
          htmlFor="email"
          className="block text-xs font-medium text-ink-2 mb-1"
        >
          Email address
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          disabled={isSubmitting}
          {...register('email')}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'email-error' : undefined}
          className="w-full px-3 py-1.5 border rounded-md text-sm transition-colors focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent border-line bg-surface text-ink disabled:opacity-50 placeholder:text-faint"
          placeholder="name@example.com"
        />
        {errors.email && (
          <p id="email-error" className="mt-1 text-xs text-danger">
            {errors.email.message}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="name"
          className="block text-xs font-medium text-ink-2 mb-1"
        >
          Full name <span className="text-muted font-normal">(optional)</span>
        </label>
        <input
          id="name"
          type="text"
          autoComplete="name"
          disabled={isSubmitting}
          {...register('name')}
          aria-invalid={!!errors.name}
          className="w-full px-3 py-1.5 border rounded-md text-sm transition-colors focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent border-line bg-surface text-ink disabled:opacity-50 placeholder:text-faint"
          placeholder="Ada Lovelace"
        />
        {errors.name && (
          <p className="mt-1 text-xs text-danger">
            {errors.name.message}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-xs font-medium text-ink-2 mb-1"
        >
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          disabled={isSubmitting}
          {...register('password')}
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? 'password-error' : 'password-hint'}
          className="w-full px-3 py-1.5 border rounded-md text-sm transition-colors focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent border-line bg-surface text-ink disabled:opacity-50 placeholder:text-faint"
          placeholder="At least 8 characters"
        />
        {errors.password ? (
          <p id="password-error" className="mt-1 text-xs text-danger">
            {errors.password.message}
          </p>
        ) : (
          <p id="password-hint" className="mt-1 text-xs text-muted">
            Must be at least 8 characters long
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full flex items-center justify-center py-2 px-4 rounded-md text-sm font-medium text-surface bg-ink hover:bg-ink/90 focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50 transition-colors shadow-sm"
      >
        {isSubmitting ? (
          <>
            <LoadingSpinner size="sm" className="mr-2 text-surface" />
            <span>Creating account...</span>
          </>
        ) : (
          'Create account'
        )}
      </button>

      <p className="text-center text-xs text-muted mt-4">
        Already have an account?{' '}
        <Link to="/login" className="text-accent hover:text-accent-strong hover:underline font-medium">
          Sign in
        </Link>
      </p>
    </form>
  );
};

