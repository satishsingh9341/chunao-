// frontend/src/api.js
// Centralized API layer for Chunao Saathi

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

/**
 * Generic fetch wrapper with error handling
 * @param {string} endpoint
 * @param {Object} options
 */
const fetchAPI = async (endpoint, options = {}) => {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'API error');
  return data;
};

export const API = {
  /** Health check */
  health: () => fetchAPI('/api/health'),

  /** Register voter */
  register: (name, phone, state, district) =>
    fetchAPI('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, phone, state, district }) }),

  /** Login voter */
  login: (phone) =>
    fetchAPI('/api/auth/login', { method: 'POST', body: JSON.stringify({ phone }) }),

  /** Get all events */
  getEvents: () => fetchAPI('/api/events'),

  /** Find polling booths */
  getBooths: (eventId) => fetchAPI(`/api/booths/${eventId}`),

  /** Mark attendance via QR */
  markAttendance: (qrCode, eventId) =>
    fetchAPI('/api/attendance/mark', { method: 'POST', body: JSON.stringify({ qr_code: qrCode, event_id: eventId }) }),

  /** Get credit score */
  getCredit: (userId) => fetchAPI(`/api/credit/${userId}`),

  /** Submit anonymous question */
  submitQuestion: (question, eventId, category) =>
    fetchAPI('/api/ehsaas/question', { method: 'POST', body: JSON.stringify({ question, event_id: eventId, category }) }),

  /** Get EHSAAS questions */
  getQuestions: (eventId) => fetchAPI(`/api/ehsaas/${eventId}`),

  /** Check fake news */
  checkFakeNews: (claim) =>
    fetchAPI('/api/fakenews/check', { method: 'POST', body: JSON.stringify({ claim }) }),

  /**
   * AI chatbot via Gemini (Google Cloud Function)
   * @param {string} message
   * @param {string} lang
   */
  chatbot: async (message, lang = 'hi') => {
    const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY;
    const systemPrompt = `You are Chunao Saathi — an AI assistant for Indian election education.
Answer in the same language as the question (Hindi/English/Marathi/Tamil/Hinglish).
Topics: voting process, voter ID, EVM, NOTA, booth location, migrant voter rights, credit score, QR attendance.
Never discuss political parties or candidates.
Keep answers under 5 lines. Be encouraging about civic duty.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\nUser: ${message}` }] }]
        })
      }
    );
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, please try again.';
  },
};
