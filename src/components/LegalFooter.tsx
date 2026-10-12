import {Link} from 'react-router-dom';

export default function LegalFooter(){
 return <footer className="legal-footer">
  <div className="legal-footer__identity"><span className="legal-footer__brand">STEN</span><span className="legal-footer__copyright">© 2026 Думрауф Александр Сергеевич</span></div>
  <nav className="legal-footer__links" aria-label="Юридические документы">
   <Link to="/legal/privacy">Политика конфиденциальности</Link>
   <Link to="/legal/consent">Согласие на обработку ПДн</Link>
   <Link to="/legal/cookies">Хранение данных в браузере</Link>
   <Link to="/legal/contacts">Реквизиты и контакты</Link>
   <a href="mailto:pocketshift.support@gmail.com?subject=Обращение%20по%20персональным%20данным">Обращение по ПДн</a>
  </nav>
 </footer>;
}