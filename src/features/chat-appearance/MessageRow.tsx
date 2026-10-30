import { useEffect, useState, type ReactNode } from 'react';
import { useAppearanceContext } from './AppearanceContext';
import MarkdownMessage from './MarkdownMessage';
import { MessageActions } from './MessageActions';
import { StenAvatar } from './StenAvatar';
import { UserAvatar } from './UserAvatar';
import type { ChatMessage, UserAvatarProps } from './types';

export type MessageRowProps = {
  message: ChatMessage;
  previousMessage?: ChatMessage;
  user: UserAvatarProps['user'];
  onCopy: () => void;
  onToSecretary: () => void;
  onAnalyzePnl?: () => void;
  onSaveMemory?: () => void;
  onSpeak?: () => void;
  showSaveMemory?: boolean;
  onDetails?: () => void;
  children?: ReactNode;
};

function formatTime(value: string): string {
  const date=new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now=new Date();
  const today=now.getFullYear()===date.getFullYear() && now.getMonth()===date.getMonth() && now.getDate()===date.getDate();
  if (today) return date.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
  return date.toLocaleDateString('ru-RU',{day:'2-digit',month:'short'}).replace(/\./g,'')+' '+date.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
}

function useReducedMotion(): boolean {
  const [reduced,setReduced]=useState(false);
  useEffect(()=>{
    if (typeof window==='undefined' || !window.matchMedia) return;
    const media=window.matchMedia('(prefers-reduced-motion: reduce)');
    const update=()=>setReduced(media.matches);
    update();
    media.addEventListener?.('change',update);
    return()=>media.removeEventListener?.('change',update);
  },[]);
  return reduced;
}

export function MessageRow({ message, previousMessage, user, onCopy, onToSecretary, onAnalyzePnl, onSaveMemory, onSpeak, showSaveMemory, children }: MessageRowProps) {
  const { settings }=useAppearanceContext();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const reducedMotion=useReducedMotion();
  const grouped=previousMessage?.role===message.role;
  const isAssistant=message.role==='assistant';
  const accessibleLabel=isAssistant?'Сообщение STEN':'Ваше сообщение';
  const sourceItems=message.sources??[];

  return (
    <article
      className={`message-row message-row--${message.role}${grouped?' message-row--grouped':''}${reducedMotion?' no-anim':''}`}
      aria-label={accessibleLabel}
    >
      <div className={`message-avatar-slot${grouped?' message-avatar-slot--hidden':''}`} aria-hidden={grouped || !settings.showAvatars}>
        {settings.showAvatars && (isAssistant?<StenAvatar/>:<UserAvatar user={user}/>)}
      </div>
      <div className="message-content">
        {settings.showTime && message.createdAt && <time className="message-time" dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>}
        {children}
        <div className="message-bubble">{message.role === 'assistant' ? <MarkdownMessage content={message.content} /> : message.content}</div>
        {settings.showSources && sourceItems.length>0 && (
          <>
            <div className="message-sources" aria-label="Источники">
              {sourceItems.map((source,index)=><span className="message-source-chip" key={source.id??source.uri??`source-${index}`}>{source.title??source.kind??source.uri??'Источник'}</span>)}
            </div>
            <button type="button" className="message-details-toggle" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(value=>!value)}>
              {detailsOpen ? 'Скрыть детали' : 'Показать детали'}
            </button>
            {detailsOpen && (
              <section className="message-details" aria-label="Детали ответа">
                {sourceItems.map((source,index)=>(
                  <div className="message-details__source" key={source.id??source.uri??`detail-${index}`}>
                    <strong>{source.title??source.kind??'Источник'}</strong>
                    {source.uri && <span>{source.uri}</span>}
                    {source.excerpt && <p>{source.excerpt}</p>}
                  </div>
                ))}
              </section>
            )}
          </>
        )}
        {isAssistant && settings.showActions && (
          <MessageActions onCopy={onCopy} onToSecretary={onToSecretary} onAnalyzePnl={onAnalyzePnl} onSaveMemory={onSaveMemory} onSpeak={onSpeak} showSaveMemory={showSaveMemory}/>
        )}

      </div>
    </article>
  );
}
