const express = require('express');
const axios = require('axios');
const router = express.Router();

// Phase 5: System prompt is built from your real CSV data (falls back to
// built-in Nairobi data until the CSV is dropped into data/)
const { buildSystemPrompt } = require('../load-flood-data');
const SYSTEM_PROMPT = buildSystemPrompt();

router.post('/', async (req, res) => {
  const { question, precipitation_mm, origin, destination } = req.body;

  if (!question) {
    return res.status(400).json({ error: 'question is required' });
  }

  // Build context-rich user message
  let userMessage = '';
  if (precipitation_mm != null) {
    userMessage += `Current rainfall: ${precipitation_mm}mm/hr\n`;
  }
  if (origin && destination) {
    userMessage += `Route: ${origin} to ${destination}\n`;
  }
  userMessage += `\nQuestion: ${question}`;

  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      },
      {
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
      }
    );

    const answer = response.data.content[0]?.text || 'No response received.';
    res.json({ answer });
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data?.error?.message || err.message;
    console.error('Claude API error:', message);
    res.status(status).json({ error: 'AI request failed', details: message });
  }
});

module.exports = router;