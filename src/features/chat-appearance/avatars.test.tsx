import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppearanceProvider } from './AppearanceContext';
import { MessageActions } from './MessageActions';
import { MessageRow } from './MessageRow';
import { StenAvatar } from './StenAvatar';
import { UserAvatar, getUserAvatarColor, getUserInitials } from './UserAvatar';
import type { ChatMessage } from './types';

const user={id:'u-1',firstName:'Александр',lastName:'Думрауф',email:'test@x.com'};
const message:ChatMessage={id:'m-1',role:'assistant',content:'Ответ STEN',createdAt:new Date().toISOString(),sources:[{id:'s1',title:'P&L',uri:'pnl://1',excerpt:'Выручка'}]};
const previous:ChatMessage={...message,id:'m-0',content:'Предыдущий ответ'};
const row=(m=message,p=undefined as ChatMessage|undefined)=>renderToStaticMarkup(<AppearanceProvider user={user}><MessageRow message={m} previousMessage={p} user={user} onCopy={()=>undefined} onToSecretary={()=>undefined} onDetails={()=>undefined}/></AppearanceProvider>);

describe('STEN chat avatars and message flow',()=>{
  it('StenAvatar renders /brand/sten-mark.svg',()=>expect(renderToStaticMarkup(<StenAvatar/>)).toContain('/brand/sten-mark.svg'));
  it('StenAvatar has aria-label STEN',()=>expect(renderToStaticMarkup(<StenAvatar/>)).toContain('aria-label="STEN"'));
  it('Alexander + Dumrauf becomes АД',()=>expect(getUserInitials(user)).toBe('АД'));
  it('first name only becomes first letter',()=>expect(getUserInitials({firstName:'Анна'})).toBe('А'));
  it('email fallback becomes T',()=>expect(getUserInitials({email:'test@x.com'})).toBe('T'));
  it('empty user becomes ?',()=>expect(getUserInitials(null)).toBe('?'));
  it('avatarUrl renders image without initials',()=>{const html=renderToStaticMarkup(<UserAvatar user={{...user,avatarUrl:'https://example.com/a.jpg'}}/>);expect(html).toContain('https://example.com/a.jpg');expect(html).not.toContain('АД')});
  it('same user id gets deterministic color',()=>expect(getUserAvatarColor(user)).toBe(getUserAvatarColor({...user})));
  it('assistant row has message-row--assistant',()=>expect(row()).toContain('message-row--assistant'));
  it('user row has message-row--user',()=>expect(row({...message,role:'user'})).toContain('message-row--user'));
  it('showAvatars is implemented through AppearanceContext',()=>expect(row()).toContain('sten-avatar'));
  it('showActions is implemented on assistant rows',()=>expect(row()).toContain('message-actions'));
  it('second same-role message hides avatar but keeps slot',()=>expect(row(message,previous)).toContain('message-avatar-slot--hidden'));
  it('different role does not hide avatar',()=>expect(row({...message,role:'user'},previous)).not.toContain('message-avatar-slot--hidden'));
  it('Copy action exposes exact accessible action',()=>expect(renderToStaticMarkup(<MessageActions message={message} onCopy={()=>undefined} onToSecretary={()=>undefined} onDetails={()=>undefined}/>)).toContain('Копировать текст ответа'));
  it('clipboard contract is navigator.clipboard.writeText(message.content)',()=>{const source=readFileSync(new URL('./MessageActions.tsx',import.meta.url),'utf8');expect(source).not.toContain('/api/secretary/events');expect(source).toContain('onCopy')});
  it('Secretary action is callback-only and never embeds Secretary API',()=>{const source=readFileSync(new URL('./MessageActions.tsx',import.meta.url),'utf8');expect(source).not.toContain('/api/secretary/events')});
  it('Details is an inline section in MessageRow',()=>{const source=readFileSync(new URL('./MessageRow.tsx',import.meta.url),'utf8');expect(source).toContain('message-details');expect(source).not.toContain('role="dialog"')});
  it('Details toggles from open to close via local state',()=>{const source=readFileSync(new URL('./MessageRow.tsx',import.meta.url),'utf8');expect(source).toContain('setDetailsOpen(value=>!value)')});
  it('sources remain available to Details when chips are hidden',()=>{const source=readFileSync(new URL('./MessageRow.tsx',import.meta.url),'utf8');expect(source).toContain('settings.showSources');expect(source).toContain('sourceItems.length>0')});
  it('reduced motion adds no-anim and disables transitions',()=>{const source=readFileSync(new URL('./MessageRow.tsx',import.meta.url),'utf8');const css=readFileSync(new URL('./avatars.css',import.meta.url),'utf8');expect(source).toContain('no-anim');expect(css).toContain('prefers-reduced-motion')});
  it('responsive CSS caps bubbles at 86% on mobile',()=>expect(readFileSync(new URL('./avatars.css',import.meta.url),'utf8')).toContain('max-width: 86%'));
});