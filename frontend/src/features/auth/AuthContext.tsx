import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { authApi } from './api';
import { AuthTokens, LoginInput, RegisterInput, User } from './types';
import { setAuthToken } from '../../shared/lib/api-client';

export interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (input: LoginInput) => Promise<AuthTokens>;
  register: (input: RegisterInput) => Promise<{ user: User }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export interface AuthProviderProps {
  children: ReactNode;
  initialUser?: User | null;
  initialToken?: string | null;
  skipInitialRefresh?: boolean; // For isolated testing
}

export const AuthProvider: React.FC<AuthProviderProps> = ({
  children,
  initialUser = null,
  initialToken = null,
  skipInitialRefresh = false,
}) => {
  const [user, setUser] = useState<User | null>(initialUser);
  const [accessToken, setAccessToken] = useState<string | null>(initialToken);
  const [isLoading, setIsLoading] = useState<boolean>(!skipInitialRefresh && initialUser === null);

  // Sync initial token with api-client in-memory store
  useEffect(() => {
    if (initialToken) {
      setAuthToken(initialToken);
    }
  }, [initialToken]);

  // Initial silent refresh on app load to restore session from HttpOnly cookie
  useEffect(() => {
    if (skipInitialRefresh || initialUser !== null) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const restoreSession = async () => {
      try {
        const response = await authApi.refresh();
        if (isMounted && response.data) {
          setAuthToken(response.data.access_token);
          setAccessToken(response.data.access_token);
          setUser(response.data.user);
        }
      } catch {
        // No active refresh session or invalid token: user is unauthenticated
        if (isMounted) {
          setAuthToken(null);
          setAccessToken(null);
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, [skipInitialRefresh, initialUser]);

  const login = async (input: LoginInput): Promise<AuthTokens> => {
    const response = await authApi.login(input);
    const tokens = response.data;
    setAuthToken(tokens.access_token);
    setAccessToken(tokens.access_token);
    setUser(tokens.user);
    return tokens;
  };

  const register = async (input: RegisterInput): Promise<{ user: User }> => {
    const response = await authApi.register(input);
    return response.data;
  };

  const logout = async (): Promise<void> => {
    try {
      await authApi.logout();
    } finally {
      setAuthToken(null);
      setAccessToken(null);
      setUser(null);
    }
  };

  const value: AuthContextType = {
    user,
    accessToken,
    isLoading,
    isAuthenticated: !!user && !!accessToken,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

