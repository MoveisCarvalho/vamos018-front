import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Corrigir ícones do Leaflet no Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface MapProps {
    center: [number, number];
    zoom?: number;
    markers?: Array<{ lat: number; lng: number; label?: string }>;
    onMapClick?: (lat: number, lng: number) => void;
    height?: string;
    currentLocation?: [number, number] | null;
    route?: Array<[number, number]>;
    /** Se true, centraliza o mapa na localização atual ou no centro sempre que mudar (apenas para passageiro com rota) */
    autoFit?: boolean;
}

export const Map: React.FC<MapProps> = ({
    center,
    zoom = 15,
    markers = [],
    onMapClick,
    height = '400px',
    currentLocation,
    route = [],
    autoFit = false
}) => {
    const mapRef = useRef<HTMLDivElement>(null);
    const leafletMapRef = useRef<L.Map | null>(null);
    const markersRef = useRef<L.Marker[]>([]);
    const clickHandlerRef = useRef(onMapClick);
    const currentLocMarkerRef = useRef<L.Marker | null>(null);
    const userIconRef = useRef<L.DivIcon | null>(null);
    const routeLayerRef = useRef<L.Polyline | null>(null);
    const isMountedRef = useRef(false);
    const lastRouteHashRef = useRef<string>('');
    const initialCenterSetRef = useRef(false);

    useEffect(() => {
        clickHandlerRef.current = onMapClick;
    }, [onMapClick]);

    useEffect(() => {
        userIconRef.current = L.divIcon({
            className: 'custom-user-marker',
            html: '<div style="background-color: #007bff; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4);"></div>',
            iconSize: [22, 22],
            iconAnchor: [11, 11]
        });
    }, []);

    // Inicialização do mapa (uma única vez)
    useEffect(() => {
        if (!mapRef.current || leafletMapRef.current) return;

        const map = L.map(mapRef.current).setView(center, zoom);
        leafletMapRef.current = map;
        isMountedRef.current = true;

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        map.on('click', (e) => {
            if (clickHandlerRef.current) {
                clickHandlerRef.current(e.latlng.lat, e.latlng.lng);
            }
        });

        // Centraliza no centro inicial após carregar
        initialCenterSetRef.current = true;

        return () => {
            map.remove();
            leafletMapRef.current = null;
            isMountedRef.current = false;
        };
    }, []);

    // Atualizar marcadores de endereços
    useEffect(() => {
        const map = leafletMapRef.current;
        if (!map) return;

        markersRef.current.forEach(m => m.remove());
        markersRef.current = [];

        markers.forEach(({ lat, lng, label }) => {
            const marker = L.marker([lat, lng]).addTo(map);
            if (label) {
                marker.bindPopup(label);
            }
            markersRef.current.push(marker);
        });

        // Ajustar bounds apenas se houver marcadores e não houver rota,
        // e se for a primeira vez ou se o usuário não tiver interagido
        if (markers.length > 0 && route.length === 0 && initialCenterSetRef.current) {
            const group = L.featureGroup(markersRef.current);
            map.fitBounds(group.getBounds(), { padding: [50, 50] });
            initialCenterSetRef.current = false; // evita repetir
        }
    }, [markers, route.length]);

    // Atualizar marcador de localização atual (sem mexer na view)
    useEffect(() => {
        const map = leafletMapRef.current;
        if (!map || !currentLocation) return;

        if (currentLocMarkerRef.current) {
            currentLocMarkerRef.current.setLatLng(currentLocation);
        } else if (userIconRef.current) {
            currentLocMarkerRef.current = L.marker(currentLocation, { icon: userIconRef.current }).addTo(map);
            currentLocMarkerRef.current.bindPopup('Você está aqui');
        }
    }, [currentLocation]);

    // Desenhar rota e ajustar bounds (apenas se autoFit for true)
    useEffect(() => {
        const map = leafletMapRef.current;
        if (!map) return;

        const routeHash = route.map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join('|');
        if (routeHash === lastRouteHashRef.current) return;
        lastRouteHashRef.current = routeHash;

        if (routeLayerRef.current) {
            map.removeLayer(routeLayerRef.current);
            routeLayerRef.current = null;
        }

        if (route && route.length > 1) {
            const polyline = L.polyline(route, { color: '#007bff', weight: 5, opacity: 0.8 }).addTo(map);
            routeLayerRef.current = polyline;

            // Ajusta o mapa para mostrar a rota inteira apenas se autoFit for true
            if (autoFit) {
                map.fitBounds(polyline.getBounds(), { padding: [50, 50] });
            }
        }
    }, [route, autoFit]);

    // Centralização manual (expor método para o pai, mas não automática)
    // O pai pode usar uma ref ou função para chamar map.setView

    return <div ref={mapRef} style={{ height, width: '100%' }} />;
};