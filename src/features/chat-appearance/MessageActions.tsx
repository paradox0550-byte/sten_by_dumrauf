import { BarChart3, CalendarPlus, Clipboard, Brain } from 'lucide-react';
import type { MessageActionsProps } from './types';

export function MessageActions({ onCopy, onToSecretary, onAnalyzePnl, onSaveMemory, showSaveMemory }: MessageActionsProps) {
  return (
    <div className="message-actions" aria-label="Действия с сообщением">
      <button type="button" onClick={onCopy} aria-label="Копировать текст ответа" title="Копировать">
        <Clipboard size={14} aria-hidden="true" /><span>Копировать</span>
      </button>
      <button type="button" onClick={onToSecretary} aria-label="Создать событие в Секретаре" title="В Секретарь">
        <CalendarPlus size={14} aria-hidden="true" /><span>В Секретарь</span>
      </button>
      <button type="button" onClick={() => onAnalyzePnl?.()} aria-label="Разобрать P&L" title="Разобрать P&L">
        <BarChart3 size={14} aria-hidden="true" /><span>Разобрать P&amp;L</span>
      </button>
      {showSaveMemory && onSaveMemory && <button type="button" onClick={onSaveMemory} aria-label="Сохранить предложение в память" title="Сохранить в память">
        <Brain size={14} aria-hidden="true" /><span>В память</span>
      </button>}
    </div>
  );
}
