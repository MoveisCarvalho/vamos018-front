import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { signInWithGoogle, signInWithFacebook } from '../services/firebase';
import api from '../services/api';

export const Login: React.FC = () => {
    const navigate = useNavigate();
    const { login, register, user } = useAuth();

    const [isRegister, setIsRegister] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<'passenger' | 'driver'>('passenger');
    const [twoFactorToken, setTwoFactorToken] = useState('');
    const [twoFactorRequired, setTwoFactorRequired] = useState(false);
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);

    // Se já estiver logado, redireciona
    if (user) {
        navigate(user.role === 'passenger' ? '/passenger' : '/driver', { replace: true });
        return null;
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage('');
        setLoading(true);

        try {
            if (isRegister) {
                await register(name, email, password, role);
                navigate(role === 'passenger' ? '/passenger' : '/driver', { replace: true });
            } else {
                await login(email, password, twoFactorToken);
                // Após login, o AuthContext já atualizou o user, então redirecionamos
                // mas precisamos esperar a atualização; faremos no useEffect abaixo.
                // Por enquanto, apenas redirecionamos após login bem-sucedido.
                // Como o login é assíncrono e o estado pode não ter atualizado, usaremos um pequeno delay ou observaremos.
                // Melhor: usar o refreshUser ou confiar no redirecionamento do AppRoutes.
                // Vamos redirecionar baseado na role que veio no login.
                // Mas não temos a role aqui. Podemos ler do localStorage após login.
                const storedUser = localStorage.getItem('user');
                if (storedUser) {
                    const parsed = JSON.parse(storedUser);
                    navigate(parsed.role === 'passenger' ? '/passenger' : '/driver', { replace: true });
                }
            }
        } catch (error: any) {
            const errMsg = error.response?.data?.message || 'Erro ao fazer login/cadastro';
            if (error.response?.data?.twoFactorRequired) {
                setTwoFactorRequired(true);
                setMessage('Digite o código de 6 dígitos do Google Authenticator:');
            } else {
                setMessage(errMsg);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleSocialLogin = async (provider: 'google' | 'facebook') => {
        try {
            setLoading(true);
            const userCred = provider === 'google' ? await signInWithGoogle() : await signInWithFacebook();
            const firebaseToken = await userCred.getIdToken();
            const res = await api.post('/auth/social', {
                firebaseToken,
                email: userCred.email,
                name: userCred.displayName || '',
                role: 'passenger' // pode ser alterado depois
            });
            const { token, user } = res.data;
            localStorage.setItem('token', token);
            localStorage.setItem('user', JSON.stringify(user));
            // Força a atualização do contexto (mas já será feito pelo AuthProvider ao recarregar)
            // Vamos redirecionar manualmente
            navigate(user.role === 'passenger' ? '/passenger' : '/driver', { replace: true });
        } catch (error: any) {
            setMessage(error.response?.data?.message || 'Erro no login social');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ maxWidth: 400, margin: '20px auto', padding: '20px 16px', background: 'white', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
            <h2 style={{ textAlign: 'center', marginBottom: 20, fontSize: '1.8rem' }}>
                {isRegister ? 'Criar Conta' : 'Entrar'}
            </h2>

            {message && (
                <div style={{ padding: 10, background: '#f8d7da', color: '#721c24', borderRadius: 4, marginBottom: 12, textAlign: 'center' }}>
                    {message}
                </div>
            )}

            <form onSubmit={handleSubmit}>
                {isRegister && (
                    <>
                        <input
                            type="text"
                            placeholder="Nome completo"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            disabled={loading}
                            style={{ width: '100%', padding: '14px 12px', fontSize: '16px', marginBottom: 12, border: '1px solid #ccc', borderRadius: 8, background: '#f9f9f9' }}
                        />
                        <select
                            value={role}
                            onChange={(e) => setRole(e.target.value as 'passenger' | 'driver')}
                            disabled={loading}
                            style={{ width: '100%', padding: '14px 12px', fontSize: '16px', marginBottom: 12, border: '1px solid #ccc', borderRadius: 8, background: '#f9f9f9' }}
                        >
                            <option value="passenger">Passageiro</option>
                            <option value="driver">Motorista</option>
                        </select>
                    </>
                )}

                <input
                    type="email"
                    placeholder="E-mail"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    style={{ width: '100%', padding: '14px 12px', fontSize: '16px', marginBottom: 12, border: '1px solid #ccc', borderRadius: 8, background: '#f9f9f9' }}
                />

                <input
                    type="password"
                    placeholder="Senha"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    style={{ width: '100%', padding: '14px 12px', fontSize: '16px', marginBottom: 12, border: '1px solid #ccc', borderRadius: 8, background: '#f9f9f9' }}
                />

                {twoFactorRequired && (
                    <input
                        type="text"
                        placeholder="Código 2FA (6 dígitos)"
                        value={twoFactorToken}
                        onChange={(e) => setTwoFactorToken(e.target.value)}
                        maxLength={6}
                        disabled={loading}
                        style={{ width: '100%', padding: '14px 12px', fontSize: '16px', marginBottom: 12, border: '1px solid #ccc', borderRadius: 8, background: '#f9f9f9' }}
                    />
                )}

                <button
                    type="submit"
                    disabled={loading}
                    style={{ width: '100%', padding: '16px', fontSize: '18px', background: '#007bff', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', opacity: loading ? 0.6 : 1 }}
                >
                    {loading ? 'Carregando...' : (isRegister ? 'Cadastrar' : 'Entrar')}
                </button>
            </form>

            <div style={{ marginTop: 16, textAlign: 'center' }}>
                <button
                    onClick={() => setIsRegister(!isRegister)}
                    disabled={loading}
                    style={{ background: 'none', border: 'none', color: '#007bff', fontSize: '16px', cursor: 'pointer', textDecoration: 'underline' }}
                >
                    {isRegister ? 'Já tem conta? Faça login' : 'Não tem conta? Cadastre-se'}
                </button>
            </div>

            <div style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button
                    onClick={() => handleSocialLogin('google')}
                    disabled={loading}
                    style={{ padding: '12px 20px', background: '#db4437', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: '16px', flex: 1 }}
                >
                    Google
                </button>
                <button
                    onClick={() => handleSocialLogin('facebook')}
                    disabled={loading}
                    style={{ padding: '12px 20px', background: '#1877f2', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: '16px', flex: 1 }}
                >
                    Facebook
                </button>
            </div>
        </div>
    );
};