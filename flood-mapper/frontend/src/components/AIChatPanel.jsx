// AIChatPanel.jsx
// AI chat interface. Sends questions to /api/ask with live rainfall context.
// Suggestions are pre-loaded; user can also type free-form questions.

import { useState, useRef, useEffect } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || '';

const SUGGESTIONS = [
  'Is it safe to drive to JKIA now?',
  'How is Thika Road looking?',
  'Is Mathare safe to walk through?',
  'Best route from Westlands to CBD?',
  'Should I avoid Kibera right now?',
];

export default function AIChatPanel({ weatherMm, origin, destination }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function ask(question) {
    if (!question.trim()) return;
    setLoading(true);
    setMessages(prev => [...prev, { role: 'user', text: question }]);
    setInput('');

    try {
      const { data } = await axios.post(`${API}/api/ask`, {
        question,
        precipitation_mm: weatherMm,
        origin,
        destination,
      });
      setMessages(prev => [...prev, { role: 'ai', text: data.answer }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'ai',
        text: 'Could not reach the server. Check your connection and try again.',
      }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

      {/* Suggestion chips — shown only before first message */}
      {messages.length === 0 && (
        <div style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: 10, color: '#555', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>
            Try asking:
          </div>
          {SUGGESTIONS.map(s => (
            <button key={s} onClick={() => ask(s)} style={styles.chip}>{s}</button>
          ))}
        </div>
      )}

      {/* Message thread */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
        {messages.map((msg, i) => (
          <div key={i} style={{
            ...styles.bubble,
            background: msg.role === 'user' ? '#1D9E75' : '#1e1e1e',
            color: msg.role === 'user' ? '#fff' : '#d0d0d0',
            marginLeft: msg.role === 'user' ? 'auto' : 0,
            border: msg.role === 'ai' ? '1px solid #2a2a2a' : 'none',
          }}>
            {msg.text}
          </div>
        ))}
        {loading && (
          <div style={{ color: '#555', fontSize: 12, padding: '6px 0' }}>
            <i className="ti ti-loader-2" style={{ fontSize: 13, marginRight: 6 }} aria-hidden="true" />
            Analyzing conditions...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div style={styles.inputRow}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !loading && ask(input)}
          placeholder="Ask about flood risk..."
          disabled={loading}
          style={styles.input}
        />
        <button
          onClick={() => ask(input)}
          disabled={loading || !input.trim()}
          style={styles.sendBtn}
          aria-label="Send"
        >
          <i className="ti ti-send" style={{ fontSize: 16 }} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

const styles = {
  chip: {
    display: 'block', width: '100%', textAlign: 'left',
    padding: '7px 10px', marginBottom: 5,
    background: '#1a1a1a', border: '1px solid #2a2a2a',
    borderRadius: 6, cursor: 'pointer', fontSize: 12,
    color: '#aaa', fontFamily: 'inherit',
  },
  bubble: {
    marginBottom: 10,
    padding: '9px 13px',
    borderRadius: 8,
    maxWidth: '86%',
    fontSize: 13,
    lineHeight: 1.6,
  },
  inputRow: {
    padding: '10px 12px',
    borderTop: '1px solid #1e1e1e',
    display: 'flex',
    gap: 8,
  },
  input: {
    flex: 1, padding: '8px 12px',
    background: '#1a1a1a', border: '1px solid #2a2a2a',
    borderRadius: 6, fontSize: 13, color: '#e8e8e8',
    outline: 'none',
  },
  sendBtn: {
    padding: '8px 12px',
    background: '#1D9E75', color: '#fff',
    border: 'none', borderRadius: 6,
    cursor: 'pointer', display: 'flex', alignItems: 'center',
  },
};