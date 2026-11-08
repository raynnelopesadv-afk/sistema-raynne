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
    <div className="min-h-screen grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-[hsl(216_13%_10%)] p-12 text-[hsl(40_20%_92%)]">
        <img src={BRAND.logoTransparenteUrl} alt="" aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 w-[130%] max-w-none -translate-x-1/2 -translate-y-1/2 opacity-[0.045]" />
        <img src={BRAND.emblemaUrl} alt="" className="relative h-14 w-auto self-start" />
        <div className="relative max-w-md">
          <p className="titulo-pagina text-5xl leading-[1.1] text-[hsl(41_55%_64%)]">{BRAND.loginSubtitle}</p>
          <p className="mt-5 text-[15px] leading-relaxed text-[hsl(40_8%_70%)]">
            Prazos, audiências, publicações dos tribunais e exigências do INSS do escritório, num lugar só.
          </p>
        </div>
        <p className="relative marca-rl text-sm text-[hsl(40_8%_60%)]">Raynne Lopes · Advocacia Especializada · OAB/MG 160.914</p>
      </aside>

      <div className="flex items-center justify-center px-4 py-10 relative">
      <div className="relative w-full max-w-md">
        <div className="text-center mb-10">
          <img src={BRAND.emblemaUrl} alt="" className="mx-auto h-24 w-auto mb-5 lg:hidden" />
          <h1 className="marca-rl text-3xl font-semibold text-foreground">{BRAND.appName}</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {mode === 'forgot' ? 'Recuperar acesso' : BRAND.companyName}
          </p>
          {mode !== 'forgot' && <p className="lg:hidden titulo-pagina text-lg text-primary mt-3">{BRAND.loginSubtitle}</p>}
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
                className="bg-card border-border focus:border-primary rounded-lg h-12"
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
                  className="bg-card border-border focus:border-primary rounded-lg h-12"
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
    </div>
  );
};

export default Login;
