import { useEffect, useRef, useState } from 'react';
import { ClipboardList, Mic, MicOff, Send, Trash2 } from 'lucide-react';
import './MeetingNotesPanel.css';

type RecognitionResult = { isFinal: boolean; 0?: { transcript?: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type RecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

const Recognition = typeof window !== 'undefined'
  ? ((window as Window & {
      SpeechRecognition?: new () => RecognitionLike;
      webkitSpeechRecognition?: new () => RecognitionLike;
    }).SpeechRecognition
    || (window as Window & {
      webkitSpeechRecognition?: new () => RecognitionLike;
    }).webkitSpeechRecognition)
  : undefined;

type Props = {
  storageKey: string;
  onSummarize: (transcript: string) => void;
  disabled?: boolean;
};

/** Browser speech-to-text notes, persisted locally per user and active workspace. */
export default function MeetingNotesPanel({ storageKey, onSummarize, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const recognition = useRef<RecognitionLike | null>(null);
  const finalText = useRef('');

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey) || '';
      finalText.current = saved;
      setTranscript(saved);
    } catch {
      finalText.current = '';
      setTranscript('');
    }
    setLoadedKey(storageKey);
    setInterim('');
    setError('');
    setListening(false);
    try { recognition.current?.abort(); } catch { /* recognition may already be stopped */ }
    recognition.current = null;
  }, [storageKey]);

  useEffect(() => {
    if (loadedKey !== storageKey) return;
    try { window.localStorage.setItem(storageKey, transcript); } catch {
      setError('Не удалось сохранить заметку в браузере. Скопируйте текст, чтобы не потерять его.');
    }
  }, [storageKey, transcript, loadedKey]);

  useEffect(() => () => {
    try { recognition.current?.abort(); } catch { /* browser may already have stopped */ }
  }, []);

  function start() {
    if (disabled || listening) return;
    if (!Recognition) {
      setError('Распознавание речи недоступно в этом браузере. Можно вставить или набрать текст вручную.');
      return;
    }
    setError('');
    finalText.current = transcript;
    try {
      const instance = new Recognition();
      instance.lang = 'ru-RU';
      instance.continuous = true;
      instance.interimResults = true;
      instance.onresult = (event) => {
        let partial = '';
        let final = finalText.current;
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          const phrase = result?.[0]?.transcript?.trim();
          if (!phrase) continue;
          if (result.isFinal) final = [final, phrase].filter(Boolean).join(' ');
          else partial = [partial, phrase].filter(Boolean).join(' ');
        }
        finalText.current = final;
        setTranscript(final);
        setInterim(partial);
      };
      instance.onerror = (event) => {
        setListening(false);
        setInterim('');
        setError(event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'Нет доступа к микрофону. Разрешите его в настройках браузера.'
          : 'Распознавание остановилось. Проверьте доступ к микрофону и попробуйте ещё раз.');
      };
      instance.onend = () => {
        setListening(false);
        setInterim('');
      };
      recognition.current = instance;
      instance.start();
      setListening(true);
    } catch {
      setListening(false);
      setError('Не удалось запустить микрофон. Попробуйте ещё раз.');
    }
  }

  function stop() {
    try { recognition.current?.stop(); } catch { /* already stopped */ }
    setListening(false);
    setInterim('');
  }

  function clear() {
    setTranscript('');
    finalText.current = '';
    setInterim('');
    setError('');
  }

  return (
    <section className="sten-meeting-notes" aria-label="Заметки встречи">
      <button type="button" className="sten-meeting-notes__toggle" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        <ClipboardList size={16} />
        <span>Заметки встречи</span>
        {transcript.trim() && <span className="sten-meeting-notes__count">{transcript.trim().split(/\s+/).length} слов</span>}
        <span className="sten-meeting-notes__chevron">{open ? 'Скрыть' : 'Открыть'}</span>
      </button>
      {open && <div className="sten-meeting-notes__panel">
        <p className="sten-meeting-notes__privacy">
          Надиктуйте или вставьте текст встречи. Заметки сохраняются в этом браузере отдельно для пользователя и выбранного рабочего контура. Распознавание может обрабатываться речевым сервисом браузера; STEN не записывает системный звук или собеседников.
        </p>
        <textarea
          aria-label="Текст заметок встречи"
          value={transcript}
          onChange={event => { setTranscript(event.target.value); finalText.current = event.target.value; }}
          placeholder="Например: договорились пересмотреть food cost, ответственный — управляющий, срок — пятница…"
          rows={4}
          disabled={disabled || listening}
        />
        {interim && <p className="sten-meeting-notes__interim" aria-live="polite">Распознано: {interim}</p>}
        {error && <p className="sten-meeting-notes__error" role="status">{error}</p>}
        <div className="sten-meeting-notes__actions">
          {listening
            ? <button type="button" onClick={stop}><MicOff size={15} /> Остановить диктовку</button>
            : <button type="button" onClick={start} disabled={disabled}><Mic size={15} /> Надиктовать</button>}
          <button type="button" onClick={clear} disabled={!transcript && !interim}><Trash2 size={15} /> Очистить</button>
          <button
            type="button"
            className="sten-meeting-notes__primary"
            onClick={() => onSummarize(transcript.trim())}
            disabled={disabled || !transcript.trim() || listening}
          ><Send size={15} /> Разобрать в STEN AI</button>
        </div>
      </div>}
    </section>
  );
}
