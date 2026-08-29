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
    routes?: Array<{
        coords: Array<[number, number]>;
        color?: string;
        weight?: number;
        opacity?: number;
    }>;
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
    routes = [],
    autoFit = false
}) => {
    const mapRef = useRef<HTMLDivElement>(null);
    const leafletMapRef = useRef<L.Map | null>(null);
    const markersRef = useRef<L.Marker[]>([]);
    const clickHandlerRef = useRef(onMapClick);
    const currentLocMarkerRef = useRef<L.Marker | null>(null);
    const userIconRef = useRef<L.DivIcon | null>(null);
    const routeLayerRef = useRef<L.Polyline | null>(null);
    const additionalRoutesRef = useRef<L.Polyline[]>([]);
    const isMountedRef = useRef(false);
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

        initialCenterSetRef.current = true;

        return () => {
            map.remove();
            leafletMapRef.current = null;
            isMountedRef.current = false;
        };
    }, []);

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

        if (markers.length > 0 && route.length === 0 && initialCenterSetRef.current) {
            const group = L.featureGroup(markersRef.current);
            map.fitBounds(group.getBounds(), { padding: [50, 50] });
            initialCenterSetRef.current = false;
        }
    }, [markers, route.length]);

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

    useEffect(() => {
        const map = leafletMapRef.current;
        if (!map) return;

        // Remove rota principal
        if (routeLayerRef.current) {
            map.removeLayer(routeLayerRef.current);
            routeLayerRef.current = null;
        }

        // Remove rotas adicionais
        additionalRoutesRef.current.forEach(layer => map.removeLayer(layer));
        additionalRoutesRef.current = [];

        // Desenha rota principal
        if (route && route.length > 1) {
            const polyline = L.polyline(route, { color: '#007bff', weight: 5, opacity: 0.8 }).addTo(map);
            routeLayerRef.current = polyline;
            if (autoFit) {
                map.fitBounds(polyline.getBounds(), { padding: [50, 50] });
            }
        }

        // Desenha rotas adicionais
        if (routes && routes.length > 0) {
            routes.forEach((r) => {
                if (r.coords && r.coords.length > 1) {
                    const polyline = L.polyline(r.coords, {
                        color: r.color || '#ff0000',
                        weight: r.weight || 4,
                        opacity: r.opacity || 0.7,
                        dashArray: '5, 5'
                    }).addTo(map);
                    additionalRoutesRef.current.push(polyline);
                }
            });
        }
    }, [route, routes, autoFit]);

    return <div ref={mapRef} style={{ height, width: '100%' }} />;
};