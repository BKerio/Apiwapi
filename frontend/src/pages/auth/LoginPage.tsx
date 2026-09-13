import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ArrowRight, ShieldCheck, CircleAlert } from 'lucide-react';
import api from '@/api/client';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore } from '@/stores/notificationStore';
import DotLoader from '@/components/shared/DotLoader';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  passwordRaw: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

function LoginPage() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });
  const setAuth = useAuthStore((s) => s.setAuth);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const navigate = useNavigate();
  const [serverError, setServerError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const onSubmit = async (data: LoginForm) => {
    setServerError('');
    try {
      const res = await api.post('/auth/login', { email: data.email, passwordRaw: data.passwordRaw });
      const result = res.data.data;
      setAuth(result.token, result.user);
      const firstName = result.user.name?.split(' ')[0] || result.user.name;
      addNotification({
        type: 'success',
        title: 'Signed in',
        message: firstName ? `Welcome back, ${firstName}.` : 'Welcome back to your workspace.',
      });
      navigate('/dashboard');
    } catch (error: any) {
      const msg = error?.response?.data?.message;
      setServerError(msg || 'Invalid credentials. Please try again.');
    }
  };

  return (
    <div className="login-page">
      <div className="login-card fade-up">
        {/* Brand header */}
        <div className="login-cobrand" style={{ justifyContent: 'center', gap: 14 }}>
          <span style={{ fontSize: 34, lineHeight: 1, color: 'var(--green)' }} aria-hidden="true">&#128276;</span>
          <div className="col" style={{ gap: 1, textAlign: 'left' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-.01em' }}>
              APIWAPI
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em', color: 'var(--muted)', textTransform: 'uppercase' }}>
              Push Notifications
            </span>
          </div>
        </div>

        {/* Form body */}
        <div className="login-body">
          <h1 className="login-title">Sign in to send</h1>
          <p className="login-sub">Onboard members, build groups, and send push notification campaigns.</p>

          {serverError && (
            <div className="alert-error" role="alert">
              <CircleAlert size={16} />
              <span>{serverError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="col" style={{ gap: 16, marginTop: serverError ? 16 : 0 }}>
            <div className="field">
              <label className="label" htmlFor="login-email">Enter your email address</label>
              <div className="input-icon">
                <input
                  {...register('email')}
                  id="login-email"
                  className="input"
                  type="email"
                  autoComplete="username"
                  autoFocus
                  placeholder="you@example.com"
                  style={errors.email ? { borderColor: 'var(--red)' } : undefined}
                />
                <Mail size={16} />
              </div>
              {errors.email && (
                <span className="field-error">{errors.email.message}</span>
              )}
            </div>

            <div className="field">
              <label className="label" htmlFor="login-password">Enter your password</label>
              <div className="input-icon has-toggle">
                <input
                  {...register('passwordRaw')}
                  id="login-password"
                  className="input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="************"
                  style={errors.passwordRaw ? { borderColor: 'var(--red)' } : undefined}
                />
                <Lock size={16} />
                <button
                  type="button"
                  className="field-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.passwordRaw && (
                <span className="field-error">{errors.passwordRaw.message}</span>
              )}
            </div>

            <button
              className="btn btn-primary btn-block btn-lg login-submit"
              disabled={isSubmitting}
              type="submit"
              style={{ marginTop: 4 }}
            >
              {isSubmitting ? (
                <><DotLoader size={20} /> Signing in…</>
              ) : (
                <>Sign in <ArrowRight size={16} /></>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="login-foot">
          <ShieldCheck size={15} />
            Authorized personnel only · All activity is logged and audited
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
