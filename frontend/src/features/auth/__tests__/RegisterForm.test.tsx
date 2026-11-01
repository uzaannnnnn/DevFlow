import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RegisterForm } from '../components/RegisterForm';
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

describe('RegisterForm Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderRegisterForm = (onSuccess?: () => void) => {
    return render(
      <BrowserRouter>
        <AuthProvider skipInitialRefresh={true}>
          <RegisterForm onSuccess={onSuccess} />
        </AuthProvider>
      </BrowserRouter>
    );
  };

  it('renders registration form with email, name, and password fields', () => {
    renderRegisterForm();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('validates password minimum length requirement (min 8 chars)', async () => {
    renderRegisterForm();

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'newuser@devflow.local' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: '1234567' } }); // 7 chars
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText(/password must be at least 8 characters long/i)).toBeInTheDocument();
    });
  });

  it('submits registration and performs automatic login on success', async () => {
    const onSuccess = vi.fn();

    vi.mocked(authApi.register).mockResolvedValueOnce({
      success: true,
      data: {
        user: {
          id: 'user-uuid-new',
          email: 'grace@devflow.local',
          name: 'Grace Hopper',
          avatar_url: null,
          created_at: new Date().toISOString(),
        },
      },
      meta: null,
    });

    vi.mocked(authApi.login).mockResolvedValueOnce({
      success: true,
      data: {
        access_token: 'new-jwt-token',
        token_type: 'Bearer',
        expires_in: 900,
        user: {
          id: 'user-uuid-new',
          email: 'grace@devflow.local',
          name: 'Grace Hopper',
          avatar_url: null,
          created_at: new Date().toISOString(),
        },
      },
      meta: null,
    });

    renderRegisterForm(onSuccess);

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'grace@devflow.local' } });
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Grace Hopper' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'StrongPass123!' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(authApi.register).toHaveBeenCalledWith({
        email: 'grace@devflow.local',
        name: 'Grace Hopper',
        password: 'StrongPass123!',
      });
      expect(authApi.login).toHaveBeenCalledWith({
        email: 'grace@devflow.local',
        password: 'StrongPass123!',
      });
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });
});
