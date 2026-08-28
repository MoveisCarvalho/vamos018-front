import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { useSocket } from '../hooks/useSocket';
import { Map } from '../components/Map';

export const PassengerMap: React.FC = () => {
    const { user, logout } = useAuth();
    const socket = useSocket(user?.id || null);

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

    // NOVO: Estado para guardar as coordenadas da rota desenhada
    const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);

    const [currentLocation, setCurrentLocation] = useState<[number, number] | null>(null);
    const [pickupSuggestions, setPickupSuggestions] = useState<any[]>([]);
    const [dropoffSuggestions, setDropoffSuggestions] = useState<any[]>([]);
    const [showPickupDrop, setShowPickupDrop] = useState(false);
    const [showDropoffDrop, setShowDropoffDrop] = useState(false);

    const pickupDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dropoffDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const defaultCenter: [number, number] = [-23.5505, -46.6333];

    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const loc: [number, number] = [position.coords.latitude, position.coords.longitude];
                    setCurrentLocation(loc);
                    if (!pickup) {
                        setPickup(loc);
                        setPickupAddress('Minha localização atual');
                    }
                },
                (error) => console.error('Erro ao obter localização:', error),
                { enableHighAccuracy: true, timeout: 10000 }
            );
        }
    }, []);

    // NOVO: Buscar rota no OSRM sempre que origem ou destino mudarem
    useEffect(() => {
        const fetchRoute = async () => {
            if (!pickup || !dropoff) {
                setRouteCoords([]);
                return;
            }
            try {
                const [lat1, lng1] = pickup;
                const [lat2, lng2] = dropoff;
                // OSRM espera: longitude,latitude;longitude,latitude
                const url = `https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=full&geometries=geojson`;

                const res = await fetch(url);
                const data = await res.json();
                if (data.routes && data.routes.length > 0) {
                    // OSRM retorna [lng, lat], mas o Leaflet espera [lat, lng]
                    const coords = data.routes[0].geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]);
                    setRouteCoords(coords);

                    // (Bônus) Atualizar o preço com a distância real da rota
                    const realDistance = data.routes[0].distance; // em metros
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
    }, [pickup, dropoff]);

    // Cotação automática de preço (usada caso a rota demore ou falhe)
    useEffect(() => {
        const calculateQuote = async () => {
            if (!pickup || !dropoff) {
                setQuote(null);
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
                // Se a rota já tiver sido calculada, não sobrescreve o preço com a distância em linha reta
                if (routeCoords.length === 0) {
                    setQuote(res.data);
                }
            } catch (error) {
                console.error('Erro ao cotar corrida:', error);
                setQuote(null);
            } finally {
                setQuoteLoading(false);
            }
        };
        calculateQuote();
    }, [pickup, dropoff, routeCoords]);

    // Socket
    useEffect(() => {
        if (socket) {
            socket.on('ride-accepted', (data) => {
                alert('✅ Motorista a caminho!');
                setRideStatus('accepted');
            });
            socket.on('driver-location-update', (data) => {
                if (data.driverId) {
                    setDriverLocation({ lat: data.lat, lng: data.lng });
                }
            });
            socket.on('ride-started', () => setRideStatus('in_progress'));
            socket.on('ride-completed', () => {
                alert('🏁 Corrida finalizada! Obrigado.');
                setRideStatus('completed');
                setCurrentRideId(null);
                setDriverLocation(null);
                setPickup(null);
                setDropoff(null);
                setPickupAddress('');
                setDropoffAddress('');
                setQuote(null);
                setRouteCoords([]); // Limpar rota ao finalizar
            });
        }
    }, [socket]);

    // Autocomplete
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

    // Funções para Limpar (X)
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

    // Geocodificação reversa
    const reverseGeocode = async (lat: number, lng: number) => {
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&zoom=18`);
            const data = await res.json();
            return data.display_name || 'Ponto selecionado no mapa';
        } catch (error) {
            return 'Ponto selecionado no mapa';
        }
    };

    // Lógica de clique: Define origem -> Define destino -> SUBSTITUI destino
    const handleMapClick = async (lat: number, lng: number) => {
        if (!pickup) {
            setPickup([lat, lng]);
            const address = await reverseGeocode(lat, lng);
            setPickupAddress(address);
        } else if (!dropoff) {
            setDropoff([lat, lng]);
            const address = await reverseGeocode(lat, lng);
            setDropoffAddress(address);
        } else {
            // Se ambos já existem, substitui o destino
            setDropoff([lat, lng]);
            const address = await reverseGeocode(lat, lng);
            setDropoffAddress(address);
        }
    };

    const requestRide = async () => {
        if (!pickup || !dropoff) {
            alert('Selecione origem e destino no mapa ou busque pelos endereços.');
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
                // [CORREÇÃO] Enviando os valores da rota real para bater com o backend
                distance: quote ? quote.distance : undefined,
                price: quote ? quote.price : undefined
            });
            setRideStatus('requested');
            setCurrentRideId(res.data.rideId);
            alert('🚗 Corrida solicitada com sucesso!');
        } catch (error) {
            alert('Erro ao solicitar corrida.');
        } finally {
            setLoading(false);
        }
    };

    const markers = [];
    if (pickup) markers.push({ lat: pickup[0], lng: pickup[1], label: '📍 Origem' });
    if (dropoff) markers.push({ lat: dropoff[0], lng: dropoff[1], label: '🏁 Destino' });
    if (driverLocation) markers.push({ lat: driverLocation.lat, lng: driverLocation.lng, label: '🚗 Motorista' });

    return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f5f5f5' }}>
            {/* Header */}
            <div style={{ padding: '8px 16px', background: 'white', borderBottom: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: '18px' }}>🚗 Passageiro</h3>
                    <small style={{ color: '#666' }}>{user?.name}</small>
                </div>
                <button onClick={logout} style={{ padding: '6px 12px', background: '#dc3545', color: 'white', border: 'none', borderRadius: 6, fontSize: '14px' }}>Sair</button>
            </div>

            {/* Controls - Layout Compacto (Mapa Maior) */}
            <div style={{ padding: '8px', background: 'white', borderBottom: '1px solid #ddd', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>

                <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={useMyLocation} style={{ flex: 1, padding: '8px', background: '#6c757d', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', fontSize: '14px' }}>
                        📍 Minha localização
                    </button>
                    <button onClick={() => { setPickup(null); setDropoff(null); setPickupAddress(''); setDropoffAddress(''); setDriverLocation(null); setQuote(null); setRouteCoords([]); }} style={{ padding: '8px 16px', background: '#6c757d', color: 'white', border: 'none', borderRadius: 8, fontSize: '14px' }}>Limpar</button>
                </div>

                {/* Input Origem */}
                <div style={{ display: 'flex', position: 'relative' }}>
                    <input
                        type="text"
                        placeholder="Origem..."
                        value={pickupAddress}
                        onChange={(e) => handlePickupChange(e.target.value)}
                        onFocus={() => pickupSuggestions.length > 0 && setShowPickupDrop(true)}
                        style={{ flex: 1, minWidth: 0, padding: '8px 36px 8px 12px', borderRadius: 8, border: '1px solid #ccc', fontSize: '15px' }}
                    />
                    {pickup && (
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

                {/* Input Destino */}
                <div style={{ display: 'flex', position: 'relative' }}>
                    <input
                        type="text"
                        placeholder="Destino..."
                        value={dropoffAddress}
                        onChange={(e) => handleDropoffChange(e.target.value)}
                        onFocus={() => dropoffSuggestions.length > 0 && setShowDropoffDrop(true)}
                        style={{ flex: 1, minWidth: 0, padding: '8px 36px 8px 12px', borderRadius: 8, border: '1px solid #ccc', fontSize: '15px' }}
                    />
                    {dropoff && (
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

                {/* Card de Preço Compacto */}
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
                            <>
                                <div>{quote.distanceKm} km</div>
                            </>
                        ) : (
                            <div>Selecione os pontos</div>
                        )}
                    </div>
                </div>

                <button
                    onClick={requestRide}
                    disabled={!pickup || !dropoff || rideStatus === 'requested' || loading}
                    style={{ padding: '12px', fontSize: '16px', background: '#28a745', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', opacity: (loading || !pickup || !dropoff || rideStatus === 'requested') ? 0.6 : 1 }}
                >
                    {loading ? 'Solicitando...' : 'Solicitar Corrida'}
                </button>
            </div>

            {/* Map */}
            <div style={{ flex: 1, position: 'relative' }}>
                <Map
                    center={currentLocation || defaultCenter}
                    markers={markers}
                    onMapClick={handleMapClick}
                    height="100%"
                    currentLocation={currentLocation}
                    route={routeCoords} // Enviando a rota para o mapa desenhar
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