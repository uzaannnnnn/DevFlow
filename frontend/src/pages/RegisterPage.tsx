import React from 'react';
import { RegisterForm } from '../features/auth/components/RegisterForm';

export const RegisterPage: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-canvas">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-ink text-surface font-mono font-bold text-sm tracking-wider shadow-sm mb-3">
          DF
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-ink">
          Create your DevFlow account
        </h2>
        <p className="mt-1 text-xs text-muted">
          Start collaborating with your team in seconds
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-surface py-7 px-5 sm:rounded-lg sm:px-8 border border-line shadow-pop">
          <RegisterForm />
        </div>
      </div>
    </div>
  );
};

