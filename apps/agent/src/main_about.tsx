import React from 'react';
import ReactDOM from 'react-dom/client';
import About from './About.tsx';
import { Toaster } from '@/ui/components/sonner.tsx';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <About />
    <Toaster position="bottom-right" />
  </React.StrictMode>
);
