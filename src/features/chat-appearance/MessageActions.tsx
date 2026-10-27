import { BarChart3, CalendarPlus, Clipboard, Brain, Volume2 } from 'lucide-react';
import type { MessageActionsProps } from './types';

export function MessageActions({ onCopy, onToSecretary, onAnalyzePnl, onSaveMemory, onSpeak, showSaveMemory }: MessageActionsProps) {
  return (
    <div className="message-actions" aria-label="Действия с сообщением">
      {onSpeak && <button type="button" onClick={onSpeak} aria-label="Прослушать ответ STEN" title="Прослушать ответ">
        <Volume2 size={16} aria-hidden="true" />
      </button>}
      <button type="button" onClick={onCopy} aria-label="Копировать текст ответа" title="Копировать">
        <Clipboard size={16} aria-hidden="true" />
      </button>
      <button type="button" onClick={onToSecretary} aria-label="Создать событие в Секретаре" title="В Секретарь">
        <CalendarPlus size={16} aria-hidden="true" />
      </button>
      <button type="button" onClick={() => onAnalyzePnl?.()} aria-label="Разобрать P&L" title="Разобрать P&L">
        <BarChart3 size={16} aria-hidden="true" />
      </button>
      {showSaveMemory && onSaveMemory && <button type="button" onClick={onSaveMemory} aria-label="Сохранить предложение в память" title="Сохранить в память">
        <Brain size={16} aria-hidden="true" />
      </button>}
    </div>
  );
}
