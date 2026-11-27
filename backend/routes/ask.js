const express   = require('express');
const OpenAI    = require('openai');
const rateLimit = require('express-rate-limit');
const { buildSystemPrompt } = require('../load-flood-data');
const { currentConditions, describeConditions } = require('../lib/conditions');
const router    = express.Router();

const QUESTIONS_PER_MINUTE = 10;

const askLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: QUESTIONS_PER_MINUTE,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many questions in a short time. Please wait a minute and try again.' },
});

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const SYSTEM_PROMPT = buildSystemPrompt();

const MAX_QUESTION_CHARS = 500;
const MAX_PLACE_CHARS = 100;
const clean = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

router.post('/', askLimiter, async (req, res) => {
  const question    = clean(req.body?.question, MAX_QUESTION_CHARS);
  const origin      = clean(req.body?.origin, MAX_PLACE_CHARS);
  const destination = clean(req.body?.destination, MAX_PLACE_CHARS);

  if (!question) return res.status(400).json({ error: 'question is required' });
  if (!openai) return res.status(503).json({ error: 'The AI assistant is not set up on this server yet.' });

  let conditions;
  try {
    conditions = describeConditions(await currentConditions());
  } catch (err) {
    console.warn('Live conditions unavailable for chat:', err.message);
    conditions = 'Live conditions: unavailable (weather data could not be loaded).';
  }

  const context = [conditions, origin && `From: ${origin}`, destination && `To: ${destination}`]
    .filter(Boolean)
    .join('\n');
  const userMessage = `${context}\n\nQuestion: ${question}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',   // cheapest, fast — swap to gpt-4o for better answers
      max_tokens: 300,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: userMessage   },
      ],
    });

    res.json({ answer: response.choices[0].message.content });
  } catch (err) {
    console.error('OpenAI error:', err.message);
    res.status(502).json({ error: 'The AI assistant could not answer right now. Try again in a moment.' });
  }
});

module.exports = router;
