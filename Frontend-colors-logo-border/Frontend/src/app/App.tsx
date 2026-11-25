import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from '@/app/providers/AuthProvider';
import { LanguageProvider } from '@/app/providers/LanguageProvider';
import { ToastProvider } from '@/app/providers/ToastProvider';
import { router } from '@/app/router';
import { ErrorBoundary } from '@/components/feedback/ErrorBoundary';

export function App() {
  return (
    <LanguageProvider>
      <ToastProvider>
        <AuthProvider>
          <ErrorBoundary>
            <RouterProvider router={router} />
          </ErrorBoundary>
        </AuthProvider>
      </ToastProvider>
    </LanguageProvider>
  );
}
