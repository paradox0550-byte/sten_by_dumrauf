const CACHE='sten-shell-v7';
const CORE=['./','./index.html','./manifest.json','./favicon.svg','./icon-192.svg','./icon-512.svg'];
const API_PREFIXES=['/api/','/ask','/fot-analytics','/reports','/auth/','/ai/'];
const STATIC_PREFIXES=['/assets/','/icons/'];
const STATIC_FILES=['/favicon.svg','/manifest.json','/icon-192.svg','/icon-512.svg'];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE)
      .then(cache=>cache.addAll(CORE))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(
        keys.filter(key=>key.startsWith('sten-shell-')&&key!==CACHE).map(key=>caches.delete(key))
      ))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==location.origin||request.headers.get('authorization'))return;
  if(API_PREFIXES.some(prefix=>url.pathname.startsWith(prefix)))return;

  const isNavigation=request.mode==='navigate'||url.pathname==='/'||url.pathname.endsWith('/index.html');
  if(isNavigation){
    event.respondWith(
      fetch(request).then(response=>{
        if(response.ok)event.waitUntil(caches.open(CACHE).then(cache=>cache.put('./index.html',response.clone())));
        return response;
      }).catch(()=>caches.match('./index.html').then(cached=>cached||caches.match('./')))
    );
    return;
  }

  const isStatic=STATIC_PREFIXES.some(prefix=>url.pathname.startsWith(prefix))||STATIC_FILES.includes(url.pathname);
  if(!isStatic)return;
  event.respondWith(
    fetch(request).then(response=>{
      const contentType=response.headers.get('content-type')||'';
      if(response.ok&&!contentType.toLowerCase().includes('application/json')){
        event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,response.clone())));
      }
      return response;
    }).catch(()=>caches.match(request))
  );
});