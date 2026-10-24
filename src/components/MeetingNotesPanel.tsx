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
  ? ((window as Window & { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike }).SpeechRecognition
    || (window as Window & { webkitSpeechRecognition?: new () => RecognitionLike }).webkitSpeechRecognition)
  : undefined;

/**
 * Browser-based meeting notes. Speech recognition is provided by the browser;
 * this component does not record or upload audio.
 */
export default function MeetingNotesPanel({ onSummarize, disabled = false }: {
  onSummarize: (transcript: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const recognition = useRef<RecognitionLike | null>(null);
  const finalText = useRef('');

  useEffect(() => () => {
    try { recognition.current?.abort(); } catch { /* browser may already have stopped */ }
  }, []);

  function start() {
    if (!Recognition) {
      setError('Распознавание речи недоступно в этом браузере. Можно вставить готовую расшифровку вручную.');
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
        setError(event.error === 'not-allowed'
          ? 'Нет доступа к микрофону. Разрешите его в настройках браузера.'
          : 'Распознавание остановилось. Проверьте доступ к микрофону и попробуйте ещё раз.');
        setListening(false);
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

  return (
    <section className="sten-meeting-notes" aria-label="Заметки встречи">
      <button type="button" className="sten-meeting-notes__toggle" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        <ClipboardList size={16} />
        <span>Заметки встречи</span>
        <span className="sten-meeting-notes__hint">Расшифровка и задачи</span>
      </button>
      {open && <div className="sten-meeting-notes__body">
        <p className="sten-meeting-notes__privacy">Речь распознаёт браузер. STEN не записывает аудио — текст остаётся у вас, пока вы не отправите его на разбор.</p>
        <textarea
          aria-label="Текст встречи"
          value={transcript}
          onChange={event => { setTranscript(event.target.value); finalText.current = event.target.value; }}
          placeholder="Нажмите «Начать расшифровку» или вставьте сюда текст встречи…"
          rows={5}
          disabled={disabled}
        />
        {interim && <p className="sten-meeting-notes__interim">Сейчас распознано: {interim}</p>}
        {error && <p className="sten-meeting-notes__error" role="status">{error}</p>}
        <div className="sten-meeting-notes__actions">
          {listening
            ? <button type="button" onClick={stop}><MicOff size={15} /> Остановить</button>
            : <button type="button" onClick={start} disabled={disabled}><Mic size={15} /> Начать расшифровку</button>}
          <button type="button" onClick={() => { setTranscript(''); setInterim(''); setError(''); finalText.current = ''; }} disabled={!transcript && !interim}><Trash2 size={15} /> Очистить</button>
          <button type="button" className="sten-meeting-notes__primary" onClick={() => onSummarize(transcript.trim())} disabled={disabled || !transcript.trim() || listening}><Send size={15} /> Разобрать встречу</button>
        </div>
      </div>}
    </section>
  );
}
