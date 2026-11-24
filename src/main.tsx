import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { startAppUpdates } from './lib/appUpdate';
import './index.css';
import App from './App';

startAppUpdates();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
