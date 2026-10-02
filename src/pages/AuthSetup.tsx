import { useAuth } from '../contexts/AuthContext';

export default function AuthSetup() {
  const { user } = useAuth();

  return (
    <main className="unlock">
      <section className="unlock-card">
        <small>STEN — AUTHENTICATION</small>
        <h1>{user ? 'Сессия восстановлена' : 'Авторизация настраивается'}</h1>
        <p>
          Старый вход по персональному коду временно отключён. Контур email,
          пароля, подтверждения почты и доступа организации подключается отдельно.
        </p>
        {user && <p>Текущая сессия действительна. Можно продолжить работу.</p>}
      </section>
    </main>
  );
}
