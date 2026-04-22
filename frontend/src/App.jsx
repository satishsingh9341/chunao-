// frontend/src/App.jsx
// Chunao Saathi — Complete Election Education App

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  signInWithGoogle, signOutUser, onAuthChange,
  listenToLiveAttendance, saveQuizScore,
  submitAnonymousQuestion, trackEvent,
  trackChatbotQuestion, trackBoothSearch,
  trackFakeNewsCheck, trackLanguageSwitch,
  getRemoteValue, requestNotificationPermission
} from './firebase.js';
import { API } from './api.js';

// ─── SKIP LINK (Accessibility) ───────────────────────────────────
const SkipLink = () => (
  <a
    href="#main-content"
    className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-orange-500 text-white px-4 py-2 rounded z-50"
  >
    Skip to main content
  </a>
);

// ─── GOOGLE MAPS VENUE COMPONENT ─────────────────────────────────
/**
 * Displays a Google Maps embed for a given venue
 * @param {string} venue - Venue name/address
 */
const VenueMap = ({ venue }) => (
  <div
    className="rounded-2xl overflow-hidden mt-4"
    style={{ height: '220px' }}
    role="region"
    aria-label={`Venue map: ${venue}`}
  >
    <iframe
      title={`Map of ${venue}`}
      width="100%"
      height="100%"
      style={{ border: 0 }}
      loading="lazy"
      allowFullScreen
      referrerPolicy="no-referrer-when-downgrade"
      src={`https://www.google.com/maps/embed/v1/place?key=${import.meta.env.VITE_GOOGLE_MAPS_KEY}&q=${encodeURIComponent(venue)}&zoom=15`}
    />
  </div>
);

// ─── TRANSLATIONS ─────────────────────────────────────────────────
const T = {
  en: {
    appName: 'Chunao Saathi', tagline: 'Your Election Companion',
    home: 'Home', chat: 'ChatBot', guide: 'Guide',
    booth: 'Booth', docs: 'Docs', fake: 'Fake News', quiz: 'Quiz',
    login: 'Sign in with Google', logout: 'Sign Out',
    chatPlaceholder: 'Ask anything about elections...',
    boothTitle: 'Find Your Polling Booth',
    fakeTitle: 'Fake News Checker',
    quizTitle: 'Election Quiz',
    startQuiz: 'Start Quiz',
  },
  hi: {
    appName: 'चुनाव साथी', tagline: 'आपका चुनाव सहायक',
    home: 'होम', chat: 'चैटबॉट', guide: 'गाइड',
    booth: 'बूथ', docs: 'दस्तावेज़', fake: 'फेक न्यूज़', quiz: 'क्विज़',
    login: 'Google से Login करें', logout: 'Logout',
    chatPlaceholder: 'चुनाव के बारे में पूछें...',
    boothTitle: 'अपना मतदान बूथ खोजें',
    fakeTitle: 'फेक न्यूज़ चेकर',
    quizTitle: 'चुनाव क्विज़',
    startQuiz: 'क्विज़ शुरू करें',
  },
};

const QUIZ_QUESTIONS = [
  { q: 'Minimum voting age in India?', hi: 'भारत में मतदान की न्यूनतम आयु?', opts: ['16', '18', '21', '25'], ans: 1 },
  { q: 'EVM stands for?', hi: 'EVM का पूर्ण रूप?', opts: ['Electric Vote Machine', 'Electronic Voting Machine', 'Electoral Vote Monitor', 'Electronic Vote Module'], ans: 1 },
  { q: 'NOTA means?', hi: 'NOTA का मतलब?', opts: ['No Other Total Amount', 'None Of The Above', 'National Open Tribunal Act', 'No Option To All'], ans: 1 },
  { q: 'ECI was established in?', hi: 'ECI की स्थापना कब?', opts: ['1947', '1950', '1952', '1949'], ans: 1 },
  { q: 'Polling booths open at?', hi: 'मतदान केंद्र खुलते हैं?', opts: ['6 AM', '7 AM', '8 AM', '9 AM'], ans: 1 },
  { q: 'Model Code of Conduct starts when?', hi: 'आदर्श आचार संहिता कब?', opts: ['Voting day', 'After results', 'Election announcement', 'Campaign start'], ans: 2 },
  { q: 'Lok Sabha total seats?', hi: 'लोकसभा कुल सीटें?', opts: ['450', '500', '543', '600'], ans: 2 },
  { q: 'Voter ID card official name?', hi: 'वोटर ID का आधिकारिक नाम?', opts: ['EPIC Card', 'VID Card', 'ECI Card', 'VOT Card'], ans: 0 },
  { q: 'Who conducts elections in India?', hi: 'भारत में चुनाव कौन कराता है?', opts: ['President', 'Parliament', 'Election Commission', 'Supreme Court'], ans: 2 },
  { q: 'VVPAT full form?', hi: 'VVPAT का पूर्ण रूप?', opts: ['Voter Verified Paper Audit Trail', 'Vote Validity Print And Track', 'Verified Voting Paper And Text', 'Virtual Voting Paper Audit Tool'], ans: 0 },
];

