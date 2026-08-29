import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { useSocket } from '../hooks/useSocket';
import { Map } from '../components/Map';

interface RideState {
    currentRideId: string | null;
    rideStatus: string | null;
    pickup: [number, number] | null;
    dropoff: [number, number] | null;
    pickupAddress: string;
    dropoffAddress: string;
    driverLocation: { lat: number; lng: number } | null;
    routeCoords: [number, number][];
    driverRoute: [number, number][];
    quote: { distance: number; price: number; distanceKm: string } | null;
    driverName: string | null; // NOVO
}

const STORAGE_KEY = 'passenger_ride_state';

export const PassengerMap: React.FC = () => {
    const { user, logout } = useAuth();
    const socket = useSocket(user?.id || null);

    // Estados principais
    const [pickup, setPickup] = useState<[number, number] | null>(null);
    const [dropoff, setDropoff] = useState<[number, number] | null>(null);
    const [pickupAddress, setPickupAddress] = useState('');
    const [dropoffAddress, setDropoffAddress] = useState('');
    const [rideStatus, setRideStatus] = useState<string | null>(null);
    const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [currentRideId, setCurrentRideId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [searchLoading, setSearchLoading] = useState(false);
    const [quote, setQuote] = useState<{ distance: number; price: number; distanceKm: string } | null>(null);
    const [quoteLoading, setQuoteLoading] = useState(false);
    const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);
    const [driverRoute, setDriverRoute] = useState<[number, number][]>([]);
    const [cancelLoading, setCancelLoading] = useState(false);
    const [driverName, setDriverName] = useState<string | null>(null); // NOVO

    // Estados auxiliares
    const [currentLocation, setCurrentLocation] = useState<[number, number] | null>(null);
    const [pickupSuggestions, setPickupSuggestions] = useState<any[]>([]);
    const [dropoffSuggestions, setDropoffSuggestions] = useState<any[]>([]);
    const [showPickupDrop, setShowPickupDrop] = useState(false);
    const [showDropoffDrop, setShowDropoffDrop] = useState(false);
    const pickupDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dropoffDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const initializedRef = useRef(false);

    // Estados de notificação
    const [notificationMessage, setNotificationMessage] = useState<string | null>(null);
    const [notificationType, setNotificationType] = useState<'info' | 'success' | 'warning' | 'error'>('info');

    const defaultCenter: [number, number] = [-23.5505, -46.6333];

    // ==================== PERSISTÊNCIA ====================
    const saveState = () => {
        const state: RideState = {
            currentRideId,
            rideStatus,
            pickup,
            dropoff,
            pickupAddress,
            dropoffAddress,
            driverLocation,
            routeCoords,
            driverRoute,
            quote,
            driverName
        };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            console.log('💾 Estado salvo no localStorage');
        } catch (e) {
            console.error('Erro ao salvar estado:', e);
        }
    };

    const loadState = (): RideState | null => {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            if (data) {
                const parsed = JSON.parse(data);
                console.log('📂 Estado carregado do localStorage:', parsed);
                return parsed;
            }
        } catch (e) {
            console.error('Erro ao carregar estado:', e);
        }
        return null;
    };

    const clearState = () => {
        try {
            localStorage.removeItem(STORAGE_KEY);
            console.log('🗑️ Estado removido do localStorage');
        } catch (e) {
            console.error('Erro ao limpar estado:', e);
        }
    };

    // Restaurar estado ao carregar
    useEffect(() => {
        const saved = loadState();
        if (saved) {
            setCurrentRideId(saved.currentRideId);
            setRideStatus(saved.rideStatus);
            setPickup(saved.pickup);
            setDropoff(saved.dropoff);
            setPickupAddress(saved.pickupAddress || '');
            setDropoffAddress(saved.dropoffAddress || '');
            setDriverLocation(saved.driverLocation);
            setRouteCoords(saved.routeCoords || []);
            setDriverRoute(saved.driverRoute || []);
            setQuote(saved.quote);
            setDriverName(saved.driverName || null);
            if (saved.currentRideId && saved.rideStatus !== 'completed' && saved.rideStatus !== 'cancelled') {
                console.log('🔄 Corrida ativa recuperada:', saved.currentRideId);
            }
        }
    }, []);

    // Salvar estado sempre que mudar
    useEffect(() => {
        if (currentRideId) {
            saveState();
        } else {
            if (!loading && !currentRideId) {
                clearState();
            }
        }
    }, [currentRideId, rideStatus, pickup, dropoff, pickupAddress, dropoffAddress, driverLocation, routeCoords, driverRoute, quote, driverName]);

    // ==================== GEOLOCALIZAÇÃO ====================
    useEffect(() => {
        if (navigator.geolocation) {
            const watchId = navigator.geolocation.watchPosition(
                (position) => {
                    const loc: [number, number] = [position.coords.latitude, position.coords.longitude];
                    setCurrentLocation(loc);
                    if (!initializedRef.current) {
                        initializedRef.current = true;
                        if (!pickup) {
                            setPickup(loc);
                            setPickupAddress('Minha localização atual');
                        }
                    }
                },
                (error) => console.error('Erro ao obter localização:', error),
                { enableHighAccuracy: true, timeout: 10000 }
            );
            return () => navigator.geolocation.clearWatch(watchId);
        }
    }, [pickup]);

    // ==================== RESTAURAR PICKUP APÓS CANCELAR ====================
    useEffect(() => {
        if (!currentRideId && currentLocation && (rideStatus === 'cancelled' || rideStatus === 'completed')) {
            setPickup(currentLocation);
            setPickupAddress('Minha localização atual');
            setDropoff(null);
            setDropoffAddress('');
            setDriverLocation(null);
            setQuote(null);
            setRouteCoords([]);
            setDriverRoute([]);
            setDriverName(null);
            setRideStatus(null);
            clearState();
            setNotificationMessage(null);
        }
    }, [currentRideId, currentLocation, rideStatus]);

    // ==================== ROTA DO PASSAGEIRO ====================
    useEffect(() => {
        const fetchRoute = async () => {
            if (!pickup || !dropoff) {
                if (!currentRideId) setRouteCoords([]);
                return;
            }
            try {
                const [lat1, lng1] = pickup;
                const [lat2, lng2] = dropoff;
                const url = `https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=full&geometries=geojson`;
                const res = await fetch(url);
                const data = await res.json();
                if (data.routes && data.routes.length > 0) {
                    const coords = data.routes[0].geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]);
                    setRouteCoords(coords);
                    const realDistance = data.routes[0].distance;
                    const price = 5.0 + (realDistance / 1000) * 2.5;
                    setQuote({
                        distance: realDistance,
                        price: parseFloat(price.toFixed(2)),
                        distanceKm: (realDistance / 1000).toFixed(2)
                    });
                }
            } catch (error) {
                console.error('Erro ao buscar rota:', error);
            }
        };
        fetchRoute();
    }, [pickup, dropoff, currentRideId]);

    // ==================== COTAÇÃO ====================
    useEffect(() => {
        const calculateQuote = async () => {
            if (!pickup || !dropoff) {
                if (!currentRideId) setQuote(null);
                return;
            }
            setQuoteLoading(true);
            try {
                const res = await api.post('/rides/quote', {
                    pickupLat: pickup[0],
                    pickupLng: pickup[1],
                    dropoffLat: dropoff[0],
                    dropoffLng: dropoff[1]
                });
                if (routeCoords.length === 0) {
                    setQuote(res.data);
                }
            } catch (error) {
                console.error('Erro ao cotar corrida:', error);
                if (!currentRideId) setQuote(null);
            } finally {
                setQuoteLoading(false);
            }
        };
        calculateQuote();
    }, [pickup, dropoff, routeCoords, currentRideId]);

    // ==================== SOCKET EVENTS ====================
    useEffect(() => {
        if (!socket) {
            console.log('⏳ Socket não disponível no PassengerMap');
            return;
        }

        const rideAcceptedHandler = (data: any) => {
            console.log('📨 [Passenger] ride-accepted recebido:', data);
            setNotificationMessage(data.message || '✅ Motorista a caminho!');
            setNotificationType('success');
            setRideStatus('accepted');
            setDriverLocation(data.driverLocation);
            setDriverName(data.driverName || 'Motorista'); // NOVO

            const driverPos: [number, number] = [data.driverLocation.lat, data.driverLocation.lng];
            const pickupPos: [number, number] = [data.pickupLocation.lat, data.pickupLocation.lng];

            const fetchDriverRoute = async () => {
                try {
                    const url = `https://router.project-osrm.org/route/v1/driving/${driverPos[1]},${driverPos[0]};${pickupPos[1]},${pickupPos[0]}?overview=full&geometries=geojson`;
                    const res = await fetch(url);
                    const result = await res.json();
                    if (result.routes && result.routes.length > 0) {
                        const coords = result.routes[0].geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]);
                        setDriverRoute(coords);
                    }
                } catch (error) {
                    console.error('Erro ao buscar rota do motorista:', error);
                }
            };
            fetchDriverRoute();
            setTimeout(() => setNotificationMessage(null), 8000);
        };

        const driverLocationHandler = (data: any) => {
            if (data.driverId) {
                setDriverLocation({ lat: data.lat, lng: data.lng });
            }
        };

        const rideStartedHandler = () => {
            console.log('📨 [Passenger] ride-started recebido');
            setNotificationMessage('🚗 Corrida iniciada! Aproveite a viagem.');
            setNotificationType('info');
            setRideStatus('in_progress');
            setTimeout(() => setNotificationMessage(null), 5000);
        };

        const rideCompletedHandler = () => {
            console.log('📨 [Passenger] ride-completed recebido');
            setNotificationMessage('🏁 Corrida finalizada! Obrigado.');
            setNotificationType('info');
            // Limpeza explícita (mantém o nome do motorista até a notificação sumir)
            setRideStatus('completed');
            setCurrentRideId(null);
            setRouteCoords([]);
            setDriverRoute([]);
            setDriverLocation(null);
            setQuote(null);
            setDropoff(null);
            setDropoffAddress('');
            setPickup(null);
            setPickupAddress('');
            // Não limpa driverName imediatamente, será limpo pelo efeito de reset posterior
            clearState();
            setTimeout(() => {
                setDriverName(null);
                setNotificationMessage(null);
            }, 5000);
        };

        const rideCancelledHandler = (data: any) => {
            console.log('📨 [Passenger] ride-cancelled recebido:', data);
            setNotificationMessage(data.message || 'A corrida foi cancelada.');
            setNotificationType('warning');
            setRideStatus('cancelled');
            setCurrentRideId(null);
            setRouteCoords([]);
            setDriverRoute([]);
            setDriverLocation(null);
            setQuote(null);
            setDropoff(null);
            setDropoffAddress('');
            setPickup(null);
            setPickupAddress('');
            clearState();
            setTimeout(() => {
                setDriverName(null);
                setNotificationMessage(null);
            }, 5000);
        };

        socket.on('ride-accepted', rideAcceptedHandler);
        socket.on('driver-location-update', driverLocationHandler);
        socket.on('ride-started', rideStartedHandler);
        socket.on('ride-completed', rideCompletedHandler);
        socket.on('ride-cancelled', rideCancelledHandler);

        return () => {
            socket.off('ride-accepted', rideAcceptedHandler);
            socket.off('driver-location-update', driverLocationHandler);
            socket.off('ride-started', rideStartedHandler);
            socket.off('ride-completed', rideCompletedHandler);
            socket.off('ride-cancelled', rideCancelledHandler);
        };
    }, [socket]);

    // ==================== CANCELAR CORRIDA ====================
    const handleCancelRide = async (reason?: 'justified' | 'unjustified') => {
        if (!currentRideId) return;
        setCancelLoading(true);
        try {
            const res = await api.put(`/rides/${currentRideId}/cancel`, { reason: reason || 'unjustified' });
            const fee = res.data.cancellationFee || 0;
            if (fee > 0) {
                alert(`Corrida cancelada. Você pagará uma taxa de R$ ${fee.toFixed(2)}.`);
            } else {
                alert('Corrida cancelada com sucesso!');
            }
            setRideStatus('cancelled');
            setCurrentRideId(null);
            setRouteCoords([]);
            setDriverRoute([]);
            setDriverLocation(null);
            setQuote(null);
            setDropoff(null);
            setDropoffAddress('');
            setPickup(null);
            setPickupAddress('');
            clearState();
        } catch (error: any) {
            alert(error.response?.data?.message || 'Erro ao cancelar corrida.');
        } finally {
            setCancelLoading(false);
        }
    };

    // ==================== AUTOCOMPLETE ====================
    const fetchSuggestions = async (query: string, type: 'pickup' | 'dropoff') => {
        if (!query || query.length < 3) {
            if (type === 'pickup') setPickupSuggestions([]);
            else setDropoffSuggestions([]);
            return;
        }
        const lat = currentLocation ? currentLocation[0] : '';
        const lon = currentLocation ? currentLocation[1] : '';
        const viewbox = lat && lon ? `&viewbox=${lon - 0.05},${lat - 0.05},${lon + 0.05},${lat + 0.05}&bounded=1` : '';
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=8&addressdetails=1&countrycodes=br${viewbox}`);
            const data = await res.json();
            if (type === 'pickup') {
                setPickupSuggestions(data);
                setShowPickupDrop(true);
            } else {
                setDropoffSuggestions(data);
                setShowDropoffDrop(true);
            }
        } catch (error) {
            console.error('Erro ao buscar sugestões:', error);
        }
    };

    const handlePickupChange = (value: string) => {
        setPickupAddress(value);
        if (pickupDebounceRef.current) clearTimeout(pickupDebounceRef.current);
        pickupDebounceRef.current = setTimeout(() => fetchSuggestions(value, 'pickup'), 400);
    };

    const handleDropoffChange = (value: string) => {
        setDropoffAddress(value);
        if (dropoffDebounceRef.current) clearTimeout(dropoffDebounceRef.current);
        dropoffDebounceRef.current = setTimeout(() => fetchSuggestions(value, 'dropoff'), 400);
    };

    const selectSuggestion = (suggestion: any, type: 'pickup' | 'dropoff') => {
        const lat = parseFloat(suggestion.lat);
        const lng = parseFloat(suggestion.lon);
        if (type === 'pickup') {
            setPickup([lat, lng]);
            setPickupAddress(suggestion.display_name);
            setShowPickupDrop(false);
        } else {
            setDropoff([lat, lng]);
            setDropoffAddress(suggestion.display_name);
            setShowDropoffDrop(false);
        }
    };

    const clearPickup = () => {
        setPickup(null);
        setPickupAddress('');
        setPickupSuggestions([]);
        setShowPickupDrop(false);
    };

    const clearDropoff = () => {
        setDropoff(null);
        setDropoffAddress('');
        setDropoffSuggestions([]);
        setShowDropoffDrop(false);
    };

    const useMyLocation = () => {
        if (currentLocation) {
            setPickup(currentLocation);
            setPickupAddress('Minha localização atual');
        } else {
            alert('Aguardando localização...');
        }
    };

    // ==================== MAP CLICK / REVERSE GEOCODE ====================
    const reverseGeocode = async (lat: number, lng: number) => {
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&zoom=18`);
            const data = await res.json();
            return data.display_name || 'Ponto selecionado no mapa';
        } catch (error) {
            return 'Ponto selecionado no mapa';
        }
    };

    const handleMapClick = async (lat: number, lng: number) => {
        if (currentRideId) return;
        if (!pickup) {
            setPickup([lat, lng]);
            const address = await reverseGeocode(lat, lng);
            setPickupAddress(address);
        } else if (!dropoff) {
            setDropoff([lat, lng]);
            const address = await reverseGeocode(lat, lng);
            setDropoffAddress(address);
        } else {
            setDropoff([lat, lng]);
            const address = await reverseGeocode(lat, lng);
            setDropoffAddress(address);
        }
    };

    // ==================== REQUEST RIDE ====================
    const requestRide = async () => {
        if (!pickup || !dropoff) {
            alert('Selecione origem e destino no mapa ou busque pelos endereços.');
            return;
        }
        if (currentRideId) {
            alert('Você já tem uma corrida ativa.');
            return;
        }
        setLoading(true);
        try {
            const res = await api.post('/rides/request', {
                pickupLat: pickup[0],
                pickupLng: pickup[1],
                dropoffLat: dropoff[0],
                dropoffLng: dropoff[1],
                pickupAddress,
                dropoffAddress,
                distance: quote ? quote.distance : undefined,
                price: quote ? quote.price : undefined
            });
            setRideStatus('requested');
            setCurrentRideId(res.data.rideId);
            alert('🚗 Corrida solicitada com sucesso!');
            saveState();
        } catch (error) {
            alert('Erro ao solicitar corrida.');
        } finally {
            setLoading(false);
        }
    };

    // ==================== MEMOIZED MARKERS E ROTAS ====================
    const markers = useMemo(() => {
        const mks = [];
        if (pickup) mks.push({ lat: pickup[0], lng: pickup[1], label: '📍 Origem' });
        if (dropoff) mks.push({ lat: dropoff[0], lng: dropoff[1], label: '🏁 Destino' });
        if (driverLocation) mks.push({ lat: driverLocation.lat, lng: driverLocation.lng, label: '🚗 Motorista' });
        return mks;
    }, [pickup, dropoff, driverLocation]);

    const driverRouteCoords = useMemo(() => {
        if (driverRoute.length > 0) {
            return [{
                coords: driverRoute,
                color: '#ff0000',
                weight: 4,
                opacity: 0.7
            }];
        }
        return [];
    }, [driverRoute]);

    // ==================== RENDER ====================
    return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f5f5f5' }}>
            <div style={{ padding: '8px 16px', background: 'white', borderBottom: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: '18px' }}>🚗 Passageiro</h3>
                    <small style={{ color: '#666' }}>{user?.name}</small>
                    {driverName && (
                        <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#28a745' }}>
                            👤 Motorista: {driverName}
                        </div>
                    )}
                </div>
                <button onClick={() => { logout(); clearState(); }} style={{ padding: '6px 12px', background: '#dc3545', color: 'white', border: 'none', borderRadius: 6, fontSize: '14px' }}>Sair</button>
            </div>

            {notificationMessage && (
                <div style={{
                    padding: '12px 16px',
                    margin: '8px 16px',
                    background: notificationType === 'success' ? '#d4edda' : notificationType === 'warning' ? '#fff3cd' : '#cce5ff',
                    color: notificationType === 'success' ? '#155724' : notificationType === 'warning' ? '#856404' : '#004085',
                    borderRadius: 8,
                    border: `1px solid ${notificationType === 'success' ? '#c3e6cb' : notificationType === 'warning' ? '#ffc107' : '#b8daff'}`,
                    textAlign: 'center',
                    fontWeight: 'bold',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}>
                    {notificationMessage}
                </div>
            )}

            <div style={{ padding: '8px', background: 'white', borderBottom: '1px solid #ddd', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={useMyLocation} disabled={!!currentRideId} style={{ flex: 1, padding: '8px', background: '#6c757d', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', fontSize: '14px', opacity: currentRideId ? 0.6 : 1 }}>
                        📍 Minha localização
                    </button>
                    <button onClick={() => {
                        if (!currentRideId) {
                            setPickup(null);
                            setDropoff(null);
                            setPickupAddress('');
                            setDropoffAddress('');
                            setDriverLocation(null);
                            setQuote(null);
                            setRouteCoords([]);
                            setDriverRoute([]);
                            setDriverName(null);
                            clearState();
                        } else {
                            alert('Não é possível limpar durante uma corrida ativa.');
                        }
                    }} style={{ padding: '8px 16px', background: '#6c757d', color: 'white', border: 'none', borderRadius: 8, fontSize: '14px' }}>Limpar</button>
                </div>

                <div style={{ display: 'flex', position: 'relative' }}>
                    <input
                        type="text"
                        placeholder="Origem..."
                        value={pickupAddress}
                        onChange={(e) => handlePickupChange(e.target.value)}
                        onFocus={() => pickupSuggestions.length > 0 && setShowPickupDrop(true)}
                        disabled={!!currentRideId}
                        style={{ flex: 1, minWidth: 0, padding: '8px 36px 8px 12px', borderRadius: 8, border: '1px solid #ccc', fontSize: '15px', opacity: currentRideId ? 0.6 : 1 }}
                    />
                    {pickup && !currentRideId && (
                        <button onClick={clearPickup} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#999', fontWeight: 'bold', cursor: 'pointer', fontSize: '16px', padding: '0 4px' }}>✕</button>
                    )}
                    {showPickupDrop && pickupSuggestions.length > 0 && (
                        <div className="autocomplete-dropdown" style={{ top: '100%' }}>
                            {pickupSuggestions.map((s, idx) => (
                                <div key={idx} className="autocomplete-item" onClick={() => selectSuggestion(s, 'pickup')}>
                                    {s.display_name}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', position: 'relative' }}>
                    <input
                        type="text"
                        placeholder="Destino..."
                        value={dropoffAddress}
                        onChange={(e) => handleDropoffChange(e.target.value)}
                        onFocus={() => dropoffSuggestions.length > 0 && setShowDropoffDrop(true)}
                        disabled={!!currentRideId}
                        style={{ flex: 1, minWidth: 0, padding: '8px 36px 8px 12px', borderRadius: 8, border: '1px solid #ccc', fontSize: '15px', opacity: currentRideId ? 0.6 : 1 }}
                    />
                    {dropoff && !currentRideId && (
                        <button onClick={clearDropoff} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#999', fontWeight: 'bold', cursor: 'pointer', fontSize: '16px', padding: '0 4px' }}>✕</button>
                    )}
                    {showDropoffDrop && dropoffSuggestions.length > 0 && (
                        <div className="autocomplete-dropdown" style={{ top: '100%' }}>
                            {dropoffSuggestions.map((s, idx) => (
                                <div key={idx} className="autocomplete-item" onClick={() => selectSuggestion(s, 'dropoff')}>
                                    {s.display_name}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div style={{
                    padding: '8px',
                    background: quote ? '#e8f5e9' : '#f5f5f5',
                    borderRadius: 8,
                    border: `1px solid ${quote ? '#c8e6c9' : '#ddd'}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <div>
                        <strong style={{ fontSize: '12px', color: '#555' }}>Valor:</strong>
                        <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#333' }}>
                            {quoteLoading ? '...' : quote ? `R$ ${quote.price.toFixed(2)}` : '—'}
                        </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '12px', color: '#777' }}>
                        {quote && !quoteLoading ? (
                            <div>{quote.distanceKm} km</div>
                        ) : (
                            <div>Selecione os pontos</div>
                        )}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                    <button
                        onClick={requestRide}
                        disabled={!pickup || !dropoff || rideStatus === 'requested' || loading || !!currentRideId}
                        style={{ flex: 1, padding: '12px', fontSize: '16px', background: '#28a745', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', opacity: (loading || !pickup || !dropoff || rideStatus === 'requested' || !!currentRideId) ? 0.6 : 1 }}
                    >
                        {loading ? 'Solicitando...' : 'Solicitar Corrida'}
                    </button>

                    {currentRideId && rideStatus !== 'completed' && rideStatus !== 'cancelled' && (
                        <button
                            onClick={() => {
                                if (rideStatus === 'requested') {
                                    handleCancelRide('justified');
                                } else {
                                    const confirmCancel = window.confirm(
                                        'Cancelar esta corrida pode gerar uma taxa. Deseja justificar o cancelamento?\n\n' +
                                        'Clique em "OK" para justificar (sem taxa) ou "Cancelar" para cancelar sem justificativa (com taxa).'
                                    );
                                    if (confirmCancel) {
                                        handleCancelRide('justified');
                                    } else {
                                        handleCancelRide('unjustified');
                                    }
                                }
                            }}
                            disabled={cancelLoading}
                            style={{ padding: '12px', fontSize: '16px', background: '#dc3545', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', opacity: cancelLoading ? 0.6 : 1 }}
                        >
                            {cancelLoading ? 'Cancelando...' : 'Cancelar Corrida'}
                        </button>
                    )}
                </div>
            </div>

            <div style={{ flex: 1, position: 'relative' }}>
                <Map
                    center={currentLocation || defaultCenter}
                    markers={markers}
                    onMapClick={handleMapClick}
                    height="100%"
                    currentLocation={currentLocation}
                    route={routeCoords}
                    routes={driverRouteCoords}
                    autoFit={true}
                />
                {driverLocation && (
                    <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: 'rgba(255,255,255,0.9)', padding: '8px 16px', borderRadius: 20, fontSize: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
                        🟢 Motorista online
                    </div>
                )}
            </div>
        </div>
    );
};