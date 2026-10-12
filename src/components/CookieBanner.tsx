import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';

const KEY='sten_cookie_consent_v2';
const VERSION='3';
const MONTHS=12;
type Consent={accepted:boolean;at:string;policyVersion:string};
function valid(v:string|null){
 if(!v)return false;
 try{
  const x=JSON.parse(v) as Consent;
  const at=Date.parse(x.at);
  return x.policyVersion===VERSION&&x.accepted&&Number.isFinite(at)&&Date.now()-at<MONTHS*31*24*60*60*1000;
 }catch{return false}
}
export default function CookieBanner(){
 const [visible,setVisible]=useState(false);
 useEffect(()=>{try{if(!valid(localStorage.getItem(KEY)))setVisible(true)}catch{setVisible(false)}},[]);
 if(!visible)return null;
 const acknowledge=()=>{try{localStorage.setItem(KEY,JSON.stringify({accepted:true,at:new Date().toISOString(),policyVersion:VERSION}));}catch{}setVisible(false)};
 return <aside className="cookie-banner" role="dialog" aria-label="Уведомление о локальном хранении данных">
  <p>STEN сохраняет в локальном хранилище браузера отметку о выборе в этом уведомлении. Это не файл cookie. Рекламные и аналитические cookie в этом компоненте не используются.</p>
  <div className="cookie-banner__actions"><Link to="/legal/cookies">Подробнее</Link><button type="button" onClick={acknowledge}>Понятно</button></div>
 </aside>;
}