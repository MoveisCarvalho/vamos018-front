import React from 'react';

interface MobileButtonProps {
    onClick: () => void;
    children: React.ReactNode;
    variant?: 'primary' | 'success' | 'danger' | 'outline';
    disabled?: boolean;
    fullWidth?: boolean;
}

export const MobileButton: React.FC<MobileButtonProps> = ({
    onClick,
    children,
    variant = 'primary',
    disabled = false,
    fullWidth = false
}) => {
    const variantStyles: Record<string, React.CSSProperties> = {
        primary: { background: '#007bff', color: 'white', border: 'none' },
        success: { background: '#28a745', color: 'white', border: 'none' },
        danger: { background: '#dc3545', color: 'white', border: 'none' },
        outline: { background: 'transparent', color: '#007bff', border: '2px solid #007bff' }
    };

    const style: React.CSSProperties = {
        ...variantStyles[variant],
        padding: '14px 20px',
        fontSize: '16px',
        borderRadius: 8,
        cursor: 'pointer',
        fontWeight: 'bold',
        width: fullWidth ? '100%' : 'auto',
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? 'none' : 'auto'
    };

    return (
        <button onClick={onClick} disabled={disabled} style={style}>
            {children}
        </button>
    );
};