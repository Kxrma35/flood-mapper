require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const app = express();   // ← must come FIRST

const weatherRoute = require('./routes/weather');
const askRoute     = require('./routes/ask');
const predictRoute = require('./routes/predict');

// Behind a hosting proxy (Render, Railway), set TRUST_PROXY to the number of proxies
// (usually 1) so the chat rate limit counts each visitor's own IP.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY));

const allowedOrigins = ['http://localhost:5173', process.env.FRONTEND_URL].filter(Boolean);
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.use('/api/weather', weatherRoute);
app.use('/api/ask',     askRoute);
app.use('/api/predict', predictRoute);   // ← now safe

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend running on :${PORT}`));