import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { applyTheme, cachedTheme } from '../theme';
import '../themes.css';
import '../styles.css';
import './focus.css';
import FocusApp from './FocusApp';

applyTheme(cachedTheme());

// Hash routes work the same from the dev server's /focus.html and from the packaged app.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <FocusApp />
    </HashRouter>
  </StrictMode>
);
