import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import '@/assets/styles/tokens.css';
import '@/assets/styles/reset.css';
import '@/assets/styles/patterns.css';
import '@/assets/styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
