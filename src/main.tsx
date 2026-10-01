import React from 'react';import ReactDOM from 'react-dom/client';import App from './App';import './app.css';import './executive.css';
const THEME_KEY='sten_theme_v5';
const storedTheme=localStorage.getItem(THEME_KEY);
const initialTheme=storedTheme==='light'||storedTheme==='dark'?storedTheme:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
document.documentElement.dataset.theme=initialTheme;
class ErrorBoundary extends React.Component<React.PropsWithChildren,{error:Error|null}>{state={error:null as Error|null};static getDerivedStateFromError(error:Error){return{error}}componentDidCatch(error:Error){console.error('[STEN]',error)}render(){return this.state.error?<main className="fatal"><section><b>СТЕН</b><h1>Рабочий контур не открылся</h1><p>Ошибка интерфейса. Обновите страницу.</p><button onClick={()=>location.reload()}>Обновить</button></section></main>:this.props.children}}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><App/></ErrorBoundary></React.StrictMode>);
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));