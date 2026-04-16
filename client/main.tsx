import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import spriteMarkup from './icons.svg?raw';

const spriteHost = document.createElement('div');
spriteHost.style.display = 'none';
spriteHost.innerHTML = spriteMarkup;
document.body.insertBefore(spriteHost, document.body.firstChild);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
