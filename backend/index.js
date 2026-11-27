require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const axios   = require('axios');

const app = express();   // ← must come FIRST

const weatherRoute = require('./routes/weather');
const askRoute     = require('./routes/ask');
const predictRoute = require('./routes/predict');
const routeRoute   = require('./routes/route');
const placesRoute  = require('./routes/places');
const recordsRoute = require('./routes/records');

// Behind a hosting proxy (Render, Railway), set TRUST_PROXY to the number of proxies
// (usually 1) so the rate limits count each visitor's own IP.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY));

const allowedOrigins = ['http://localhost:5173', process.env.FRONTEND_URL].filter(Boolean);
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.use('/api/weather', weatherRoute);
app.use('/api/ask',     askRoute);
app.use('/api/predict', predictRoute);
app.use('/api/route',   routeRoute);
app.use('/api/places',  placesRoute);
app.use('/api/records', recordsRoute);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend running on :${PORT}`);
  // On free hosting both servers sleep when idle; wake the model service as soon as this one
  // wakes, so the first predictions don't wait for it.
  if (process.env.ML_URL) {
    axios.get(`${process.env.ML_URL}/health`, { timeout: 90000 }).catch(() => {});
  }
});