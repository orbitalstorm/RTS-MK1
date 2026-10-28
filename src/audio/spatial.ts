export interface SpatialAudioParams {
  pan: number; // -1.0 (left) to +1.0 (right)
  gainMultiplier: number; // 0.0 to 1.0 distance attenuation
}

/**
 * Computes stereo panning and distance attenuation relative to the tactical camera center.
 */
export function computeCameraSpatialParams(
  eventTileX: number,
  eventTileY: number,
  cameraCenterTileX: number,
  cameraCenterTileY: number,
  maxAudibleTileDistance = 26
): SpatialAudioParams {
  const dx = eventTileX - cameraCenterTileX;
  const dy = eventTileY - cameraCenterTileY;
  const distance = Math.hypot(dx, dy);

  if (distance >= maxAudibleTileDistance) {
    return { pan: 0, gainMultiplier: 0 };
  }

  const normalizedPan = Math.max(-0.9, Math.min(0.9, dx / 14));
  const attenuation = Math.max(0, 1 - distance / maxAudibleTileDistance);
  const gainMultiplier = Number((attenuation * attenuation).toFixed(3));

  return {
    pan: Number(normalizedPan.toFixed(3)),
    gainMultiplier,
  };
}
