import axios from 'axios';

// Corrigido: Garante que o /api esteja sempre no final
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const baseURL = API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`;

const api = axios.create({
    baseURL: baseURL,
    headers: { 'Content-Type': 'application/json' }
});

// Interceptor para adicionar token automaticamente
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export default api;