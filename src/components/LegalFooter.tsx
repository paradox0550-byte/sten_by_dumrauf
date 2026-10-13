import { Link } from 'react-router-dom';

export default function LegalFooter() {
  return <footer className="legal-footer">
    <div className="legal-footer__identity"><span className="legal-footer__brand">STEN</span><span className="legal-footer__copyright">© 2026 Думрауф Александр Сергеевич</span></div>
    <nav className="legal-footer__links" aria-label="Правовая информация"><Link to="/legal">Правовая информация</Link></nav>
  </footer>;
}