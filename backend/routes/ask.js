const express = require('express');
const OpenAI  = require('openai');
const router  = express.Router();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are a flood risk assistant for Nairobi, Kenya.
You help residents decide whether it is safe to travel during heavy rainfall.

Known flood-prone areas:
- Mathare Valley: HIGH risk above 10mm/hr
- Mukuru kwa Njenga / Mukuru kwa Reuben: HIGH risk above 10mm/hr
- Ngong River corridor: HIGH risk above 8mm/hr
- Nairobi River banks (Ngara, Bondeni): HIGH risk above 8mm/hr
- Eastleigh Sections 1–3: MEDIUM-HIGH risk above 15mm/hr
- South B near Bellevue: MEDIUM risk above 20mm/hr
- Westlands lower areas: LOW-MEDIUM risk above 25mm/hr
- CBD main roads: LOW risk, surface water above 30mm/hr

When answering, you will receive current precipitation in mm/hr plus origin/destination if provided.

ALWAYS respond in this format:
1. Risk level: LOW / MEDIUM / HIGH
2. One sentence reason
3. One practical suggestion

Be concise. Write like you're texting a friend who needs to leave now.`;

router.post('/', async (req, res) => {
  const { question, precipitation_mm, origin, destination } = req.body;

  if (!question) return res.status(400).json({ error: 'question is required' });

  let userMessage = '';
  if (precipitation_mm != null) userMessage += `Current rainfall: ${precipitation_mm}mm/hr\n`;
  if (origin)                   userMessage += `From: ${origin}\n`;
  if (destination)              userMessage += `To: ${destination}\n`;
  userMessage += `\nQuestion: ${question}`;

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
    res.status(500).json({ error: 'AI request failed', details: err.message });
  }
});

module.exports = router;