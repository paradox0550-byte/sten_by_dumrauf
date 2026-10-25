import{describe,expect,it}from'vitest';
import{buildAiChatKey}from'./aiChatKey';
const user={id:'user-1',organizationId:'org-1'};
const base={period:'2026-10',restaurantId:'rest-a'};
describe('buildAiChatKey',()=>{
 it('keeps a chat stable for the same user and scope',()=>{expect(buildAiChatKey(user,base)).toBe(buildAiChatKey(user,{...base}))});
 it('isolates chats across restaurants and periods',()=>{expect(buildAiChatKey(user,base)).not.toBe(buildAiChatKey(user,{...base,restaurantId:'rest-b'}));expect(buildAiChatKey(user,base)).not.toBe(buildAiChatKey(user,{...base,period:'2026-09'}))});
 it('isolates chats across users and organizations',()=>{expect(buildAiChatKey(user,base)).not.toBe(buildAiChatKey({...user,id:'user-2'},base));expect(buildAiChatKey(user,base)).not.toBe(buildAiChatKey({...user,organizationId:'org-2'},base))});
 it('does not create a persistent key without an authenticated user id',()=>{expect(buildAiChatKey(null,base)).toBeNull();expect(buildAiChatKey({},base)).toBeNull()});
});
