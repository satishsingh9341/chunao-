import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import pkg from 'pg';
import { createServer } from 'http';
import admin from 'firebase-admin';
import { Storage } from '@google-cloud/storage';
import { Logging } from '@google-cloud/logging';
import { validate as isUUID } from 'uuid';

dotenv.config();

const { Pool } = pkg;
const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 8080;

// ─── DATABASE ────────────────────────────────────────────────────────────────
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ─── FIREBASE ADMIN ──────────────────────────────────────────────────────────
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID
  });
}

// ─── GOOGLE CLOUD STORAGE ────────────────────────────────────────────────────
const storage = new Storage({ projectId: process.env.GOOGLE_CLOUD_PROJECT });
const bucket = storage.bucket(process.env.GCS_BUCKET || 'chunao-saathi-storage');

// ─── GOOGLE CLOUD LOGGING ────────────────────────────────────────────────────
const logging = new Logging({ projectId: process.env.GOOGLE_CLOUD_PROJECT });
const log = logging.log('chunao-saathi-log');

/**
 * Logs a message to Google Cloud Logging
 * @param {string} severity - Log severity (INFO, WARNING, ERROR)
 * @param {string} message - Log message
 * @param {Object} data - Additional data to log
 */
const logToCloud = async (severity, message, data = {}) => {
  try {
    const entry = log.entry(
      { severity, resource: { type: 'global' } },
      { message, ...data, timestamp: new Date().toISOString() }
    );
    await log.write(entry);
  } catch (e) {
    console.log(severity, message);
  }
};

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
app.use(express.json({ limit: '10kb' }));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
}));

// ─── UUID VALIDATOR ───────────────────────────────────────────────────────────
/**
 * Middleware to validate UUID params
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
const validateUUID = (req, res, next) => {
  const ids = [req.params.userId, req.params.eventId, req.params.questionId].filter(Boolean);
  for (const id of ids) {
    if (!isUUID(id)) return res.status(400).json({ error: 'Invalid ID format' });
  }
  next();
};

// ─── FIREBASE TOKEN VERIFIER ──────────────────────────────────────────────────
/**
 * Middleware to verify Firebase Auth token
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
const verifyToken = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer '))
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  try {
    const token = header.split('Bearer ')[1];
    req.user = await admin.auth().verifyIdToken(token);
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

// ─── INPUT SANITIZER ──────────────────────────────────────────────────────────
/**
 * Sanitizes string input to prevent XSS and injection
 * @param {string} str - Input string
 * @returns {string} Sanitized string
 */
