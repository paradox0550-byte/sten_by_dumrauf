import { CalendarPlus, Clipboard, MoreHorizontal } from 'lucide-react';
import type { MessageActionsProps } from './types';

export function MessageActions({ message, onCopy, onToSecretary, onDetails }: MessageActionsProps) {
  return (
    <div className="message-actions" aria-label="Действия с сообщением">
      <button type="button" onClick={onCopy} aria-label="Копировать текст ответа" title="Копировать">
        <Clipboard size={14} aria-hidden="true" />
        <span>Копировать</span>
      </button>
      <button type="button" onClick={onToSecretary} aria-label="Сохранить в Секретаря" title="В Секретарь">
        <CalendarPlus size={14} aria-hidden="true" />
        <span>В Секретарь</span>
      </button>
      <button type="button" onClick={onDetails} aria-label="Подробнее" title="Подробнее">
        <MoreHorizontal size={14} aria-hidden="true" />
        <span>Подробнее</span>
      </button>
    </div>
  );
}
