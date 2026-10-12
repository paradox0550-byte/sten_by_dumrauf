import LegalLayout from './LegalLayout';

const sections=['Оператор сервиса','Контакты','Порядок оплаты','Обращения по персональным данным'];

export default function Contacts(){
 return <LegalLayout title="Реквизиты и контакты" sections={sections} date="2026-10-12">
  <section id="legal-section-1"><h2>1. Оператор сервиса</h2><p>Думрауф Александр Сергеевич</p><p>ИНН: 701741117861</p><p>Статус: плательщик налога на профессиональный доход (НПД), согласно предоставленным оператором сведениям.</p></section>
  <section id="legal-section-2"><h2>2. Контакты</h2><p>Электронная почта: <a href="mailto:pocketshift.support@gmail.com">pocketshift.support@gmail.com</a></p><p>Обращения по персональным данным принимаются по этому же адресу. В теме письма укажите «Персональные данные».</p></section>
  <section id="legal-section-3"><h2>3. Порядок оплаты</h2><p>Если услуга предоставляется на платной основе, способ оплаты и реквизиты для перечисления денежных средств указываются в выставленном счёте или индивидуальном предложении. Оплата через Robokassa в настоящем документе не заявляется.</p></section>
  <section id="legal-section-4"><h2>4. Обращения по персональным данным</h2><p>Для запроса сведений об обработке персональных данных, их уточнения, блокирования или удаления, а также для отзыва согласия направьте обращение на <a href="mailto:pocketshift.support@gmail.com">pocketshift.support@gmail.com</a>.</p></section>
 </LegalLayout>;
}