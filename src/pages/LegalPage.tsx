import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronDown, FileText, ShieldCheck, Database, ContactRound, Mail } from 'lucide-react';
import { useEffect, useState } from 'react';
import LegalFooter from '../components/LegalFooter';
import './LegalPage.css';

const legalSections = [
  { id: 'privacy', title: 'Политика конфиденциальности', description: 'Цели и основания обработки, категории данных, сроки хранения, права субъекта и меры защиты.', href: '/legal/privacy', icon: ShieldCheck, action: 'Открыть полный документ' },
  { id: 'consent', title: 'Согласие на обработку персональных данных', description: 'Какие сведения могут обрабатываться, для чего, какие действия выполняются и как отозвать согласие.', href: '/legal/consent', icon: FileText, action: 'Открыть полный документ' },
  { id: 'browser-storage', title: 'Хранение данных в браузере', description: 'STEN использует localStorage для сохранения отдельных настроек и выбора пользователя. Это локальное хранилище браузера, а не файл cookie.', href: '/legal/cookies', icon: Database, action: 'Подробнее о локальном хранении' },
  { id: 'contacts', title: 'Реквизиты и контакты', description: 'Оператор сервиса, сведения о статусе, порядок оплаты и адрес для обращений.', href: '/legal/contacts', icon: ContactRound, action: 'Открыть реквизиты и контакты' },
  { id: 'personal-data-request', title: 'Обращение по вопросам ПДн', description: 'Для запросов об обработке, уточнении, блокировании или удалении персональных данных используйте контактный адрес оператора.', href: '/legal/contacts#legal-section-4', icon: Mail, action: 'Как направить обращение' },
];

export default function LegalPage() {
  const navigate = useNavigate();
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { document.title = 'Правовая информация — STEN'; }, []);
  return <main className="legal-hub">
    <div className="legal-hub__top">
      <button className="legal-hub__back" onClick={() => navigate(-1)}><ArrowLeft size={16} /> Назад</button>
      <span className="legal-hub__eyebrow">STEN · ПРАВОВАЯ ИНФОРМАЦИЯ</span>
    </div>
    <header className="legal-hub__header">
      <nav aria-label="Хлебные крошки"><Link to="/dashboard">Главная</Link><span aria-hidden="true">/</span><span>Правовая информация</span></nav>
      <h1>Правовая информация</h1>
      <p>Документы и сведения об обработке персональных данных в STEN.</p>
    </header>
    <section className="legal-hub__list" aria-label="Правовые документы">
      {legalSections.map(({ id, title, description, href, icon: Icon, action }) => {
        const expanded = open === id;
        return <article className={`legal-hub__card ${expanded ? 'is-open' : ''}`} key={id}>
          <button className="legal-hub__summary" aria-expanded={expanded} aria-controls={`legal-panel-${id}`} onClick={() => setOpen(expanded ? null : id)}>
            <span className="legal-hub__icon"><Icon size={19} aria-hidden="true" /></span>
            <span className="legal-hub__title">{title}</span>
            <ChevronDown className="legal-hub__chevron" size={18} aria-hidden="true" />
          </button>
          {expanded && <div className="legal-hub__panel" id={`legal-panel-${id}`}><p>{description}</p><Link to={href}>{action} <span aria-hidden="true">→</span></Link></div>}
        </article>;
      })}
    </section>
    <p className="legal-hub__contact">Вопросы по документам: <a href="mailto:pocketshift.support@gmail.com">pocketshift.support@gmail.com</a></p>
    <LegalFooter />
  </main>;
}