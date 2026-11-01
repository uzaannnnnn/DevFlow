import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoginForm } from '../components/LoginForm';
import { AuthProvider } from '../AuthContext';
import { authApi } from '../api';

vi.mock('../api', () => ({
  authApi: {
    login: vi.fn(),
    register: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    getCurrentUser: vi.fn(),
  },
}));

describe('LoginForm Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderLoginForm = (onSuccess?: () => void) => {
    return render(
      <BrowserRouter>
        <AuthProvider skipInitialRefresh={true}>
          <LoginForm onSuccess={onSuccess} />
        </AuthProvider>
      </BrowserRouter>
    );
  };

  it('renders login form with email, password inputs and submit button', () => {
    renderLoginForm();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('displays client-side validation errors when submitting empty form', async () => {
    renderLoginForm();

    const submitBtn = screen.getByRole('button', { name: /sign in/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/email is required/i)).toBeInTheDocument();
      expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    });
  });

  it('displays validation error for invalid email format', async () => {
    renderLoginForm();

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'invalid-email' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/please enter a valid email address/i)).toBeInTheDocument();
    });
  });

  it('calls authApi.login and invokes onSuccess callback on valid submission', async () => {
    const onSuccess = vi.fn();

    vi.mocked(authApi.login).mockResolvedValueOnce({
      success: true,
      data: {
        access_token: 'fake-jwt-token',
        token_type: 'Bearer',
        expires_in: 900,
        user: {
          id: 'user-uuid-1',
          email: 'test@devflow.local',
          name: 'Test User',
          avatar_url: null,
          created_at: new Date().toISOString(),
        },
      },
      meta: null,
    });

    renderLoginForm(onSuccess);

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'test@devflow.local' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'ValidPass123!' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalledWith({
        email: 'test@devflow.local',
        password: 'ValidPass123!',
      });
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });
});
