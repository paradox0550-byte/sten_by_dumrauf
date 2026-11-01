import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Mic, MicOff, PhoneOff, Volume2, VolumeX } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { useScope } from '../lib/useScope';
import { AskRequestSchema, type AskResponse } from '../lib/contracts/ask';
import '../styles/sten-drive.css';

type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';
type SpeechRecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type SpeechRecognitionEvent = { resultIndex: number; results: ArrayLike<SpeechRecognitionResult> };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition || null;
}

function cleanSpeech(text: string) {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\x60\x60\x60[\s\S]*?\x60\x60\x60/g, ' Код опущен. ')
    .replace(/[*_#>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function STENDrive() {
  const { user } = useAuth();
  const [scope] = useScope();
  const navigate = useNavigate();
  const [state, setState] = useState<VoiceState>('idle');
  const [sessionActive, setSessionActive] = useState(false);
  const [muted, setMuted] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [answer, setAnswer] = useState('Я на связи. Нажми «Начать разговор», чтобы поговорить со мной.');
  const [error, setError] = useState('');
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const activeRef = useRef(false);
  const busyRef = useRef(false);
  const speakingRef = useRef(false);
  const mutedRef = useRef(false);
  const answerRef = useRef('');
  const scopeRef = useRef(scope);
  const askRef = useRef<(question: string) => Promise<void>>(async () => {});

  useEffect(() => { scopeRef.current = scope; }, [scope]);
  useEffect(() => {
    document.body.classList.add('sten-drive-active');
    return () => document.body.classList.remove('sten-drive-active');
  }, []);
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => {
    const available = Boolean(getRecognitionConstructor()) && 'speechSynthesis' in window;
    setSupported(available);
    return () => {
      activeRef.current = false;
      try { recognitionRef.current?.abort(); } catch { /* already stopped */ }
      window.speechSynthesis?.cancel();
    };
  }, []);

  const stopListening = useCallback(() => {
    try { recognitionRef.current?.abort(); } catch { /* already stopped */ }
    recognitionRef.current = null;
  }, []);

  const listen = useCallback(() => {
    if (!activeRef.current || busyRef.current || speakingRef.current) return;
    const Recognition = getRecognitionConstructor();
    if (!Recognition) {
      setSupported(false);
      setError('В этом браузере нет совместимого голосового распознавания. Можно пользоваться STEN через обычный чат.');
      setState('idle');
      return;
    }
    stopListening();
    const recognition = new Recognition();
    recognition.lang = 'ru-RU';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onstart = () => { setError(''); setState('listening'); };
    recognition.onresult = (event) => {
      let interim = '';
      let finalText = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) finalText += result[0].transcript;
        else interim += result[0].transcript;
      }
      const value = (finalText || interim).replace(/\s+/g, ' ').trim();
      if (value) setTranscript(value);
      if (finalText.trim()) {
        stopListening();
        void askRef.current(finalText.trim());
      }
    };
    recognition.onerror = (event) => {
      if (!activeRef.current) return;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setError('Нет доступа к микрофону. Разреши его для сайта в настройках Safari.');
        activeRef.current = false;
        setSessionActive(false);
        setState('idle');
      } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
        setError('Не удалось распознать речь. Проверь подключение микрофона и попробуй ещё раз.');
      }
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      if (activeRef.current && !busyRef.current && !speakingRef.current) {
        window.setTimeout(() => listen(), 300);
      }
    };
    recognitionRef.current = recognition;
    try { recognition.start(); }
    catch {
      setState('idle');
      setError('Браузер не запустил микрофон. Нажми «Продолжить слушать».');
    }
  }, [stopListening]);

  const speak = useCallback((text: string) => {
    if (mutedRef.current || !activeRef.current || !('speechSynthesis' in window)) {
      speakingRef.current = false;
      setState(activeRef.current ? 'listening' : 'idle');
      if (activeRef.current) window.setTimeout(() => listen(), 250);
      return;
    }
    const spoken = cleanSpeech(text);
    if (!spoken) { listen(); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(spoken.slice(0, 8000));
    utterance.lang = 'ru-RU';
    utterance.rate = 0.98;
    const voices = window.speechSynthesis.getVoices().filter((voice) => /^ru([-_]|$)/i.test(voice.lang));
    const preferred = voices.find((voice) => /(male|man|муж|александр|алексей|юрий|иван|дмитри|максим|павел|андрей|сергей|николай|михаил)/i.test(voice.name));
    if (preferred) utterance.voice = preferred;
    utterance.onstart = () => { speakingRef.current = true; setState('speaking'); };
    utterance.onend = () => {
      speakingRef.current = false;
      if (activeRef.current) window.setTimeout(() => listen(), 250);
      else setState('idle');
    };
    utterance.onerror = () => {
      speakingRef.current = false;
      if (activeRef.current) window.setTimeout(() => listen(), 350);
      else setState('idle');
    };
    answerRef.current = text;
    window.speechSynthesis.speak(utterance);
  }, [listen]);

  const ask = useCallback(async (question: string) => {
    if (busyRef.current || !question.trim()) return;
    busyRef.current = true;
    setTranscript(question);
    setState('thinking');
    setError('');
    stopListening();
    try {
      const currentScope = scopeRef.current;
      const body = AskRequestSchema.parse({
        question,
        messages: [
          { role: 'system', content: [
            'Ты STEN — голосовой собеседник пользователя за рулём. Отвечай на русском, естественно и коротко, чтобы ответ было удобно слушать в автомобиле.',
            'Можно свободно обсуждать любые темы. Для вопросов о бизнесе используй только подтверждённые данные STEN и передавай источник/период, если они доступны.',
            'Не выдумывай показатели. Отсутствие данных не равно нулю. Не переключай ресторан, филиал, проект или организацию самостоятельно.',
            'Не утверждай, что выполнил действие, если нет подтверждения результата. Не проси водителя читать длинные инструкции или взаимодействовать со сложными элементами экрана.'
          ].join(' ') },
          { role: 'user', content: question }
        ],
        scope: {
          period: currentScope.period,
          project_id: currentScope.projectId ?? null,
          branch_id: currentScope.branchId ?? null,
          restaurant_id: currentScope.restaurantId ?? null,
          department_id: currentScope.departmentId ?? null,
        },
      });
      const response = await api.post<AskResponse>('/ask', body);
      const text = String(response.answer ?? response.message ?? 'Ответ не получен.');
      setAnswer(text);
      if (activeRef.current) speak(text);
      else setState('idle');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Не удалось получить ответ STEN.';
      setError(message);
      setAnswer('Не удалось получить ответ. Проверь соединение и попробуй ещё раз.');
      setState('idle');
      if (activeRef.current) window.setTimeout(() => listen(), 400);
    } finally {
      busyRef.current = false;
    }
  }, [listen, speak, stopListening]);

  useEffect(() => { askRef.current = ask; }, [ask]);

  const startSession = () => {
    if (!supported) {
      setError('Голосовой ввод недоступен в этом браузере. Открой STEN в Safari или используй обычный чат.');
      return;
    }
    setError('');
    activeRef.current = true;
    setSessionActive(true);
    setTranscript('');
    listen();
  };

  const endSession = () => {
    activeRef.current = false;
    setSessionActive(false);
    busyRef.current = false;
    speakingRef.current = false;
    stopListening();
    window.speechSynthesis?.cancel();
    setState('idle');
    setTranscript('');
  };

  const interrupt = () => {
    window.speechSynthesis?.cancel();
    speakingRef.current = false;
    setAnswer('Слушаю. Говори.');
    if (activeRef.current) {
      stopListening();
      window.setTimeout(() => listen(), 100);
    } else {
      setState('idle');
    }
  };

  const stateLabel: Record<VoiceState, string> = {
    idle: 'Готов к разговору',
    listening: 'Слушаю тебя',
    thinking: 'Обдумываю ответ',
    speaking: 'Говорю',
  };

  return (
    <main className="sten-drive-page">
      <header className="sten-drive-header">
        <button className="sten-drive-back" type="button" onClick={() => navigate('/sten')} aria-label="Вернуться в STEN">
          <ArrowLeft size={20} />
        </button>
        <div className="sten-drive-brand"><span className="sten-drive-mark">S</span><div><strong>STEN Drive</strong><small>Голосовой режим</small></div></div>
        <button className="sten-drive-mute" type="button" onClick={() => setMuted((value) => !value)} aria-label={muted ? 'Включить голос' : 'Выключить голос'}>
          {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </button>
      </header>

      <section className="sten-drive-content" aria-live="polite">
        <div className={`sten-drive-orb is-${state}`} aria-hidden="true"><span /></div>
        <p className="sten-drive-state">{stateLabel[state]}</p>
        <p className="sten-drive-hint">{sessionActive ? 'Разговор продолжается. Говори обычным голосом.' : 'Запусти разговор перед поездкой. STEN будет отвечать голосом.'}</p>
        <div className="sten-drive-conversation">
          {transcript && <div className="sten-drive-user"><small>ТЫ</small><p>{transcript}</p></div>}
          {answer && <div className="sten-drive-assistant"><small>STEN</small><p>{answer}</p></div>}
        </div>
        {error && <p className="sten-drive-error" role="status">{error}</p>}
      </section>

      <footer className="sten-drive-controls">
        {!sessionActive ? (
          <button className="sten-drive-primary" type="button" onClick={startSession}><Mic size={22} /> Начать разговор</button>
        ) : (
          <>
            <button className="sten-drive-primary" type="button" onClick={() => { stopListening(); listen(); }} disabled={state === 'listening'}><Mic size={22} /> Продолжить слушать</button>
            <button className="sten-drive-secondary" type="button" onClick={interrupt}><MicOff size={20} /> Перебить</button>
            <button className="sten-drive-end" type="button" onClick={endSession}><PhoneOff size={20} /> Завершить</button>
          </>
        )}
        <small>Экран для использования до начала движения. В дороге управляй голосом и не отвлекайся на дисплей.</small>
      </footer>
    </main>
  );
}
