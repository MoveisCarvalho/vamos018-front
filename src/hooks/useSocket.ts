import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export const useSocket = (userId: string | null) => {
    const [socket, setSocket] = useState<Socket | null>(null);
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        if (!userId) return;

        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

        const newSocket = io(API_URL, {
            transports: ['websocket'],
        });
        
        socketRef.current = newSocket;
        setSocket(newSocket);

        newSocket.on('connect', () => {
            console.log('🔌 Conectado ao Socket.IO');
            newSocket.emit('authenticate', userId);
        });

        return () => {
            newSocket.disconnect();
        };
    }, [userId]);

    return socketRef.current;
};