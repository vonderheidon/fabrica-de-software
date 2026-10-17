import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell } from './app/AppShell.js';
import './app/styles/tokens.css';
import './app/styles/artifact.css';

const root = document.getElementById('root');
if (!root) throw new Error('Application root is missing.');

createRoot(root).render(
  <React.StrictMode>
    <AppShell />
  </React.StrictMode>,
);
