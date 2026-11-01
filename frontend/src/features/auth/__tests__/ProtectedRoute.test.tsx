import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { AuthProvider } from '../AuthContext';
import { User } from '../types';

describe('ProtectedRoute Component', () => {
  const dummyUser: User = {
    id: 'user-uuid-1',
    email: 'auth_user@devflow.local',
    name: 'Authenticated User',
    avatar_url: null,
    created_at: new Date().toISOString(),
  };

  it('redirects unauthenticated user to /login', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthProvider skipInitialRefresh={true} initialUser={null} initialToken={null}>
          <Routes>
            <Route path="/login" element={<div>Login Page View</div>} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <div>Secret Dashboard Content</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('Login Page View')).toBeInTheDocument();
    expect(screen.queryByText('Secret Dashboard Content')).not.toBeInTheDocument();
  });

  it('renders children when user is authenticated', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthProvider skipInitialRefresh={true} initialUser={dummyUser} initialToken="valid-token">
          <Routes>
            <Route path="/login" element={<div>Login Page View</div>} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <div>Secret Dashboard Content</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('Secret Dashboard Content')).toBeInTheDocument();
    expect(screen.queryByText('Login Page View')).not.toBeInTheDocument();
  });
});
