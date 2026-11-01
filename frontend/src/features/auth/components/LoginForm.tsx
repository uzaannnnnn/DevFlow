import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { loginSchema, LoginFormValues } from '../schemas';
import { useAuth } from '../AuthContext';
import { ApiClientError } from '../../../shared/lib/api-client';
import { LoadingSpinner } from '../../../shared/ui/LoadingSpinner';

export interface LoginFormProps {
  onSuccess?: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onSuccess }) => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setServerError(null);
    try {
      await login(values);
      if (onSuccess) {
        onSuccess();
      } else {
        const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';
        navigate(from, { replace: true });
      }
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setServerError(err.message || 'Invalid email or password');
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
          htmlFor="password"
          className="block text-xs font-medium text-ink-2 mb-1"
        >
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          disabled={isSubmitting}
          {...register('password')}
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? 'password-error' : undefined}
          className="w-full px-3 py-1.5 border rounded-md text-sm transition-colors focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent border-line bg-surface text-ink disabled:opacity-50 placeholder:text-faint"
          placeholder="••••••••"
        />
        {errors.password && (
          <p id="password-error" className="mt-1 text-xs text-danger">
            {errors.password.message}
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
            <span>Signing in...</span>
          </>
        ) : (
          'Sign in'
        )}
      </button>

      <p className="text-center text-xs text-muted mt-4">
        Don&apos;t have an account?{' '}
        <Link to="/register" className="text-accent hover:text-accent-strong hover:underline font-medium">
          Create one
        </Link>
      </p>
    </form>
  );
};

