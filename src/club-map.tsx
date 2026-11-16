import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CircleMarker, GeoJSON, MapContainer, Tooltip, useMap } from 'react-leaflet';
import { geoJSON, latLngBounds, type Map as LeafletMap } from 'leaflet';
import type { Feature, FeatureCollection } from 'geojson';
import 'leaflet/dist/leaflet.css';
import { api } from './api';
import { ErrorMessage } from './components';
import type { ClubMarker } from '../shared/club-network';

function iso(feature?: Feature): string {
  return [feature?.properties?.ISO_A2_EH, feature?.properties?.ISO_A2]
    .find(value => typeof value === 'string' && /^[A-Z]{2}$/.test(value)) ?? '';
}

function View({ boundaries, countryCode, region, markers }: {
  boundaries: FeatureCollection; countryCode?: string; region: boolean; markers: ClubMarker[];
}) {
  const map = useMap();
  useEffect(() => {
    const country = boundaries.features.find(feature => iso(feature) === countryCode);
    if (region && markers.length) {
      map.fitBounds(latLngBounds(markers.map(marker => [marker.lat, marker.lng])), { padding: [30, 30], maxZoom: 8, animate: false });
    } else if (country) {
      const bounds = geoJSON(country).getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 6, animate: false });
    } else {
      map.setView([20, 0], 1, { animate: false });
    }
  }, [map, boundaries, countryCode, region, markers]);
  return null;
}

export default function ClubMap({ countryCode, region, markers, onCountry, onClub }: {
  countryCode?: string; region: boolean; markers: ClubMarker[];
  onCountry: (code: string, name: string) => void; onClub: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const mapRef = useRef<LeafletMap>(null);
  const countryClick = useRef(onCountry);
  useEffect(() => { countryClick.current = onCountry; }, [onCountry]);
  const boundaries = useQuery({
    queryKey: ['natural-earth-boundaries'], staleTime: Infinity,
    queryFn: () => api<FeatureCollection>('/geo/ne_110m_admin_0_countries.geojson'),
  });
  if (boundaries.isError) return <ErrorMessage />;
  if (!boundaries.data) return <p role="status">{t('loading')}</p>;
  return <section className="panel overflow-hidden">
    <div className="panel-header gap-3">
      <h2>{t('clubMap')}</h2>
      <div className="flex gap-2">
        <button className="icon-button" aria-label={t('clubZoomIn')} onClick={() => mapRef.current?.zoomIn()}>+</button>
        <button className="icon-button" aria-label={t('clubZoomOut')} onClick={() => mapRef.current?.zoomOut()}>−</button>
      </div>
    </div>
    <p className="muted text-sm px-4 py-2">{t('clubMapHint')}</p>
    <div aria-hidden="true">
      <MapContainer ref={mapRef} className="club-map" center={[20, 0]} zoom={1} minZoom={1} maxZoom={12}
        keyboard={false} scrollWheelZoom={false} zoomControl={false} attributionControl={false}>
        <GeoJSON key={i18n.language} data={boundaries.data}
          style={feature => ({ color: '#6e8d9e', weight: 1, fillColor: countryCode && iso(feature) === countryCode ? '#4cb5a4' : '#385a71', fillOpacity: .82 })}
          onEachFeature={(feature, layer) => {
            const code = iso(feature);
            if (!code) return;
            const name = String(feature.properties?.[i18n.language === 'tr' ? 'NAME_TR' : 'NAME_EN'] || feature.properties?.NAME || code);
            const tooltip = document.createElement('span');
            tooltip.textContent = name;
            layer.bindTooltip(tooltip);
            layer.on('add', () => {
              if ('getElement' in layer && typeof layer.getElement === 'function') layer.getElement()?.setAttribute('data-country-code', code);
            });
            layer.on('click', () => countryClick.current(code, name));
          }} />
        <View boundaries={boundaries.data} countryCode={countryCode} region={region} markers={markers} />
        {markers.map(marker => <CircleMarker key={marker.id} center={[marker.lat, marker.lng]} radius={6}
          pathOptions={{ color: '#ffffff', fillColor: '#00867a', weight: 2, fillOpacity: 1, className: 'club-location-marker' }}
          eventHandlers={{ click: () => onClub(marker.id) }}><Tooltip>{marker.name}</Tooltip></CircleMarker>)}
      </MapContainer>
    </div>
    <div className="panel-body flex flex-wrap justify-between gap-3 text-xs muted">
      <span>{t('clubMapCount', { count: markers.length })}</span><span>{t('clubMapSource')}</span>
    </div>
  </section>;
}