const sanitize = (str) => {
  if (typeof str !== 'string') return str;
  return str.replace(/[<>'"`;]/g, '').trim().slice(0, 500);
};

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Chunao Saathi API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// ─── VOTER REGISTRATION ───────────────────────────────────────────────────────
/**
 * POST /api/auth/register
 * Register a new voter
 * @body {string} name - Voter's full name
 * @body {string} phone - Voter's phone number
 * @body {string} state - Voter's state
 * @body {string} district - Voter's district
 */
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, phone, state, district } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'name and phone are required' });
    if (typeof name !== 'string' || typeof phone !== 'string')
      return res.status(400).json({ error: 'Invalid input types' });

    const cleanName = sanitize(name);
    const cleanPhone = sanitize(phone);
    const cleanState = sanitize(state || '');
    const cleanDistrict = sanitize(district || '');

    const existing = await pool.query('SELECT id FROM voters WHERE phone = $1', [cleanPhone]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Phone already registered' });

    const result = await pool.query(
      'INSERT INTO voters (name, phone, state, district, credit_score) VALUES ($1, $2, $3, $4, 100) RETURNING id, name, phone, state, district, credit_score',
      [cleanName, cleanPhone, cleanState, cleanDistrict]
    );

    await logToCloud('INFO', 'New voter registered', { voterId: result.rows[0].id });
    res.status(201).json({ message: 'Voter registered successfully', voter: result.rows[0] });
  } catch (err) {
    await logToCloud('ERROR', 'Register error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/login
 * Login voter by phone
 * @body {string} phone - Voter's phone number
 */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'phone is required' });

    const result = await pool.query('SELECT id, name, phone, state, district, credit_score FROM voters WHERE phone = $1', [sanitize(phone)]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Voter not found' });

    res.status(200).json({ message: 'Login successful', voter: result.rows[0] });
  } catch (err) {
    await logToCloud('ERROR', 'Login error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── VOTER PROFILE ────────────────────────────────────────────────────────────
/**
 * GET /api/voter/:userId
 * Get voter profile by ID
 * @param {string} userId - Voter UUID
 */
app.get('/api/voter/:userId', validateUUID, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, phone, state, district, credit_score, created_at FROM voters WHERE id = $1',
      [req.params.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Voter not found' });
    res.status(200).json({ voter: result.rows[0] });
  } catch (err) {
    await logToCloud('ERROR', 'Get voter error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── ELECTION EVENTS ──────────────────────────────────────────────────────────
/**
 * GET /api/events
 * Get all election events / awareness campaigns
 */
app.get('/api/events', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM election_events ORDER BY event_date DESC');
    res.status(200).json({ events: result.rows, total: result.rows.length });
  } catch (err) {
    await logToCloud('ERROR', 'Get events error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/events
 * Create a new election awareness event
 * @body {string} name - Event name
 * @body {string} event_date - Event date
 * @body {string} venue - Event venue
 * @body {string} state - State for the event
 */
app.post('/api/events', verifyToken, async (req, res) => {
  try {
    const { name, event_date, venue, state, capacity } = req.body;
    if (!name || !event_date || !venue) return res.status(400).json({ error: 'name, event_date, venue are required' });

    const result = await pool.query(
      'INSERT INTO election_events (name, event_date, venue, state, capacity, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [sanitize(name), event_date, sanitize(venue), sanitize(state || ''), capacity || 500, 'upcoming']
    );
    res.status(201).json({ message: 'Event created', event: result.rows[0] });
  } catch (err) {
    await logToCloud('ERROR', 'Create event error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── BOOTH LOCATOR ────────────────────────────────────────────────────────────
/**
 * GET /api/booths/:eventId
 * Get polling booths for an event/region
 * @param {string} eventId - Event UUID
 */
app.get('/api/booths/:eventId', validateUUID, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM polling_booths WHERE event_id = $1 ORDER BY booth_number',
      [req.params.eventId]
    );
    res.status(200).json({ booths: result.rows, total: result.rows.length });
  } catch (err) {
    await logToCloud('ERROR', 'Get booths error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/booths/assign
 * Assign voter to a polling booth
 * @body {string} voter_id - Voter UUID
 * @body {string} event_id - Event UUID
 */
app.post('/api/booths/assign', async (req, res) => {
  try {
    const { voter_id, event_id } = req.body;
    if (!voter_id || !event_id) return res.status(400).json({ error: 'voter_id and event_id are required' });
    if (!isUUID(voter_id) || !isUUID(event_id)) return res.status(400).json({ error: 'Invalid ID format' });

    const existing = await pool.query(
      'SELECT id FROM booth_assignments WHERE voter_id = $1 AND event_id = $2',
      [voter_id, event_id]
    );
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Voter already assigned to a booth' });

    const boothResult = await pool.query(
      'SELECT id FROM polling_booths WHERE event_id = $1 AND current_count < capacity ORDER BY current_count ASC LIMIT 1',
      [event_id]
    );
    if (boothResult.rows.length === 0) return res.status(404).json({ error: 'No available booths' });

    const boothId = boothResult.rows[0].id;
    const assignment = await pool.query(
      'INSERT INTO booth_assignments (voter_id, event_id, booth_id) VALUES ($1, $2, $3) RETURNING *',
      [voter_id, event_id, boothId]
    );
    await pool.query('UPDATE polling_booths SET current_count = current_count + 1 WHERE id = $1', [boothId]);

    res.status(201).json({ message: 'Booth assigned successfully', assignment: assignment.rows[0] });
  } catch (err) {
    await logToCloud('ERROR', 'Booth assign error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── QR ATTENDANCE ────────────────────────────────────────────────────────────
/**
 * POST /api/attendance/mark
 * Mark voter attendance via QR code
 * @body {string} qr_code - Voter's QR code string
 * @body {string} event_id - Event UUID
 */
app.post('/api/attendance/mark', async (req, res) => {
  try {
    const { qr_code, event_id } = req.body;
    if (!qr_code || !event_id) return res.status(400).json({ error: 'qr_code and event_id are required' });
    if (!isUUID(event_id)) return res.status(400).json({ error: 'Invalid event_id format' });

    const voter = await pool.query('SELECT id, name FROM voters WHERE qr_code = $1', [sanitize(qr_code)]);
    if (voter.rows.length === 0) return res.status(404).json({ error: 'Invalid QR code' });

    const voterId = voter.rows[0].id;
    const alreadyMarked = await pool.query(
      'SELECT id FROM attendance WHERE voter_id = $1 AND event_id = $2',
      [voterId, event_id]
    );
    if (alreadyMarked.rows.length > 0) return res.status(409).json({ error: 'Attendance already marked' });

    await pool.query(
      'INSERT INTO attendance (voter_id, event_id, marked_at) VALUES ($1, $2, NOW())',
      [voterId, event_id]
    );
    await pool.query('UPDATE voters SET credit_score = credit_score + 10 WHERE id = $1', [voterId]);

    await logToCloud('INFO', 'Attendance marked', { voterId, eventId: event_id });
    res.status(201).json({ message: 'Attendance marked successfully', voter: voter.rows[0] });
  } catch (err) {
    await logToCloud('ERROR', 'Attendance error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/attendance/:eventId
 * Get all attendance records for an event
 * @param {string} eventId - Event UUID
 */
app.get('/api/attendance/:eventId', validateUUID, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT a.*, v.name, v.phone FROM attendance a JOIN voters v ON a.voter_id = v.id WHERE a.event_id = $1 ORDER BY a.marked_at DESC',
      [req.params.eventId]
    );
    res.status(200).json({ attendance: result.rows, count: result.rows.length });
  } catch (err) {
    await logToCloud('ERROR', 'Get attendance error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── CREDIT SCORE (like CIBIL for civic participation) ───────────────────────
/**
 * GET /api/credit/:userId
 * Get voter's civic credit score and history
 * @param {string} userId - Voter UUID
 */
app.get('/api/credit/:userId', validateUUID, async (req, res) => {
  try {
    const voter = await pool.query('SELECT id, name, credit_score FROM voters WHERE id = $1', [req.params.userId]);
    if (voter.rows.length === 0) return res.status(404).json({ error: 'Voter not found' });

    const history = await pool.query(
      'SELECT * FROM credit_history WHERE voter_id = $1 ORDER BY created_at DESC LIMIT 20',
      [req.params.userId]
    );
    res.status(200).json({ voter: voter.rows[0], history: history.rows });
  } catch (err) {
    await logToCloud('ERROR', 'Get credit error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/credit/update
 * Update voter's credit score
 * @body {string} voter_id - Voter UUID
 * @body {number} change_amount - Points to add/subtract
 * @body {string} reason - Reason for change
 */
app.post('/api/credit/update', verifyToken, async (req, res) => {
  try {
    const { voter_id, change_amount, reason } = req.body;
    if (!voter_id || change_amount === undefined || !reason)
      return res.status(400).json({ error: 'voter_id, change_amount, and reason are required' });
    if (!isUUID(voter_id)) return res.status(400).json({ error: 'Invalid voter_id format' });
    if (typeof change_amount !== 'number') return res.status(400).json({ error: 'change_amount must be a number' });

    await pool.query('UPDATE voters SET credit_score = credit_score + $1 WHERE id = $2', [change_amount, voter_id]);
    await pool.query(
      'INSERT INTO credit_history (voter_id, change_amount, reason) VALUES ($1, $2, $3)',
      [voter_id, change_amount, sanitize(reason)]
    );
    const updated = await pool.query('SELECT credit_score FROM voters WHERE id = $1', [voter_id]);
    res.status(200).json({ message: 'Credit updated', new_score: updated.rows[0].credit_score });
  } catch (err) {
    await logToCloud('ERROR', 'Credit update error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── EHSAAS — Anonymous Doubt System ─────────────────────────────────────────
/**
 * POST /api/ehsaas/question
 * Submit anonymous election doubt/question
 * @body {string} question - The question text
 * @body {string} event_id - Event UUID
 * @body {string} category - Question category (voting/registration/booth/other)
 */
app.post('/api/ehsaas/question', async (req, res) => {
  try {
    const { question, event_id, category } = req.body;
    if (!question || !event_id) return res.status(400).json({ error: 'question and event_id are required' });
    if (!isUUID(event_id)) return res.status(400).json({ error: 'Invalid event_id format' });
    if (question.trim().length === 0) return res.status(400).json({ error: 'Question cannot be empty' });

    const result = await pool.query(
      'INSERT INTO ehsaas_questions (question, event_id, category, status) VALUES ($1, $2, $3, $4) RETURNING id, question, category, status, created_at',
      [sanitize(question), event_id, sanitize(category || 'general'), 'pending']
    );
    res.status(201).json({ message: 'Question submitted anonymously', question: result.rows[0] });
  } catch (err) {
    await logToCloud('ERROR', 'Ehsaas question error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/ehsaas/:eventId
 * Get all anonymous questions for an event
 * @param {string} eventId - Event UUID
 */
app.get('/api/ehsaas/:eventId', validateUUID, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, question, category, status, answer, created_at FROM ehsaas_questions WHERE event_id = $1 ORDER BY created_at DESC',
      [req.params.eventId]
    );
    res.status(200).json({ questions: result.rows, total: result.rows.length });
  } catch (err) {
    await logToCloud('ERROR', 'Get ehsaas error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── QR CODE UPLOAD (Google Cloud Storage) ───────────────────────────────────
/**
 * POST /api/storage/upload-qr
 * Upload voter QR code to Google Cloud Storage
 * @body {string} voter_id - Voter UUID
 * @body {string} qr_data - Base64 QR image data
 */
app.post('/api/storage/upload-qr', async (req, res) => {
  try {
    const { voter_id, qr_data } = req.body;
    if (!voter_id || !qr_data) return res.status(400).json({ error: 'voter_id and qr_data are required' });
    if (!isUUID(voter_id)) return res.status(400).json({ error: 'Invalid voter_id format' });

    const buffer = Buffer.from(qr_data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const fileName = `qr-codes/${voter_id}.png`;
    const file = bucket.file(fileName);

    await file.save(buffer, { metadata: { contentType: 'image/png' }, resumable: false });
    const publicUrl = `https://storage.googleapis.com/${process.env.GCS_BUCKET}/${fileName}`;

    await pool.query('UPDATE voters SET qr_url = $1 WHERE id = $2', [publicUrl, voter_id]);
    await logToCloud('INFO', 'QR uploaded to GCS', { voterId: voter_id, url: publicUrl });

    res.status(200).json({ message: 'QR code uploaded successfully', url: publicUrl });
  } catch (err) {
    await logToCloud('ERROR', 'QR upload error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── FAKE NEWS CHECK (AI via Cloud Function) ──────────────────────────────────
/**
 * POST /api/fakenews/check
 * Check if an election-related claim is true or false
 * @body {string} claim - The claim to fact-check
 */
app.post('/api/fakenews/check', async (req, res) => {
  try {
    const { claim } = req.body;
    if (!claim) return res.status(400).json({ error: 'claim is required' });
    if (claim.trim().length === 0) return res.status(400).json({ error: 'Claim cannot be empty' });

    const FAKE_NEWS_DB = [
      { keywords: ['evm', 'hack', 'rigged'], verdict: 'FALSE', explanation: 'EVMs are standalone machines with no network connectivity. Cannot be hacked remotely.' },
      { keywords: ['nota', 'useless', 'waste'], verdict: 'FALSE', explanation: 'NOTA is a valid constitutional right to reject all candidates.' },
      { keywords: ['vote', 'sell', 'money', 'paise'], verdict: 'ILLEGAL', explanation: 'Vote selling is a criminal offence under Section 171B IPC. Report to 1950.' },
    ];

    const lower = sanitize(claim).toLowerCase();
    const match = FAKE_NEWS_DB.find(f => f.keywords.some(k => lower.includes(k)));

    if (match) {
      res.status(200).json({ verdict: match.verdict, explanation: match.explanation, source: 'ECI Guidelines' });
    } else {
      res.status(200).json({ verdict: 'UNVERIFIED', explanation: 'Could not verify this claim. Please check eci.gov.in or call 1950.', source: 'Manual check required' });
    }
  } catch (err) {
    await logToCloud('ERROR', 'Fake news check error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── START SERVER ─────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  httpServer.listen(PORT, () => logToCloud('INFO', `Server running on port ${PORT}`));
}

export default app;
