import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
const KEY='sten_cookie_consent_v2'; const VERSION='2'; const MONTHS=12;
type Consent={accepted:boolean;at:string;policyVersion:string};
function valid(v:string|null){if(!v)return false;try{const x=JSON.parse(v) as Consent;return x.policyVersion===VERSION&&x.accepted&&Date.now()-new Date(x.at).getTime()<MONTHS*31*24*60*60*1000}catch{return false}}
export default function CookieBanner(){const [visible,setVisible]=useState(false);useEffect(()=>{if(!valid(localStorage.getItem(KEY)))setVisible(true)},[]);if(!visible)return null;const accept=()=>{localStorage.setItem(KEY,JSON.stringify({accepted:true,at:new Date().toISOString(),policyVersion:VERSION}));setVisible(false)};return <aside className="cookie-banner" role="dialog" aria-label="Согласие на cookie"><p>Мы используем только необходимые cookie: для работы сессии и сохранения настроек интерфейса. Без рекламы и аналитики.</p><div className="cookie-banner__actions"><Link to="/legal/cookies">Подробнее</Link><button type="button" onClick={accept}>Принять необходимые</button><button type="button" onClick={accept}>Только необходимые</button></div></aside>}
