import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

interface Tab {
    icon: string;
    label: string;
    path: string;
}

const tabs: Tab[] = [
    { icon: '🏠', label: 'Início', path: '/' },
    { icon: '📋', label: 'Histórico', path: '/history' },
    { icon: '⭐', label: 'Avaliar', path: '/rate' },
    { icon: '👤', label: 'Perfil', path: '/profile' },
];

export const BottomNav: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();

    return (
        <div className="bottom-nav">
            {tabs.map((tab) => (
                <button
                    key={tab.path}
                    onClick={() => navigate(tab.path)}
                    className={location.pathname === tab.path ? 'active' : ''}
                >
                    <span className="icon">{tab.icon}</span>
                    <span className="label">{tab.label}</span>
                </button>
            ))}
        </div>
    );
};