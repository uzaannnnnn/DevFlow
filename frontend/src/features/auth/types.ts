export interface User {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface AuthTokens {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  name?: string;
}

export interface Session {
  id: string;
  expires_at: string;
  created_at: string;
  is_current: boolean;
}

