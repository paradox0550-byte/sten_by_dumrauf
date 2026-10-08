import {ReactNode} from 'react';
import {useNavigate} from 'react-router-dom';
import LegalFooter from '../../components/LegalFooter';
const toc=(items:string[])=>items.map((label,i)=>({label,id:`legal-section-${i+1}`}));
export default function LegalLayout({title,children,sections,date='2026-10-08'}:{title:string;children:ReactNode;sections:string[];date?:string}){
 const navigate=useNavigate(); const items=toc(sections);
 return <main className="legal-page"><div className="legal-page__content"><header className="legal-page__head"><h1>{title}</h1><div className="legal-page__meta"><span>Дата обновления: {date}</span><span className="legal-page__draft">Черновик v2. Подлежит юридической проверке</span></div></header><nav className="legal-page__toc" aria-label="Оглавление"><h2>Оглавление</h2><ol>{items.map(x=><li key={x.id}><a href={`#${x.id}`}>{x.label}</a></li>)}</ol></nav><article className="legal-page__body">{children}</article><div className="legal-page__footer"><button className="legal-page__back" onClick={()=>navigate(-1)}>Назад</button><span className="legal-page__draft">Черновик v2. Подлежит проверке юристом</span></div><LegalFooter/></div></main>;
}