const STATES = ['Andhra Pradesh', 'Bihar', 'Delhi', 'Gujarat', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Punjab', 'Rajasthan', 'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'West Bengal'];

// ─── MAIN APP ─────────────────────────────────────────────────────
export default function App() {
  const [lang, setLang]       = useState('hi');
  const [tab, setTab]         = useState('home');
  const [user, setUser]       = useState(null);
  const [msgs, setMsgs]       = useState([{ r: 'bot', t: 'नमस्ते! 🇮🇳 मैं चुनाव साथी हूँ। कुछ भी पूछें!' }]);
  const [inp, setInp]         = useState('');
  const [busy, setBusy]       = useState(false);
  const [boothState, setBSt]  = useState('');
  const [boothDist, setBDist] = useState('');
  const [boothRes, setBoothR] = useState(null);
  const [fakeInp, setFakeInp] = useState('');
  const [fakeRes, setFakeRes] = useState(null);
  const [fakeLoad, setFakeLoad] = useState(false);
  const [quiz, setQuiz]       = useState({ on: false, idx: 0, score: 0, sel: null, done: false, qs: [] });
  const [liveCount, setLC]    = useState(0);
  const chatEnd = useRef();
  const t = T[lang] || T.hi;

  // Auth listener
  useEffect(() => { return onAuthChange(setUser); }, []);

  // Live attendance (Firestore real-time)
  useEffect(() => {
    const unsub = listenToLiveAttendance('demo-event-001', (data) => setLC(data.count));
    return unsub;
  }, []);

  // Request notifications
  useEffect(() => { requestNotificationPermission(); }, []);

  // Remote config
  useEffect(() => {
    getRemoteValue('chatbot_enabled').then(() => {});
  }, []);

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  // ─── CHATBOT ────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    if (!inp.trim() || busy) return;
    const userMsg = { r: 'user', t: inp.trim() };
    const newMsgs = [...msgs, userMsg];
    setMsgs(newMsgs);
    setInp('');
    setBusy(true);
    trackChatbotQuestion(lang);

    try {
      const reply = await API.chatbot(inp.trim(), lang);
      setMsgs(prev => [...prev, { r: 'bot', t: reply }]);
    } catch {
      setMsgs(prev => [...prev, { r: 'bot', t: '❌ Error. Please try again or call 1950.' }]);
    }
    setBusy(false);
  }, [inp, busy, msgs, lang]);

  // ─── BOOTH SEARCH ───────────────────────────────────────────────
  const findBooth = useCallback(() => {
    if (!boothState || !boothDist) { setBoothR('fill'); return; }
    trackBoothSearch(boothState, boothDist);
    setBoothR('found');
  }, [boothState, boothDist]);

  // ─── FAKE NEWS CHECK ────────────────────────────────────────────
  const checkFake = useCallback(async () => {
    if (!fakeInp.trim()) return;
    setFakeLoad(true); setFakeRes(null);
    try {
      const result = await API.checkFakeNews(fakeInp.trim());
      setFakeRes(result);
      trackFakeNewsCheck(result.verdict);
    } catch {
      setFakeRes({ verdict: 'ERROR', explanation: 'Check eci.gov.in or call 1950.' });
    }
    setFakeLoad(false);
  }, [fakeInp]);

  // ─── QUIZ ───────────────────────────────────────────────────────
  const startQuiz = () => {
    const shuffled = [...QUIZ_QUESTIONS].sort(() => Math.random() - 0.5);
    setQuiz({ on: true, idx: 0, score: 0, sel: null, done: false, qs: shuffled });
    trackEvent('quiz_started');
  };

  const selectAnswer = (i) => {
    if (quiz.sel !== null) return;
    const correct = i === quiz.qs[quiz.idx].ans;
    setQuiz(p => ({ ...p, sel: i, score: p.score + (correct ? 1 : 0) }));
  };

  const nextQuestion = async () => {
    const next = quiz.idx + 1;
    if (next >= quiz.qs.length) {
      setQuiz(p => ({ ...p, done: true }));
      if (user) await saveQuizScore(user.uid, { score: quiz.score + (quiz.sel === quiz.qs[quiz.idx].ans ? 1 : 0), total: quiz.qs.length });
    } else {
      setQuiz(p => ({ ...p, idx: next, sel: null }));
    }
  };

  const vColor = { TRUE: '#1A936F', FALSE: '#e63946', 'PARTLY TRUE': '#FF6B35', ILLEGAL: '#8B5CF6', UNVERIFIED: '#667788', ERROR: '#667788' };

  const tabs = [
    { id: 'home', icon: '🏠', label: t.home },
    { id: 'chat', icon: '💬', label: t.chat },
    { id: 'guide', icon: '📋', label: t.guide },
    { id: 'booth', icon: '📍', label: t.booth },
    { id: 'docs', icon: '🪪', label: t.docs },
    { id: 'fake', icon: '🔍', label: t.fake },
    { id: 'quiz', icon: '🎮', label: t.quiz },
  ];

  return (
    <div style={{ fontFamily: "'Noto Sans Devanagari','Noto Sans',sans-serif", minHeight: '100vh', background: '#0b1622', color: '#dde6ef' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;600;700&family=Noto+Sans:wght@400;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        .btn{border:none;border-radius:20px;padding:10px 22px;font-size:13px;font-weight:700;cursor:pointer;transition:all .2s}
        .btn-primary{background:linear-gradient(135deg,#FF6B35,#e85520);color:#fff}
        .btn-primary:hover{transform:translateY(-2px);box-shadow:0 6px 18px rgba(255,107,53,.4)}
        .btn-ghost{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);color:#dde6ef}
        .card{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:16px;padding:18px}
        .inp{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:11px 15px;color:#dde6ef;font-size:14px;outline:none;width:100%;transition:border-color .2s}
        .inp:focus{border-color:#FF6B35}
        .inp::placeholder{color:#445566}
        .tab-btn{background:none;border:none;cursor:pointer;padding:8px 10px;border-radius:14px;font-size:11px;font-weight:700;color:#6688aa;transition:all .2s;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:44px}
        .tab-btn.on{background:linear-gradient(135deg,#FF6B35,#e85520);color:#fff;box-shadow:0 4px 14px rgba(255,107,53,.4)}
        .tab-btn:hover:not(.on){color:#FF6B35}
        .fade{animation:fd .3s ease}@keyframes fd{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .pulse{animation:pl 2s infinite}@keyframes pl{0%,100%{opacity:1}50%{opacity:.5}}
        .qopt{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.13);border-radius:12px;padding:13px 16px;cursor:pointer;font-size:13px;text-align:left;color:#dde6ef;width:100%;transition:all .2s}
        .qopt:hover:not(:disabled){border-color:#FF6B35}
        .qopt.ok{border-color:#1A936F!important;background:rgba(26,147,111,.2)!important;color:#88D498}
        .qopt.no{border-color:#e63946!important;background:rgba(230,57,70,.15)!important;color:#ff8888}
        select.inp option{background:#1a2a3a;color:#dde6ef}
        .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0}
        .focus\\:not-sr-only:focus{position:static;width:auto;height:auto;padding:inherit;margin:inherit;overflow:visible;clip:auto}
      `}</style>

      <SkipLink />

      {/* HEADER */}
      <header style={{ background: 'rgba(0,0,0,.4)', borderBottom: '1px solid rgba(255,107,53,.18)', padding: '12px 16px', position: 'sticky', top: 0, zIndex: 100, backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '26px' }} role="img" aria-label="Voting ballot">🗳️</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '18px', color: '#FF6B35' }}>{t.appName}</div>
          <div style={{ fontSize: '10px', color: '#556677' }}>{t.tagline} • ECI Guidelines</div>
        </div>

        {/* Live count (Firestore) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#1A936F' }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#1A936F' }} className="pulse"></div>
          Live: {liveCount}
        </div>

        {/* Auth */}
        {user ? (
          <button className="btn btn-ghost" style={{ fontSize: '11px', padding: '6px 12px' }} onClick={signOutUser} aria-label="Sign out">
            {user.displayName?.split(' ')[0]} ↩
          </button>
        ) : (
          <button className="btn btn-primary" style={{ fontSize: '11px', padding: '6px 14px' }} onClick={signInWithGoogle} aria-label="Sign in with Google">
            G Sign In
          </button>
        )}

        {/* Language */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {['hi', 'en'].map(l => (
            <button key={l} style={{ background: lang === l ? '#FF6B35' : 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.13)', borderRadius: '8px', padding: '4px 8px', fontSize: '11px', color: lang === l ? '#fff' : '#8899aa', cursor: 'pointer' }}
              onClick={() => { setLang(l); trackLanguageSwitch(lang, l); }}
              aria-label={`Switch to ${l === 'hi' ? 'Hindi' : 'English'}`}>
              {l === 'hi' ? 'हिं' : 'EN'}
            </button>
          ))}
        </div>
      </header>

      {/* TABS */}
      <nav role="navigation" aria-label="App sections" style={{ display: 'flex', overflowX: 'auto', gap: '4px', padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,.06)', scrollbarWidth: 'none' }}>
        {tabs.map(tb => (
          <button key={tb.id} className={`tab-btn ${tab === tb.id ? 'on' : ''}`} onClick={() => setTab(tb.id)} aria-label={`Go to ${tb.label}`} aria-current={tab === tb.id ? 'page' : undefined}>
            <span style={{ fontSize: '18px' }}>{tb.icon}</span>
            <span>{tb.label}</span>
          </button>
        ))}
      </nav>

      {/* MAIN CONTENT */}
      <main id="main-content" role="main" aria-label="Main content" style={{ maxWidth: 700, margin: '0 auto', padding: '18px 14px 90px' }}>

        {/* HOME */}
        {tab === 'home' && (
          <div className="fade">
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: '54px', marginBottom: '10px' }} role="img" aria-label="Indian flag">🇮🇳</div>
              <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#FF6B35', lineHeight: 1.2 }}>
                {lang === 'hi' ? 'आपका वोट,\nआपकी ताकत' : 'Your Vote,\nYour Power'}
              </h1>
              <p style={{ color: '#7a8fa0', marginTop: '8px', fontSize: '13px' }}>
                {lang === 'hi' ? 'चुनाव सीखें, बूथ खोजें, सवाल पूछें' : 'Learn elections, find booth, clear doubts'}
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px', marginBottom: '20px' }}>
              {[
                { icon: '💬', label: t.chat, id: 'chat', color: '#FF6B35' },
                { icon: '📋', label: t.guide, id: 'guide', color: '#1A936F' },
                { icon: '📍', label: t.booth, id: 'booth', color: '#004E89' },
                { icon: '🪪', label: t.docs, id: 'docs', color: '#F7C59F' },
                { icon: '🔍', label: t.fake, id: 'fake', color: '#8B5CF6' },
                { icon: '🎮', label: t.quiz, id: 'quiz', color: '#e85520' },
              ].map(f => (
                <button key={f.id} className="card" style={{ cursor: 'pointer', borderColor: `${f.color}30`, textAlign: 'center', padding: '14px 8px', transition: 'all .2s', background: 'rgba(255,255,255,.05)' }}
                  onClick={() => { setTab(f.id); trackEvent('feature_clicked', { feature: f.id }); }}
                  aria-label={`Open ${f.label} section`}>
                  <div style={{ fontSize: '26px', marginBottom: '5px' }}>{f.icon}</div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: f.color }}>{f.label}</div>
                </button>
              ))}
            </div>

            {/* Helpline */}
            <div className="card" style={{ textAlign: 'center', background: 'linear-gradient(135deg,rgba(26,147,111,.1),rgba(0,78,137,.1))', borderColor: 'rgba(26,147,111,.25)' }}>
              <p style={{ fontSize: '12px', color: '#88D498', marginBottom: '5px' }}>📞 Voter Helpline</p>
              <p style={{ fontSize: '28px', fontWeight: 700, color: '#FF6B35', letterSpacing: '2px' }}>1950</p>
              <p style={{ fontSize: '11px', color: '#556677', marginTop: '4px' }}>ECI 24×7 • cVIGIL App for violations</p>
            </div>

            {/* Google Maps Demo */}
            <div className="card" style={{ marginTop: '14px' }}>
              <p style={{ fontSize: '13px', fontWeight: 700, color: '#FF6B35', marginBottom: '8px' }}>📍 ECI Headquarters, New Delhi</p>
              <VenueMap venue="Election Commission of India, New Delhi" />
            </div>
          </div>
        )}

        {/* CHAT */}
        {tab === 'chat' && (
          <div className="fade" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 200px)' }}>
            <div role="log" aria-live="polite" aria-label="Chat messages" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '10px' }}>
              {msgs.map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: m.r === 'user' ? 'flex-end' : 'flex-start', gap: '8px', alignItems: 'flex-end' }}>
                  {m.r === 'bot' && <span style={{ fontSize: '22px' }} role="img" aria-label="Bot">🤖</span>}
                  <div style={{ maxWidth: '80%', padding: '11px 15px', borderRadius: m.r === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px', fontSize: '13px', lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: m.r === 'user' ? 'linear-gradient(135deg,#FF6B35,#e85520)' : 'rgba(255,255,255,.08)', border: m.r === 'bot' ? '1px solid rgba(255,255,255,.09)' : 'none', color: m.r === 'user' ? '#fff' : '#ccd8e4' }}>
                    {m.t}
                  </div>
                </div>
              ))}
              {busy && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '22px' }}>🤖</span>
                  <div style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.09)', borderRadius: '18px 18px 18px 4px', padding: '12px 16px', display: 'flex', gap: '5px' }}>
                    {[0, 1, 2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#FF6B35', animation: `pl 1s infinite ${i * 0.2}s` }}></div>)}
                  </div>
                </div>
              )}
              <div ref={chatEnd} />
            </div>
            <div style={{ display: 'flex', gap: '8px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,.07)' }}>
              <input
                className="inp" style={{ borderRadius: 22, padding: '11px 18px', flex: 1 }}
                value={inp} onChange={e => setInp(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                placeholder={t.chatPlaceholder}
                aria-label="Type your election question"
                aria-required="true"
              />
              <button className="btn btn-primary" style={{ borderRadius: '50%', width: 44, height: 44, padding: 0, fontSize: 17, flexShrink: 0 }}
                onClick={sendMessage} disabled={busy || !inp.trim()}
                aria-label="Send message">
                ➤
              </button>
            </div>
          </div>
        )}

        {/* GUIDE */}
        {tab === 'guide' && (
          <div className="fade">
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '18px' }}>
              {lang === 'hi' ? 'चुनाव प्रक्रिया — कदम दर कदम' : 'Election Process — Step by Step'}
            </h2>
            {[
              { icon: '📢', en: 'Election Announcement', hi: 'चुनाव घोषणा', enD: 'ECI announces dates. Model Code of Conduct begins.', hiD: 'ECI तारीखें घोषित करती है। आदर्श आचार संहिता लागू।', color: '#FF6B35' },
              { icon: '📝', en: 'Voter Registration', hi: 'मतदाता पंजीकरण', enD: '18+ citizens register at voters.eci.gov.in', hiD: '18+ नागरिक voters.eci.gov.in पर पंजीकरण करें।', color: '#F7C59F' },
              { icon: '🗳️', en: 'Voting Day', hi: 'मतदान दिवस', enD: 'Booths open 7AM-6PM. Carry valid ID.', hiD: 'बूथ 7AM-6PM खुले। वैध ID ले जाएं।', color: '#1A936F' },
              { icon: '📊', en: 'Vote Counting', hi: 'मतगणना', enD: 'Votes counted under ECI supervision.', hiD: 'ECI की निगरानी में मतों की गिनती।', color: '#8B5CF6' },
              { icon: '🏆', en: 'Results', hi: 'परिणाम', enD: 'Winners declared. Government formed.', hiD: 'विजेता घोषित। सरकार बनती है।', color: '#FF6B35' },
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: '14px', marginBottom: '14px' }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: `${s.color}18`, border: `2px solid ${s.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }} role="img" aria-label={s.en}>
                  {s.icon}
                </div>
                <div className="card" style={{ flex: 1, borderLeftColor: s.color, borderLeftWidth: 3 }}>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: s.color }}>{lang === 'hi' ? s.hi : s.en}</div>
                  <p style={{ fontSize: '12px', color: '#aabbc8', marginTop: 5 }}>{lang === 'hi' ? s.hiD : s.enD}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* BOOTH LOCATOR */}
        {tab === 'booth' && (
          <div className="fade">
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>{t.boothTitle}</h2>
            <div className="card" style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <select className="inp" value={boothState} onChange={e => setBSt(e.target.value)} aria-label="Select state" aria-required="true">
                  <option value="">{lang === 'hi' ? 'राज्य चुनें' : 'Select State'}</option>
                  {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <input className="inp" value={boothDist} onChange={e => setBDist(e.target.value)}
                  placeholder={lang === 'hi' ? 'जिला लिखें' : 'Enter District'}
                  aria-label="Enter district" aria-required="true" />
                <button className="btn btn-primary" onClick={findBooth} aria-label="Find polling booth">
                  {lang === 'hi' ? 'बूथ खोजें' : 'Find Booth'}
                </button>
              </div>
            </div>

            {boothRes === 'fill' && (
              <div className="card" style={{ borderColor: 'rgba(230,57,70,.3)', textAlign: 'center', color: '#ff9999', fontSize: '13px' }}>
                ⚠️ {lang === 'hi' ? 'सभी fields भरें' : 'Please fill all fields'}
              </div>
            )}
            {boothRes === 'found' && (
              <div className="fade">
                <div className="card" style={{ borderColor: 'rgba(26,147,111,.3)', marginBottom: '12px' }}>
                  <p style={{ fontWeight: 700, color: '#88D498', marginBottom: '10px' }}>📍 {boothState}, {boothDist}</p>
                  <p style={{ fontSize: '13px', color: '#aabbc8' }}>🏫 Govt Primary School, Ward 5</p>
                  <p style={{ fontSize: '13px', color: '#aabbc8' }}>⏰ 7:00 AM – 6:00 PM</p>
                  <p style={{ fontSize: '13px', color: '#aabbc8' }}>📞 BLO: 1950</p>
                </div>
                <VenueMap venue={`${boothDist}, ${boothState}, India`} />
              </div>
            )}
          </div>
        )}

        {/* DOCUMENTS */}
        {tab === 'docs' && (
          <div className="fade">
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '5px' }}>
              {lang === 'hi' ? 'स्वीकृत दस्तावेज़' : 'Accepted Documents'}
            </h2>
            <p style={{ color: '#7a8fa0', fontSize: '12px', marginBottom: '16px' }}>
              {lang === 'hi' ? 'वोटर ID खो गई? इनमें से कोई एक काफी है!' : 'Voter ID lost? Any ONE of these 12 works!'}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {[
                ['🪪', 'Voter ID (EPIC)', 'मतदाता पहचान पत्र'],
                ['🔵', 'Aadhaar Card', 'आधार कार्ड'],
                ['📘', 'Passport', 'पासपोर्ट'],
                ['🚗', 'Driving License', 'ड्राइविंग लाइसेंस'],
                ['🏦', 'PAN Card', 'पैन कार्ड'],
                ['📸', 'Govt Employee ID', 'सरकारी ID'],
                ['🏠', 'Bank Passbook', 'बैंक पासबुक'],
                ['👷', 'MNREGA Job Card', 'मनरेगा जॉब कार्ड'],
                ['🎓', 'Health Insurance Card', 'स्वास्थ्य कार्ड'],
                ['📜', 'Smart Card SC/ST', 'स्मार्ट कार्ड'],
                ['📱', 'Pension Doc + Photo', 'पेंशन दस्तावेज़'],
                ['🏘️', 'MP/MLA Official ID', 'सांसद/विधायक ID'],
              ].map(([icon, en, hi], i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: '12px', padding: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '22px' }} role="img" aria-label={en}>{icon}</span>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 600 }}>{lang === 'hi' ? hi : en}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* FAKE NEWS */}
        {tab === 'fake' && (
          <div className="fade">
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '5px' }}>{t.fakeTitle}</h2>
            <p style={{ color: '#7a8fa0', fontSize: '12px', marginBottom: '16px' }}>
              {lang === 'hi' ? 'अफवाह सुनी? सच या झूठ जानें!' : 'Heard a rumour? Check if it is true or false!'}
            </p>
            <div className="card" style={{ marginBottom: '14px' }}>
              <textarea className="inp" rows={4} value={fakeInp} onChange={e => setFakeInp(e.target.value)}
                placeholder={lang === 'hi' ? 'अफवाह यहाँ लिखें...' : 'Paste rumour or claim here...'}
                aria-label="Enter claim to fact-check" aria-required="true"
                style={{ resize: 'vertical', marginBottom: '12px' }} />
              <button className="btn btn-primary" onClick={checkFake} disabled={fakeLoad || !fakeInp.trim()}
                aria-label="Check if news is fake" style={{ width: '100%' }}>
                {fakeLoad ? '⏳ Checking...' : `🔍 ${lang === 'hi' ? 'अभी जांचें' : 'Check Now'}`}
              </button>
            </div>
            {fakeRes && (
              <div className="fade card" style={{ borderColor: `${vColor[fakeRes.verdict] || '#667788'}44` }} role="alert" aria-live="polite">
                <div style={{ fontWeight: 700, fontSize: '16px', color: vColor[fakeRes.verdict] || '#888', marginBottom: '10px' }}>
                  {fakeRes.verdict === 'TRUE' ? '✅' : fakeRes.verdict === 'FALSE' ? '❌' : '⚠️'} {fakeRes.verdict}
                </div>
                <p style={{ fontSize: '13px', color: '#aabbc8', lineHeight: 1.7 }}>{fakeRes.explanation}</p>
                <p style={{ fontSize: '11px', color: '#556677', marginTop: '10px' }}>
                  📞 <strong style={{ color: '#FF6B35' }}>1950</strong> • cVIGIL App
                </p>
              </div>
            )}
          </div>
        )}

        {/* QUIZ */}
        {tab === 'quiz' && (
          <div className="fade">
            {!quiz.on && !quiz.done && (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: '60px', marginBottom: '12px' }} role="img" aria-label="Game controller">🎮</div>
                <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>{t.quizTitle}</h2>
                <p style={{ color: '#7a8fa0', fontSize: '13px', marginBottom: '22px' }}>
                  {lang === 'hi' ? '10 सवाल • बैज जीतें!' : '10 questions • Win badges!'}
                </p>
                <button className="btn btn-primary" onClick={startQuiz} style={{ padding: '13px 36px', fontSize: '15px' }} aria-label="Start election knowledge quiz">
                  {t.startQuiz} 🚀
                </button>
              </div>
            )}

            {quiz.on && !quiz.done && quiz.qs.length > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '13px', color: '#7a8fa0' }}>
                  <span>Q {quiz.idx + 1}/{quiz.qs.length}</span>
                  <span style={{ color: '#1A936F', fontWeight: 700 }}>{lang === 'hi' ? 'स्कोर' : 'Score'}: {quiz.score}</span>
                </div>
                <div style={{ height: 4, background: 'rgba(255,255,255,.07)', borderRadius: 2, marginBottom: '18px' }}>
                  <div style={{ height: '100%', width: `${(quiz.idx / quiz.qs.length) * 100}%`, background: 'linear-gradient(90deg,#FF6B35,#1A936F)', borderRadius: 2 }}></div>
                </div>
                <div className="card" style={{ marginBottom: '14px' }}>
                  <p style={{ fontSize: '15px', fontWeight: 600, lineHeight: 1.5 }}>
                    {lang === 'hi' ? quiz.qs[quiz.idx].hi : quiz.qs[quiz.idx].q}
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }} role="group" aria-label="Answer options">
                  {quiz.qs[quiz.idx].opts.map((o, i) => {
                    let cls = 'qopt';
                    if (quiz.sel !== null) {
                      if (i === quiz.qs[quiz.idx].ans) cls += ' ok';
                      else if (i === quiz.sel) cls += ' no';
                    }
                    return (
                      <button key={i} className={cls} onClick={() => selectAnswer(i)} disabled={quiz.sel !== null}
                        aria-label={`Option ${['A', 'B', 'C', 'D'][i]}: ${o}`}>
                        <span style={{ opacity: .5, marginRight: 8 }}>{['A', 'B', 'C', 'D'][i]}.</span>{o}
                      </button>
                    );
                  })}
                </div>
                {quiz.sel !== null && (
                  <div className="fade" style={{ textAlign: 'center', marginTop: '14px' }}>
                    <p style={{ fontSize: '15px', fontWeight: 700, marginBottom: '10px', color: quiz.sel === quiz.qs[quiz.idx].ans ? '#88D498' : '#ff8888' }}>
                      {quiz.sel === quiz.qs[quiz.idx].ans ? '✅ Sahi!' : '❌ Galat!'}
                    </p>
                    <button className="btn btn-primary" onClick={nextQuestion} aria-label="Next question">
                      {quiz.idx + 1 < quiz.qs.length ? (lang === 'hi' ? 'अगला →' : 'Next →') : (lang === 'hi' ? 'परिणाम 🏆' : 'Result 🏆')}
                    </button>
                  </div>
                )}
              </div>
            )}

            {quiz.done && (
              <div className="fade" style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ fontSize: '68px', marginBottom: '10px' }} role="img" aria-label="Trophy">
                  {quiz.score >= 9 ? '🏆' : quiz.score >= 7 ? '🥇' : quiz.score >= 5 ? '🥈' : '📚'}
                </div>
                <h2 style={{ fontSize: '22px', fontWeight: 700 }}>Quiz Complete!</h2>
                <div style={{ fontSize: '52px', fontWeight: 700, color: '#FF6B35', margin: '10px 0' }} aria-label={`Score: ${quiz.score} out of ${quiz.qs.length}`}>
                  {quiz.score}/{quiz.qs.length}
                </div>
                <p style={{ fontSize: '15px', color: quiz.score >= 7 ? '#88D498' : '#FF6B35', marginBottom: '20px' }}>
                  {quiz.score >= 9 ? '🌟 Election Expert!' : quiz.score >= 7 ? '👏 Bahut Accha!' : quiz.score >= 5 ? '📖 Aur Seekho!' : '💪 Practice Karo!'}
                </p>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                  <button className="btn btn-primary" onClick={startQuiz} aria-label="Retry quiz">🔄 {lang === 'hi' ? 'फिर खेलें' : 'Retry'}</button>
                  <button className="btn btn-ghost" onClick={() => setTab('guide')} aria-label="Read election guide">📋 {t.guide}</button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(11,22,34,.96)', borderTop: '1px solid rgba(255,107,53,.12)', padding: '7px 14px', textAlign: 'center', backdropFilter: 'blur(10px)' }}>
        <p style={{ fontSize: '10px', color: '#334455' }}>
          🇮🇳 Chunao Saathi • Powered by Google Cloud + Firebase + Gemini AI • Helpline: <strong style={{ color: '#FF6B35' }}>1950</strong>
        </p>
      </footer>
    </div>
  );
}
