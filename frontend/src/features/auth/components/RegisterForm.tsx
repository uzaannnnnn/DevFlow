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
          className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md dark:bg-red-950/40 dark:border-red-900/60 dark:text-red-300"
        >
          {serverError}
        </div>
      )}

      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
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
          className="w-full px-3 py-2 border rounded-md text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 disabled:opacity-50"
          placeholder="name@example.com"
        />
        {errors.email && (
          <p id="email-error" className="mt-1 text-xs text-red-600 dark:text-red-400">
            {errors.email.message}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="name"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          Full name <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          id="name"
          type="text"
          autoComplete="name"
          disabled={isSubmitting}
          {...register('name')}
          aria-invalid={!!errors.name}
          className="w-full px-3 py-2 border rounded-md text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 disabled:opacity-50"
          placeholder="Ada Lovelace"
        />
        {errors.name && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
            {errors.name.message}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
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
          className="w-full px-3 py-2 border rounded-md text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 disabled:opacity-50"
          placeholder="At least 8 characters"
        />
        {errors.password ? (
          <p id="password-error" className="mt-1 text-xs text-red-600 dark:text-red-400">
            {errors.password.message}
          </p>
        ) : (
          <p id="password-hint" className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Must be at least 8 characters long
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full flex items-center justify-center py-2 px-4 rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
      >
        {isSubmitting ? (
          <>
            <LoadingSpinner size="sm" className="mr-2 text-white" />
            <span>Creating account...</span>
          </>
        ) : (
          'Create account'
        )}
      </button>

      <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-4">
        Already have an account?{' '}
        <Link to="/login" className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium">
          Sign in
        </Link>
      </p>
    </form>
  );
};
