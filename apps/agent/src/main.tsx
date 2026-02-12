import React from 'react';
import ReactDOM from 'react-dom/client';
import Support from './Support';
import { Toaster } from '@/ui/components/sonner';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Support />
    <Toaster position="bottom-right" />
  </React.StrictMode>
);
