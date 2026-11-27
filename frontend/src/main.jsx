import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { startAnalytics } from './analytics';
import 'leaflet/dist/leaflet.css';
import './index.css';

startAnalytics();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);