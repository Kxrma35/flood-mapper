require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const app = express();   // ← must come FIRST

const weatherRoute = require('./routes/weather');
const askRoute     = require('./routes/ask');
const predictRoute = require('./routes/predict');

const allowedOrigins = ['http://localhost:5173', process.env.FRONTEND_URL].filter(Boolean);
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.use('/api/weather', weatherRoute);
app.use('/api/ask',     askRoute);
app.use('/api/predict', predictRoute);   // ← now safe

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend running on :${PORT}`));