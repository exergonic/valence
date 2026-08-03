export function vecSub(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function vecDot(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function crossProduct(
  a: [number, number, number],
  b: [number, number, number],
): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function vecNormalize(v: [number, number, number]): [number, number, number] {
  const len = Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
  if (len < 1e-8) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

// Removes the component of v along axis (Gram-Schmidt projection).
export function projectPerpendicular(
  v: [number, number, number],
  axis: [number, number, number],
): [number, number, number] {
  const d = vecDot(v, axis);
  return [v[0] - axis[0] * d, v[1] - axis[1] * d, v[2] - axis[2] * d];
}

export function findPerpendicular(v: [number, number, number]): [number, number, number] {
  const absX = Math.abs(v[0]);
  const absY = Math.abs(v[1]);
  const absZ = Math.abs(v[2]);

  if (absX <= absY && absX <= absZ) {
    return crossProduct(v, [1, 0, 0]);
  } else if (absY <= absX && absY <= absZ) {
    return crossProduct(v, [0, 1, 0]);
  }
  return crossProduct(v, [0, 0, 1]);
}

// Rodrigues rotation of v around axis by angle given via cos/sin.
export function rotateRodrigues(
  v: [number, number, number],
  axis: [number, number, number],
  cosA: number,
  sinA: number,
): [number, number, number] {
  const dot = vecDot(v, axis);
  const cross: [number, number, number] = [
    axis[1] * v[2] - axis[2] * v[1],
    axis[2] * v[0] - axis[0] * v[2],
    axis[0] * v[1] - axis[1] * v[0],
  ];
  return [
    v[0] * cosA + cross[0] * sinA + axis[0] * dot * (1 - cosA),
    v[1] * cosA + cross[1] * sinA + axis[1] * dot * (1 - cosA),
    v[2] * cosA + cross[2] * sinA + axis[2] * dot * (1 - cosA),
  ];
}

// Rotates v so the direction `from` lands on `to` (v rotates with it).
export function rotateToward(
  v: [number, number, number],
  from: [number, number, number],
  to: [number, number, number],
): [number, number, number] {
  const dot = vecDot(from, to);
  if (Math.abs(dot - 1) < 1e-6) return v;
  if (Math.abs(dot + 1) < 1e-6) return [-v[0], -v[1], -v[2]];

  const axis = vecNormalize([
    from[1] * to[2] - from[2] * to[1],
    from[2] * to[0] - from[0] * to[2],
    from[0] * to[1] - from[1] * to[0],
  ]);
  return rotateRodrigues(v, axis, dot, Math.sqrt(1 - dot * dot));
}
