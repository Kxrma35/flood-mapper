require('dotenv').config();
const express = require('express');
const cors = require('cors');
const weatherRoute = require('./routes/weather');
const askRoute = require('./routes/ask');

const app = express();

// Allow requests from Vite dev server and production frontend
const allowedOrigins = [
  'http://localhost:5173',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.use('/api/weather', weatherRoute);
app.use('/api/ask', askRoute);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend running on :${PORT}`));