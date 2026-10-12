/**
 * Force System Analyzer - Pure Calculation Functions
 * Ported from Python reference code (force_analyzer.py)
 * Extended with Varignon's Theorem (position of resultant wrt Force 1)
 * Units: N for forces, m for positions, N·m for moments, degrees for angles
 */

/**
 * Compute components, moment contribution, running totals, and resultant position via Varignon's Theorem.
 * @param {Array<{mag: number, angle: number, x: number, y: number}>} forces
 * @returns {object} results object with per-force details, totals, and Varignon position wrt Force 1
 */
export function analyzeForces(forces) {
  let sumFx = 0, sumFy = 0, sumM = 0;
  const details = [];

  for (let i = 0; i < forces.length; i++) {
    const { mag, angle, x, y } = forces[i];
    const rad = (angle * Math.PI) / 180;
    const fx = mag * Math.cos(rad);
    const fy = mag * Math.sin(rad);
    const momentContrib = x * fy - y * fx;  // M = x*Fy - y*Fx (about origin)
    sumFx += fx;
    sumFy += fy;
    sumM += momentContrib;

    details.push({
      index: i + 1,
      mag, angle, x, y,
      fx, fy,
      momentContrib,
      runningMoment: sumM,
    });
  }

  // Resultant magnitude and angle
  const resMag = Math.sqrt(sumFx * sumFx + sumFy * sumFy);
  const resAngRad = Math.atan2(sumFy, sumFx);
  const resAngle = ((resAngRad * 180) / Math.PI + 360) % 360;

  // ── Varignon's Theorem with respect to Force 1 ──────────────────────────────
  // Let point A = (x1, y1) be the point of application of Force 1.
  // Varignon's Principle states that the moment of the resultant R about point A
  // equals the algebraic sum of the moments of all individual forces about point A:
  // M_A = sum_{i=1}^n [ (x_i - x_1)*F_yi - (y_i - y_1)*F_xi ]
  // Notice that for i = 1, (x_1 - x_1)*F_y1 - (y_1 - y_1)*F_x1 = 0 (Force 1 has 0 moment about A).
  // Also: M_A = M_O - (x_1 * sumFy - y_1 * sumFx)
  //
  // For the resultant R:
  // M_A = (x_R - x_1)*sumFy - (y_R - y_1)*sumFx = d_perp * |R|
  // 1. Perpendicular lever arm distance from A to the line of action of R:
  //    d_perp = |M_A| / |R|
  // 2. Intercepts along axes passing through A:
  //    Line of action equation relative to A: (x - x_1)*sumFy - (y - y_1)*sumFx = M_A
  //    - Relative x-intercept: delta_x = M_A / sumFy  (when y = y_1, i.e., horizontal line through A)
  //    - Relative y-intercept: delta_y = -M_A / sumFx (when x = x_1, i.e., vertical line through A)
  // 3. Closest point on the line of action of R to A:
  //    P_closest = (x_1 + (M_A * sumFy) / |R|^2, y_1 - (M_A * sumFx) / |R|^2)

  let varignon = null;
  if (forces.length > 0) {
    const f1 = forces[0];
    const x1 = f1.x;
    const y1 = f1.y;

    let sumMA = 0;
    for (let i = 0; i < details.length; i++) {
      const d = details[i];
      const mA_i = (d.x - x1) * d.fy - (d.y - y1) * d.fx;
      sumMA += mA_i;
    }

    if (resMag > 1e-9) {
      const dPerp = Math.abs(sumMA) / resMag;
      const signedD = sumMA / resMag; // positive if counterclockwise about A
      const deltaX = Math.abs(sumFy) > 1e-9 ? sumMA / sumFy : null;
      const deltaY = Math.abs(sumFx) > 1e-9 ? -sumMA / sumFx : null;
      const xInterceptRel = deltaX;
      const yInterceptRel = deltaY;
      const xInterceptAbs = deltaX !== null ? x1 + deltaX : null;
      const yInterceptAbs = deltaY !== null ? y1 + deltaY : null;

      // Closest point on the line of action of resultant to Force 1 application point
      const closestXRel = (sumMA * sumFy) / (resMag * resMag);
      const closestYRel = -(sumMA * sumFx) / (resMag * resMag);
      const closestX = x1 + closestXRel;
      const closestY = y1 + closestYRel;

      varignon = {
        pointA: { x: x1, y: y1 },
        sumMA,
        dPerp,
        signedD,
        deltaX,
        deltaY,
        xInterceptAbs,
        yInterceptAbs,
        closestX,
        closestY,
        closestXRel,
        closestYRel,
        isPureCouple: false,
      };
    } else {
      // Pure couple / pure moment (R = 0, but sumMA may be non-zero)
      varignon = {
        pointA: { x: x1, y: y1 },
        sumMA,
        dPerp: null,
        signedD: null,
        deltaX: null,
        deltaY: null,
        xInterceptAbs: null,
        yInterceptAbs: null,
        closestX: null,
        closestY: null,
        closestXRel: null,
        closestYRel: null,
        isPureCouple: true,
      };
    }
  }

  return {
    details,
    sumFx,
    sumFy,
    sumM,
    resMag,
    resAngle,
    varignon,
  };
}

/**
 * Compute quiver scale so the longest displayed arrow is ~35% of the plot range.
 * @param {number} maxForceLen  magnitude of longest force vector (data units)
 * @param {number} limit        half-width of the plot range
 * @returns {number} scale factor (data units per arrow unit)
 */
export function computeQuiverScale(maxForceLen, limit) {
  if (maxForceLen <= 0) return 1;
  const scale = maxForceLen / (0.35 * limit);
  return scale < 0.1 ? 1 : scale;
}

/**
 * Determine axis limits from all force application points and vector endpoints.
 * @param {object} result  output of analyzeForces()
 * @returns {number} limit (half-width)
 */
export function computePlotLimit(result) {
  const allX = [0], allY = [0];
  const maxForce = Math.max(...result.details.map(d => Math.hypot(d.fx, d.fy)), result.resMag, 1);
  // Estimate app points extent first
  for (const d of result.details) {
    allX.push(d.x);
    allY.push(d.y);
  }
  if (result.varignon && result.varignon.closestX !== null) {
    allX.push(result.varignon.closestX);
    allY.push(result.varignon.closestY);
  }
  const maxAppCoord = Math.max(...allX.map(Math.abs), ...allY.map(Math.abs), 2);
  // Arrow vectors will occupy around 30% of display limit with generous margin
  return Math.max(maxAppCoord * 1.6 + 2.0, 6);
}
