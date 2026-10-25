import{scopeKey,type Scope}from'./scope';
type ChatUser={id?:string;organizationId?:string|null}|null;
export function buildAiChatKey(user:ChatUser,scope:Scope):string|null{
 if(!user?.id)return null;
 return `sten_chat_v5:${user.organizationId||'no-org'}:${user.id}:scope=${scopeKey(scope)}`;
}
