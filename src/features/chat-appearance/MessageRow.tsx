import { useEffect, useMemo, useState } from 'react';
import { useAppearanceContext } from './AppearanceContext';
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
  onDetails: () => void;
};

function formatTime(value: string): string {
  const date=new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now=new Date();
  const today=now.getFullYear()===date.getFullYear() && now.getMonth()===date.getMonth() && now.getDate()===date.getDate();
  if (today) return date.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
  return date.toLocaleDateString('ru-RU',{day:'2-digit',month:'short'}).replace(/\./g,'')+' '+date.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
}

function formatFull(value: string): string {
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'':date.toLocaleString('ru-RU',{dateStyle:'medium',timeStyle:'short'});
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

export function MessageRow({ message, previousMessage, user, onCopy, onToSecretary, onDetails }: MessageRowProps) {
  const { settings }=useAppearanceContext();
  const [detailsOpen,setDetailsOpen]=useState(false);
  const reducedMotion=useReducedMotion();
  const grouped=previousMessage?.role===message.role;
  const isAssistant=message.role==='assistant';
  const accessibleLabel=isAssistant?'Сообщение STEN':'Ваше сообщение';
  const fullDate=useMemo(()=>formatFull(message.createdAt),[message.createdAt]);
  const sourceItems=message.sources??[];

  const toggleDetails=()=>{
    setDetailsOpen(value=>!value);
    onDetails();
  };

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
        <div className="message-bubble">{message.content}</div>
        {settings.showSources && sourceItems.length>0 && (
          <div className="message-sources" aria-label="Источники">
            {sourceItems.map((source,index)=><span className="message-source-chip" key={source.id??source.uri??`source-${index}`}>{source.title??source.kind??source.uri??'Источник'}</span>)}
          </div>
        )}
        {isAssistant && settings.showActions && (
          <MessageActions message={message} onCopy={onCopy} onToSecretary={onToSecretary} onDetails={toggleDetails}/>
        )}
        {detailsOpen && (
          <section className="message-details" aria-label="Подробности сообщения">
            {sourceItems.length>0 && <div className="message-details-section">
              <strong>Источники</strong>
              <div className="message-details-sources">
                {sourceItems.map((source,index)=>(
                  <div className="message-details-source" key={source.id??source.uri??`detail-source-${index}`}>
                    {source.title&&<b>{source.title}</b>}
                    {source.kind&&<small>{source.kind}</small>}
                    {source.uri&&<code>{source.uri}</code>}
                    {source.excerpt&&<p>{source.excerpt}</p>}
                  </div>
                ))}
              </div>
            </div>}
            {fullDate&&<div className="message-details-meta"><span>Время</span><time dateTime={message.createdAt}>{fullDate}</time></div>}
            {message.model&&<div className="message-details-meta"><span>Модель</span><span>{message.model}</span></div>}
            {message.formulaVersion&&<div className="message-details-meta"><span>Версия формул</span><span>{message.formulaVersion}</span></div>}
          </section>
        )}
      </div>
    </article>
  );
}
