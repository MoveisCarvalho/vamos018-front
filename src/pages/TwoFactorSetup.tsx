import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

export const TwoFactorSetup: React.FC = () => {
    const { user } = useAuth();
    const [qrCode, setQrCode] = useState<string>('');
    const [secret, setSecret] = useState<string>('');
    const [token, setToken] = useState<string>('');
    const [isEnabled, setIsEnabled] = useState<boolean>(user?.twoFactorEnabled || false);
    const [loading, setLoading] = useState<boolean>(false);
    const [message, setMessage] = useState<string>('');

    const handleSetup = async () => {
        setLoading(true);
        setMessage('');
        try {
            const res = await api.post('/2fa/setup');
            setQrCode(res.data.qrCode);
            setSecret(res.data.secret);
            setMessage('Escaneie o QR Code com o Google Authenticator e insira o token abaixo.');
        } catch (error: any) {
            setMessage(error.response?.data?.message || 'Erro ao configurar 2FA.');
        } finally {
            setLoading(false);
        }
    };

    const handleVerify = async () => {
        if (!token) {
            setMessage('Digite o token gerado pelo Google Authenticator.');
            return;
        }
        setLoading(true);
        setMessage('');
        try {
            const res = await api.post('/2fa/verify', { token });
            setMessage(res.data.message);
            setIsEnabled(true);
        } catch (error: any) {
            setMessage(error.response?.data?.message || 'Token inválido.');
        } finally {
            setLoading(false);
        }
    };

    const handleDisable = async () => {
        if (!window.confirm('Tem certeza que deseja desativar a autenticação de dois fatores?')) return;
        setLoading(true);
        setMessage('');
        try {
            const res = await api.post('/2fa/disable');
            setMessage(res.data.message);
            setIsEnabled(false);
            setQrCode('');
            setSecret('');
        } catch (error: any) {
            setMessage(error.response?.data?.message || 'Erro ao desativar 2FA.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ maxWidth: 480, margin: '20px auto', padding: '0 16px' }}>
            <h2 style={{ textAlign: 'center' }}>🔐 Autenticação de Dois Fatores</h2>

            {message && (
                <div style={{
                    padding: 10,
                    background: '#e9ecef',
                    borderRadius: 4,
                    marginBottom: 12,
                    textAlign: 'center'
                }}>
                    {message}
                </div>
            )}

            {!isEnabled ? (
                <>
                    {!qrCode ? (
                        <button
                            onClick={handleSetup}
                            disabled={loading}
                            style={{
                                width: '100%',
                                padding: '14px',
                                fontSize: '16px',
                                background: '#007bff',
                                color: 'white',
                                border: 'none',
                                borderRadius: 8,
                                cursor: 'pointer',
                                fontWeight: 'bold'
                            }}
                        >
                            {loading ? 'Carregando...' : 'Ativar 2FA'}
                        </button>
                    ) : (
                        <div>
                            <p>Escaneie o QR Code com o Google Authenticator:</p>
                            <img src={qrCode} alt="QR Code" style={{ width: '100%', maxWidth: 200, display: 'block', margin: '10px auto' }} />
                            <p style={{ fontSize: 12, wordBreak: 'break-all' }}>Chave secreta: <strong>{secret}</strong></p>
                            <input
                                type="text"
                                placeholder="Digite o token de 6 dígitos"
                                value={token}
                                onChange={(e) => setToken(e.target.value)}
                                maxLength={6}
                                style={{
                                    width: '100%',
                                    padding: '14px',
                                    fontSize: '16px',
                                    marginBottom: 10,
                                    border: '1px solid #ccc',
                                    borderRadius: 8
                                }}
                            />
                            <button
                                onClick={handleVerify}
                                disabled={loading}
                                style={{
                                    width: '100%',
                                    padding: '14px',
                                    fontSize: '16px',
                                    background: '#28a745',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: 8,
                                    cursor: 'pointer',
                                    fontWeight: 'bold'
                                }}
                            >
                                {loading ? 'Verificando...' : 'Verificar e Ativar'}
                            </button>
                        </div>
                    )}
                </>
            ) : (
                <div>
                    <p style={{ color: 'green', textAlign: 'center' }}>✅ 2FA está ATIVADO para sua conta.</p>
                    <button
                        onClick={handleDisable}
                        disabled={loading}
                        style={{
                            width: '100%',
                            padding: '14px',
                            fontSize: '16px',
                            background: '#dc3545',
                            color: 'white',
                            border: 'none',
                            borderRadius: 8,
                            cursor: 'pointer',
                            fontWeight: 'bold'
                        }}
                    >
                        {loading ? 'Desativando...' : 'Desativar 2FA'}
                    </button>
                </div>
            )}
        </div>
    );
};