import '@fontsource-variable/inter';import React from 'react';import ReactDOM from 'react-dom/client';import App from './App';import './app.css';import './executive.css';
const THEME_KEY='sten_theme_v5';
const storedTheme=localStorage.getItem(THEME_KEY);
const initialTheme=storedTheme==='light'||storedTheme==='dark'?storedTheme:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
const FONT_SIZE_KEY='sten_font_size_v1';
const MOTION_KEY='sten_reduce_motion_v1';
const storedFontSize=localStorage.getItem(FONT_SIZE_KEY);
const initialFontSize=storedFontSize==='100'||storedFontSize==='110'||storedFontSize==='120'?storedFontSize:'100';
const initialReduceMotion=localStorage.getItem(MOTION_KEY)==='true';
document.documentElement.dataset.fontScale=initialFontSize;
document.documentElement.dataset.reduceMotion=initialReduceMotion?'true':'false';
document.documentElement.dataset.theme=initialTheme;
class ErrorBoundary extends React.Component<React.PropsWithChildren,{error:Error|null}>{state={error:null as Error|null};static getDerivedStateFromError(error:Error){return{error}}componentDidCatch(error:Error){console.error('[STEN]',error)}render(){return this.state.error?<main className="fatal"><section><b>СТЕН</b><h1>Рабочий контур не открылся</h1><p>Ошибка интерфейса. Обновите страницу.</p><button onClick={()=>location.reload()}>Обновить</button></section></main>:this.props.children}}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><div className="sten-brand-bg" aria-hidden="true" /><App/></ErrorBoundary></React.StrictMode>);
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));