const CACHE='sten-shell-v5';
const CORE=['./','./index.html','./manifest.json','./favicon.svg'];
const API_PREFIXES=['/api/','/ask','/fot-analytics','/reports','/auth/','/ai/'];
const STATIC_PREFIXES=['/assets/','/icons/'];
const STATIC_FILES=['/favicon.svg','/manifest.json','/icon-192.svg','/icon-512.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==location.origin)return;
  if(API_PREFIXES.some(p=>url.pathname.startsWith(p)))return;
  if(req.headers.get('authorization'))return;
  const isStatic=STATIC_PREFIXES.some(p=>url.pathname.startsWith(p))||STATIC_FILES.includes(url.pathname);
  if(!isStatic)return;
  e.respondWith(fetch(req).then(r=>{
    const contentType=r.headers.get('content-type')||'';
    if(r.ok&&!contentType.toLowerCase().includes('application/json'))caches.open(CACHE).then(c=>c.put(req,r.clone()));
    return r;
  }).catch(()=>caches.match(req)));
});