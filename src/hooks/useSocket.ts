import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export const useSocket = (userId: string | null) => {
    const [socket, setSocket] = useState<Socket | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const userIdRef = useRef<string | null>(userId);

    useEffect(() => {
        userIdRef.current = userId;
    }, [userId]);

    useEffect(() => {
        if (!userId) {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
                setSocket(null);
            }
            return;
        }

        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

        // Se já existe socket e está desconectado, reconecta
        if (socketRef.current && !socketRef.current.connected) {
            socketRef.current.connect();
            return;
        }

        // Se já existe socket e está conectado, apenas autentica novamente
        if (socketRef.current && socketRef.current.connected) {
            socketRef.current.emit('authenticate', userId);
            return;
        }

        // Cria novo socket
        const newSocket = io(API_URL, {
            transports: ['websocket'],
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
        });

        socketRef.current = newSocket;
        setSocket(newSocket);

        newSocket.on('connect', () => {
            console.log('🔌 Conectado ao Socket.IO');
            newSocket.emit('authenticate', userId);
        });

        newSocket.on('connect_error', (err) => {
            console.error('❌ Erro de conexão Socket.IO:', err);
        });

        newSocket.on('disconnect', () => {
            console.log('🔌 Desconectado do Socket.IO');
        });

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
                setSocket(null);
            }
        };
    }, [userId]);

    return socketRef.current;
};