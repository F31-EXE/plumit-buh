import { useEffect, useState } from 'react';
import {
  GoogleAuthProvider, createUserWithEmailAndPassword, getRedirectResult, sendEmailVerification, sendPasswordResetEmail,
  signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, signOut,
} from 'firebase/auth';
import { auth } from '../lib/firebase.js';
import { ErrorBox, Field, Segmented } from '../ui.jsx';
import { Brand } from '../components/Brand.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';

const ERRORS = {
  'auth/invalid-credential': 'Неверный email или пароль',
  'auth/wrong-password': 'Неверный email или пароль',
  'auth/user-not-found': 'Неверный email или пароль',
  'auth/email-already-in-use': 'Такой email уже зарегистрирован — войдите',
  'auth/weak-password': 'Пароль слишком простой — минимум 8 символов',
  'auth/invalid-email': 'Некорректный email',
  'auth/too-many-requests': 'Слишком много попыток, попробуйте позже',
  'auth/popup-closed-by-user': 'Окно входа Google закрыто — попробуйте ещё раз',
  'auth/cancelled-popup-request': 'Окно входа Google открыто заново',
  'auth/popup-blocked': 'Браузер заблокировал окно Google — используйте вход через перенаправление ниже',
  'auth/operation-not-allowed': 'Этот способ входа выключен. Включите его в консоли Firebase: Authentication → Sign-in method',
  'auth/unauthorized-domain': 'Этот домен не разрешён для входа. Добавьте его в консоли Firebase: Authentication → Settings → Authorized domains',
  'auth/account-exists-with-different-credential': 'Этот email уже зарегистрирован другим способом — войдите по почте',
  'auth/network-request-failed': 'Нет связи с сервером',
};
const provider = () => {
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'select_account' });
  return p;
};
export const authError = (e) => new Error(ERRORS[e?.code] || e?.message || 'Ошибка');

export default function Login() {
  const [mode, setMode] = useState('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleWaiting, setGoogleWaiting] = useState(false);

  // Результат входа через перенаправление (если пользователь выбрал этот способ)
  useEffect(() => {
    getRedirectResult(auth).catch((e) => setError(authError(e)));
  }, []);

  async function run(fn) {
    setBusy(true);
    setError(null);
    setInfo('');
    try { await fn(); } catch (e) { setError(authError(e)); } finally { setBusy(false); }
  }

  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      if (mode === 'in') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        if (password.length < 8) throw Object.assign(new Error(), { code: 'auth/weak-password' });
        const { user } = await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(user);
      }
    });
  };

  // Окно Google не блокирует форму: если его закрыли или заблокировали, можно нажать ещё раз
  // (Firebase не всегда замечает закрытие окна из-за политики Cross-Origin-Opener-Policy у Google)
  const google = async () => {
    setError(null);
    setInfo('');
    setGoogleWaiting(true);
    try {
      await signInWithPopup(auth, provider());
    } catch (e) {
      if (e?.code !== 'auth/cancelled-popup-request') setError(authError(e));
    } finally {
      setGoogleWaiting(false);
    }
  };
  const googleRedirect = () => {
    setError(null);
    signInWithRedirect(auth, provider()).catch((e) => setError(authError(e)));
  };
  const reset = () => run(async () => {
    if (!email) throw new Error('Введите email, затем нажмите «Забыли пароль?»');
    await sendPasswordResetEmail(auth, email);
    setInfo('Письмо для сброса пароля отправлено');
  });

  return (
    <div className="login">
      <ThemeToggle className="corner" />
      <div className="card stack">
        <Brand />
        <button type="button" className="btn" onClick={google}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2-1.9 3.3-4.7 3.3-8z" /><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" /><path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.1a11 11 0 0 0 0 9.9z" /><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" /></svg>
          {googleWaiting ? 'Ждём окно Google…' : 'Войти через Google'}
        </button>
        {googleWaiting && (
          <div className="faint small" style={{ textAlign: 'center' }}>
            Окно не появилось? <button type="button" className="link" onClick={googleRedirect}>Войти через перенаправление</button>
          </div>
        )}
        <div className="faint small" style={{ textAlign: 'center' }}>или по почте</div>
        <Segmented value={mode} onChange={setMode} options={[['in', 'Вход'], ['up', 'Регистрация']]} />
        <form className="stack" onSubmit={submit}>
          <Field label="Email"><input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
          <Field label="Пароль">
            <input className="input" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} minLength={mode === 'up' ? 8 : undefined}
              value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <ErrorBox error={error} />
          {info && <div className="muted small">{info}</div>}
          <button className="btn primary" disabled={busy}>{mode === 'in' ? 'Войти' : 'Зарегистрироваться'}</button>
          {mode === 'in' && <button type="button" className="btn ghost sm" onClick={reset} disabled={busy}>Забыли пароль?</button>}
        </form>
      </div>
    </div>
  );
}

// Проверяет, подтвердил ли пользователь почту; true — подтвердил (токен обновлён, страница перезагружается)
async function refreshVerified() {
  const current = auth.currentUser;
  if (!current) return false;
  await current.reload();
  if (!auth.currentUser?.emailVerified) return false;
  await auth.currentUser.getIdToken(true); // новый токен с email_verified, чтобы его увидели правила
  window.location.reload();
  return true;
}

export function VerifyEmail({ user }) {
  const [msg, setMsg] = useState('');

  // Проверяем сами раз в несколько секунд — после перехода по ссылке приложение откроется без нажатий
  useEffect(() => {
    const t = setInterval(() => refreshVerified().catch(() => {}), 4000);
    return () => clearInterval(t);
  }, []);

  const resend = async () => {
    try { await sendEmailVerification(auth.currentUser); setMsg('Письмо отправлено ещё раз'); } catch (e) { setMsg(authError(e).message); }
  };
  const check = async () => {
    try {
      if (!(await refreshVerified())) setMsg('Почта ещё не подтверждена');
    } catch (e) { setMsg(authError(e).message); }
  };
  return (
    <div className="login">
      <ThemeToggle className="corner" />
      <div className="card stack">
        <Brand />
        <h2>Подтвердите почту</h2>
        <p className="muted" style={{ margin: 0 }}>Мы отправили письмо на <strong>{user.email}</strong>. Перейдите по ссылке из письма и нажмите «Я подтвердил».</p>
        {msg && <div className="muted small">{msg}</div>}
        <button type="button" className="btn primary" onClick={check}>Я подтвердил</button>
        <div className="row">
          <button type="button" className="btn ghost sm" onClick={resend}>Отправить ещё раз</button>
          <button type="button" className="btn ghost sm" onClick={() => signOut(auth)}>Выйти</button>
        </div>
      </div>
    </div>
  );
}

export function NoAccess({ user }) {
  return (
    <div className="login">
      <ThemeToggle className="corner" />
      <div className="card stack">
        <Brand />
        <h2>Нет доступа</h2>
        <p className="muted" style={{ margin: 0 }}>
          Вы вошли как <strong>{user.email}</strong>. Попросите администратора добавить этот email в разделе «Настройки → Доступ».
          Страница обновится сама.
        </p>
        <button type="button" className="btn" onClick={() => signOut(auth)}>Войти под другим аккаунтом</button>
      </div>
    </div>
  );
}
