import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell } from './app/AppShell.js';
import './app/styles/tokens.css';
import './app/styles/artifact.css';
import './app/styles/dashboard.css';
import './app/styles/projects.css';
import './app/styles/settings.css';
import './app/styles/queue.css';

const root = document.getElementById('root');
if (!root) throw new Error('Application root is missing.');

createRoot(root).render(
  <React.StrictMode>
    <AppShell />
  </React.StrictMode>,
);
