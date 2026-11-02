import { useCallback, useEffect, useRef } from 'react';
import { parsePoint } from '../services/geo';

function cleanPoints(points) {
  return (points || []).map((point) => {
    const parsed = parsePoint(point?.latitude, point?.longitude);
    if (!parsed) return null;
    return { ...parsed, title: String(point?.title || '').slice(0, 180) };
  }).filter(Boolean);
}

export function useMapBridge({ mapId, points, onPick, post }) {
  const pointsRef = useRef(points);
  const onPickRef = useRef(onPick);
  const postRef = useRef(post);
  pointsRef.current = points;
  onPickRef.current = onPick;
  postRef.current = post;

  const sendPoints = useCallback(() => {
    const message = JSON.stringify({ type: 'dhaara-set', mapId, points: cleanPoints(pointsRef.current) });
    postRef.current?.(message);
  }, [mapId]);

  const handleRaw = useCallback((raw) => {
    let data = raw;
    if (typeof raw === 'string') {
      try { data = JSON.parse(raw); } catch { return; }
    }
    if (!data || data.mapId !== mapId) return;
    if (data.type === 'dhaara-ready') sendPoints();
    if (data.type === 'dhaara-map' && onPickRef.current) {
      const point = parsePoint(data.latitude, data.longitude);
      if (point) onPickRef.current(point);
    }
  }, [mapId, sendPoints]);

  const pointsKey = JSON.stringify(cleanPoints(points));
  useEffect(() => { sendPoints(); }, [pointsKey, sendPoints]);

  return { sendPoints, handleRaw };
}
