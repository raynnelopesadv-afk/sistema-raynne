import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Shield } from 'lucide-react';
import { BRAND } from '@/config/brand';

const Login = () => {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [info, setInfo] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInfo('');

    if (mode === 'forgot') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        setError('Não foi possível enviar o e-mail. Verifique o endereço.');
      } else {
        setInfo('Enviamos um link de recuperação para seu e-mail.');
      }
      setLoading(false);
      return;
    }

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/` },
      });
      if (error) {
        setError(error.message || 'Erro ao cadastrar.');
      } else {
        // Auto-confirm está ligado, então já loga
        const { error: signInErr } = await signIn(email, password);
        if (signInErr) {
          setInfo('Conta criada! Faça login.');
          setMode('signin');
        }
      }
      setLoading(false);
      return;
    }

    const { error } = await signIn(email, password);
    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('invalid') || msg.includes('credentials')) {
        setError('Credenciais inválidas. Tente novamente.');
      } else {
        setError(error.message || 'Erro ao entrar. Tente novamente.');
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-secondary/20" />
      <div className="absolute top-1/4 -left-32 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
      <div className="absolute bottom-1/4 -right-32 h-96 w-96 rounded-full bg-accent/5 blur-3xl" />

      <div className="relative w-full max-w-md">
        <div className="text-center mb-10">
          <img src={BRAND.logoUrl} alt={BRAND.appName} className="mx-auto w-32 h-32 rounded-full object-cover ring-1 ring-primary/40 mb-5" />
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="text-primary">{BRAND.appName}</span>
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {mode === 'forgot' ? 'Recuperar acesso' : `${BRAND.companyName} · ${BRAND.loginSubtitle}`}
          </p>
        </div>

        <div className="glass-card p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm text-muted-foreground">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="bg-secondary/50 border-border/50 focus:border-primary/50 rounded-xl h-12"
                required
              />
            </div>

            {mode !== 'forgot' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm text-muted-foreground">Senha</Label>
                  {mode === 'signin' && (
                    <button
                      type="button"
                      onClick={() => { setMode('forgot'); setError(''); setInfo(''); }}
                      className="text-xs text-primary hover:underline"
                    >
                      Esqueci minha senha
                    </button>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-secondary/50 border-border/50 focus:border-primary/50 rounded-xl h-12"
                  required
                  minLength={6}
                />
              </div>
            )}

            {error && <p className="text-destructive text-sm text-center">{error}</p>}
            {info && <p className="text-primary text-sm text-center">{info}</p>}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-base"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : mode === 'forgot' ? (
                'Enviar link de recuperação'
              ) : mode === 'signup' ? (
                'Criar conta'
              ) : (
                'Entrar'
              )}
            </Button>

            {mode === 'signin' && (
              <button
                type="button"
                onClick={() => { setMode('signup'); setError(''); setInfo(''); }}
                className="w-full text-sm text-muted-foreground hover:text-foreground"
              >
                Não tem conta? <span className="text-primary">Cadastre-se</span>
              </button>
            )}

            {mode !== 'signin' && (
              <button
                type="button"
                onClick={() => { setMode('signin'); setError(''); setInfo(''); }}
                className="w-full text-sm text-muted-foreground hover:text-foreground"
              >
                ← Voltar ao login
              </button>
            )}
          </form>
        </div>

        <p className="text-center text-muted-foreground/50 text-xs mt-8">
          © {new Date().getFullYear()} {BRAND.companyName}. Todos os direitos reservados.
        </p>
      </div>
    </div>
  );
};

export default Login;
