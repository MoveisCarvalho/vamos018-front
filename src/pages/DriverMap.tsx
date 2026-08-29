import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { useSocket } from '../hooks/useSocket';
import { Map } from '../components/Map';

interface RideRequest {
    rideId: string;
    pickup: [number, number];
    dropoff: [number, number];
    distance: number;
    price: number;
}

export const DriverMap: React.FC = () => {
    const { user, logout } = useAuth();
    const socket = useSocket(user?.id || null);
    const [availableRides, setAvailableRides] = useState<RideRequest[]>([]);
    const [currentRide, setCurrentRide] = useState<any>(null);
    const [currentRideStatus, setCurrentRideStatus] = useState<string | null>(null);
    const [myLocation, setMyLocation] = useState<[number, number] | null>(null);
    const [isOnline, setIsOnline] = useState(false);
    const [loading, setLoading] = useState(false);
    const [toggleLoading, setToggleLoading] = useState(false);
    const [driverRideRoute, setDriverRideRoute] = useState<[number, number][]>([]);
    const [notificationMessage, setNotificationMessage] = useState<string | null>(null);
    const [notificationType, setNotificationType] = useState<'info' | 'success' | 'warning' | 'error'>('info');
    const [passengerName, setPassengerName] = useState<string | null>(null); // NOVO

    const defaultCenter: [number, number] = [-23.5505, -46.6333];
    const mapRef = useRef<any>(null);

    // Geolocalização
    useEffect(() => {
        if (!navigator.geolocation) return;
        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const { latitude, longitude } = pos.coords;
                const newLoc: [number, number] = [latitude, longitude];
                setMyLocation(newLoc);
                if (isOnline && socket) {
                    socket.emit('driver-location', {
                        driverId: user?.id,
                        lat: latitude,
                        lng: longitude
                    });
                }
            },
            (err) => console.error('Erro GPS:', err),
            { enableHighAccuracy: true, timeout: 10000 }
        );
        return () => navigator.geolocation.clearWatch(watchId);
    }, [isOnline, socket, user?.id]);

    // Escuta de novas corridas – apenas se online
    useEffect(() => {
        if (!socket) {
            console.log('⏳ Socket não disponível ainda');
            return;
        }

        const handleNewRide = (data: RideRequest) => {
            if (!isOnline) {
                console.log('🔇 Motorista offline, ignorando corrida:', data.rideId);
                return;
            }
            console.log('🚗 Nova corrida recebida:', data);
            setAvailableRides(prev => {
                if (prev.some(r => r.rideId === data.rideId)) return prev;
                return [...prev, data];
            });
            if (isOnline && navigator.vibrate) navigator.vibrate(200);
        };

        const handleRideUnavailable = (data: { rideId: string }) => {
            console.log('❌ Corrida não mais disponível:', data.rideId);
            setAvailableRides(prev => prev.filter(r => r.rideId !== data.rideId));
        };

        const handleRideCancelled = (data: { rideId: string, message: string }) => {
            console.log('❌ Corrida cancelada recebida:', data);
            if (currentRide && currentRide._id === data.rideId) {
                setNotificationMessage(data.message || 'A corrida foi cancelada.');
                setNotificationType('warning');
                setCurrentRide(null);
                setCurrentRideStatus(null);
                setDriverRideRoute([]);
                setPassengerName(null);
                setTimeout(() => setNotificationMessage(null), 5000);
            } else {
                setAvailableRides(prev => prev.filter(r => r.rideId !== data.rideId));
            }
        };

        socket.on('new-ride-available', handleNewRide);
        socket.on('ride-unavailable', handleRideUnavailable);
        socket.on('ride-cancelled', handleRideCancelled);
        socket.on('connect', () => {
            console.log('✅ Socket conectado no DriverMap');
            if (user?.id) {
                socket.emit('authenticate', user.id);
            }
        });

        return () => {
            socket.off('new-ride-available', handleNewRide);
            socket.off('ride-unavailable', handleRideUnavailable);
            socket.off('ride-cancelled', handleRideCancelled);
            socket.off('connect');
        };
    }, [socket, isOnline, user?.id, currentRide]);

    const toggleOnline = async () => {
        const newStatus = !isOnline;
        setToggleLoading(true);
        try {
            await api.put('/rides/driver/availability', { isAvailable: newStatus });
            setIsOnline(newStatus);
            alert(newStatus ? '📡 Você está online!' : '📴 Você está offline.');
        } catch (error) {
            alert('Erro ao alterar status.');
        } finally {
            setToggleLoading(false);
        }
    };

    const acceptRide = async (rideId: string) => {
        try {
            setLoading(true);
            const res = await api.put(`/rides/${rideId}/accept`);
            const ride = res.data.ride;
            setCurrentRide(ride);
            setCurrentRideStatus('accepted');
            setAvailableRides(prev => prev.filter(r => r.rideId !== rideId));
            setPassengerName(ride.passengerName || 'Passageiro'); // NOVO

            if (myLocation && ride.pickupLocation && ride.dropoffLocation) {
                const pickupPos: [number, number] = [ride.pickupLocation.coordinates[1], ride.pickupLocation.coordinates[0]];
                const dropoffPos: [number, number] = [ride.dropoffLocation.coordinates[1], ride.dropoffLocation.coordinates[0]];
                const fetchRoute = async () => {
                    try {
                        const url = `https://router.project-osrm.org/route/v1/driving/${myLocation[1]},${myLocation[0]};${pickupPos[1]},${pickupPos[0]};${dropoffPos[1]},${dropoffPos[0]}?overview=full&geometries=geojson`;
                        const response = await fetch(url);
                        const data = await response.json();
                        if (data.routes && data.routes.length > 0) {
                            const coords = data.routes[0].geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]);
                            setDriverRideRoute(coords);
                        }
                    } catch (error) {
                        console.error('Erro ao buscar rota para motorista:', error);
                    }
                };
                fetchRoute();
            }

            alert('✅ Corrida aceita! Dirija-se ao passageiro.');
        } catch (error) {
            alert('Erro ao aceitar corrida.');
        } finally {
            setLoading(false);
        }
    };

    const declineRide = (rideId: string) => {
        setAvailableRides(prev => prev.filter(r => r.rideId !== rideId));
    };

    const startRide = async () => {
        if (!currentRide) return;
        try {
            setLoading(true);
            await api.put(`/rides/${currentRide._id}/start`);
            setCurrentRideStatus('in_progress');
            alert('🚗 Corrida em andamento!');
        } catch (error) {
            alert('Erro ao iniciar corrida.');
        } finally {
            setLoading(false);
        }
    };

    const completeRide = async () => {
        if (!currentRide) return;
        try {
            setLoading(true);
            await api.put(`/rides/${currentRide._id}/complete`);
            alert('🏁 Corrida finalizada com sucesso!');
            setCurrentRide(null);
            setCurrentRideStatus(null);
            setDriverRideRoute([]);
            setPassengerName(null);
            setNotificationMessage('Corrida finalizada!');
            setNotificationType('info');
            setTimeout(() => setNotificationMessage(null), 3000);
        } catch (error) {
            alert('Erro ao finalizar corrida.');
        } finally {
            setLoading(false);
        }
    };

    const markers = useMemo(() => {
        const mks = [];
        if (myLocation) mks.push({ lat: myLocation[0], lng: myLocation[1], label: '📍 Você' });
        if (currentRide) {
            mks.push({ lat: currentRide.pickupLocation.coordinates[1], lng: currentRide.pickupLocation.coordinates[0], label: '👤 Passageiro' });
            mks.push({ lat: currentRide.dropoffLocation.coordinates[1], lng: currentRide.dropoffLocation.coordinates[0], label: '🏁 Destino' });
        }
        return mks;
    }, [myLocation, currentRide]);

    return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f5f5f5' }}>
            <div style={{ padding: '12px 16px', background: 'white', borderBottom: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <div>
                    <h3 style={{ margin: 0 }}>🚗 Motorista</h3>
                    <small style={{ color: '#666' }}>{user?.name}</small>
                    {passengerName && (
                        <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#007bff' }}>
                            👤 Passageiro: {passengerName}
                        </div>
                    )}
                </div>
                <button onClick={logout} style={{ padding: '8px 12px', background: '#dc3545', color: 'white', border: 'none', borderRadius: 6 }}>Sair</button>
            </div>

            {notificationMessage && (
                <div style={{
                    padding: '12px 16px',
                    margin: '8px 16px',
                    background: notificationType === 'warning' ? '#fff3cd' : '#d4edda',
                    color: notificationType === 'warning' ? '#856404' : '#155724',
                    borderRadius: 8,
                    border: `1px solid ${notificationType === 'warning' ? '#ffc107' : '#c3e6cb'}`,
                    textAlign: 'center',
                    fontWeight: 'bold'
                }}>
                    {notificationMessage}
                </div>
            )}

            <div style={{ padding: '12px 16px', background: 'white', borderBottom: '1px solid #ddd', flexShrink: 0, display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                    onClick={toggleOnline}
                    disabled={toggleLoading}
                    style={{ padding: '10px 16px', fontSize: '16px', background: isOnline ? '#28a745' : '#6c757d', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', flex: 1, minWidth: 120 }}
                >
                    {isOnline ? '🟢 Online' : '🔴 Offline'}
                </button>
                {currentRide && currentRideStatus === 'accepted' && (
                    <button onClick={startRide} disabled={loading} style={{ padding: '10px 16px', fontSize: '16px', background: '#007bff', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', flex: 1, minWidth: 120, opacity: loading ? 0.6 : 1 }}>
                        {loading ? '...' : '🚗 Iniciar'}
                    </button>
                )}
                {currentRide && currentRideStatus === 'in_progress' && (
                    <button onClick={completeRide} disabled={loading} style={{ padding: '10px 16px', fontSize: '16px', background: '#dc3545', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', flex: 1, minWidth: 120, opacity: loading ? 0.6 : 1 }}>
                        {loading ? '...' : 'Finalizar'}
                    </button>
                )}
                {!currentRide && (
                    <span style={{ fontSize: '14px', color: '#666', flex: 1, textAlign: 'center' }}>
                        {availableRides.length} corrida(s) na fila
                    </span>
                )}
            </div>

            {availableRides.length > 0 && !currentRide && (
                <div style={{ maxHeight: '30vh', overflowY: 'auto', background: 'white', borderBottom: '1px solid #ddd', padding: '8px 16px', flexShrink: 0 }}>
                    {availableRides.map((ride) => (
                        <div key={ride.rideId} style={{ borderBottom: '1px solid #eee', padding: '12px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <p style={{ margin: 0, fontSize: '14px' }}><strong>R$ {ride.price.toFixed(2)}</strong></p>
                                <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>{(ride.distance / 1000).toFixed(1)} km</p>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => acceptRide(ride.rideId)} disabled={loading} style={{ padding: '8px 16px', background: '#28a745', color: 'white', border: 'none', borderRadius: 20, fontSize: '14px', fontWeight: 'bold' }}>Aceitar</button>
                                <button onClick={() => declineRide(ride.rideId)} disabled={loading} style={{ padding: '8px 16px', background: '#dc3545', color: 'white', border: 'none', borderRadius: 20, fontSize: '14px', fontWeight: 'bold' }}>Recusar</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div style={{ flex: 1, position: 'relative' }}>
                <Map
                    center={myLocation || defaultCenter}
                    markers={markers}
                    height="100%"
                    currentLocation={myLocation}
                    route={driverRideRoute}
                    autoFit={false}
                />
                <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: 'rgba(255,255,255,0.9)', padding: '8px 16px', borderRadius: 20, fontSize: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)', textAlign: 'center' }}>
                    {isOnline ? (currentRide ? '🟢 Em corrida...' : '🟢 Aguardando chamados...') : '🔴 Fique online para receber corridas'}
                </div>
            </div>
        </div>
    );
};