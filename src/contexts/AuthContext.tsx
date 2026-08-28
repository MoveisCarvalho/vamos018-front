import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

interface User {
    id: string;
    name: string;
    email: string;
    role: 'passenger' | 'driver';
    twoFactorEnabled?: boolean;
}

interface AuthContextData {
    user: User | null;
    loading: boolean;
    login: (email: string, password: string, twoFactorToken?: string) => Promise<void>;
    register: (name: string, email: string, password: string, role: string) => Promise<void>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const storedUser = localStorage.getItem('user');
        if (token && storedUser) {
            setUser(JSON.parse(storedUser));
        }
        setLoading(false);
    }, []);

    const login = async (email: string, password: string, twoFactorToken?: string) => {
        const payload: any = { email, password };
        if (twoFactorToken) {
            payload.twoFactorToken = twoFactorToken;
        }
        const res = await api.post('/auth/login', payload);
        const { token, user } = res.data;

        // LOG para ver o que o backend retornou
        console.log('[LOGIN] Resposta da API:', { token, user });

        // Força a atualização no localStorage e no estado
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        setUser(user);
    };

    const register = async (name: string, email: string, password: string, role: string) => {
        const res = await api.post('/auth/register', { name, email, password, role });
        const { token, user } = res.data;
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        setUser(user);
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, register, logout }}>
            {children}
        </AuthContext.Provider>
    );
};