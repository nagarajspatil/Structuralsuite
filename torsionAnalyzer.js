/**
 * Torsion Analyzer – Circular & Civil Structural Cross-Sections
 * Ported & expanded for Civil & Structural Engineering Analysis
 *
 * Supported Sections:
 *  1. Solid Circular ('solid')     – Round column, pile shaft, tendon
 *  2. Hollow Circular ('hollow')   – Steel pipe pile, tubular pier, offshore jacket
 *  3. Solid Rectangle ('rectangle')– Reinforced concrete beam, spandrel, lintel
 *  4. Hollow Box Girder ('box')    – Bridge superstructure, metro viaduct, HSS tube
 *  5. Structural Steel I-Beam ('ibeam') – ISMB, wide-flange beam, open steel girder
 *
 * Units: kN·m for torque, m for length, mm for dimensions, GPa for G, MPa for stress, rad/deg for twist
 */

export const MATERIAL_PRESETS = {
  'Structural Steel (75-80 GPa)': 79.3,
  'Concrete M25/M30 (10-15 GPa)': 12.0,
  'High-Strength Concrete (15-18 GPa)': 15.0,
  'Aluminum Alloy (25-28 GPa)': 26.0,
  'Structural Timber (0.8-1.5 GPa)': 1.0,
  'Titanium Alloy (40-45 GPa)': 44.0,
  'Copper (40-48 GPa)': 44.0,
  'Bronze/Brass (35-40 GPa)': 38.0,
  'Custom': 79.3,
};

/**
 * Validate and clamp shear modulus to real-world range [0.5, 150] GPa.
 * @param {number} G_GPa
 * @returns {{ G_GPa: number, warning: string|null }}
 */
export function validateShearModulus(G_GPa) {
  if (G_GPa < 0.5 || G_GPa > 150) {
    const clamped = Math.min(Math.max(G_GPa, 0.5), 150);
    return {
      G_GPa: clamped,
      warning: `Shear Modulus G must be between 0.5 GPa and 150.0 GPa for structural materials. Value clamped to ${clamped} GPa.`,
    };
  }
  return { G_GPa, warning: null };
}

/**
 * Compute torsion parameters for circular and civil structural cross-sections.
 *
 * Signature:
 *  analyzeTorsion(shapeType, T_kNm, L_m, G_GPa, p1, p2, p3, p4)
 *  or analyzeTorsion(shapeType, T_kNm, L_m, G_GPa, dimObject)
 *
 * Parameters per shapeType:
 *  - 'solid':     p1 = do_mm
 *  - 'hollow':    p1 = do_mm, p2 = di_mm
 *  - 'rectangle': p1 = b_mm (width), p2 = h_mm (depth)
 *  - 'box':       p1 = B_mm, p2 = H_mm, p3 = tw_mm, p4 = tf_mm
 *  - 'ibeam':     p1 = d_mm, p2 = bf_mm, p3 = tf_mm, p4 = tw_mm
 *
 * @returns {object} results
 */
export function analyzeTorsion(shapeType, T_kNm, L_m, G_GPa, p1, p2 = 0, p3 = 0, p4 = 0) {
  const errors = [];
  if (T_kNm === undefined || isNaN(T_kNm)) errors.push('Torque must be a valid number.');
  if (L_m <= 0 || isNaN(L_m)) errors.push('Length must be greater than 0 m.');
  if (G_GPa <= 0 || isNaN(G_GPa)) errors.push('Shear Modulus G must be greater than 0 GPa.');

  const type = shapeType || 'solid';

  // Extract dimensions
  let dims = {};
  if (typeof p1 === 'object' && p1 !== null) {
    dims = { ...p1 };
  } else {
    if (type === 'solid') {
      dims = { do: p1, di: 0 };
    } else if (type === 'hollow') {
      dims = { do: p1, di: p2 };
    } else if (type === 'rectangle') {
      dims = { b: p1, h: p2 };
    } else if (type === 'box') {
      dims = { B: p1, H: p2, tw: p3, tf: p4 };
    } else if (type === 'ibeam') {
      dims = { d: p1, bf: p2, tf: p3, tw: p4 };
    }
  }

  // SI conversions
  const T = T_kNm * 1e3;    // N·m
  const L = L_m;             // m
  const G = G_GPa * 1e9;     // Pa

  let J = 0;                 // m⁴
  let tauMax = 0;            // MPa
  let tauMin = null;         // MPa
  let tauWeb = null;         // MPa
  let tauFlange = null;      // MPa
  let shearFlow = null;      // kN/m
  let shapeName = '';
  let civilContext = '';
  let rPlot_mm = [];
  let tauPlot = [];
  let plotTitle = '';
  let plotXTitle = '';
  let geom = {};

  const nPts = 100;

  if (type === 'solid' || type === 'hollow') {
    const do_mm = dims.do !== undefined ? Number(dims.do) : 100;
    const di_mm = type === 'hollow' ? (dims.di !== undefined ? Number(dims.di) : 60) : 0;

    if (do_mm <= 0) errors.push('Outer diameter must be greater than 0 mm.');
    if (type === 'hollow') {
      if (di_mm <= 0) errors.push('Inner diameter must be greater than 0 mm for hollow shafts.');
      if (di_mm >= do_mm) errors.push('Inner diameter must be strictly less than outer diameter.');
    }
    if (errors.length) throw new Error(errors.join('\n'));

    const do_ = do_mm / 1e3;
    const di = di_mm / 1e3;
    const ro = do_ / 2;
    const ri = di / 2;

    J = (Math.PI / 32) * (do_ ** 4 - di ** 4);
    tauMax = (T * ro / J) / 1e6;
    tauMin = type === 'hollow' ? (T * ri / J) / 1e6 : 0;

    const rVals = [];
    if (type === 'hollow') {
      for (let i = 0; i < nPts; i++) rVals.push(ri + (ro - ri) * i / (nPts - 1));
    } else {
      for (let i = 0; i < nPts; i++) rVals.push(ro * i / (nPts - 1));
    }

    const tauVals = rVals.map(r => (T * r / J) / 1e6);
    rPlot_mm = [...rVals.slice().reverse().map(r => -r * 1e3), ...rVals.map(r => r * 1e3)];
    tauPlot = [...tauVals.slice().reverse().map(v => -v), ...tauVals];

    shapeName = type === 'solid' ? 'Solid Circular Shaft' : 'Hollow Circular Pipe / Pile';
    plotTitle = 'Shear Stress Distribution Across Diameter';
    plotXTitle = 'Radial Position r (mm)';
    civilContext = type === 'solid'
      ? 'Coulomb pure torsion: Plane sections remain plane without warping. Shear stress increases linearly from zero at center to maximum at outer perimeter. Standard for piles, round columns, and tendons.'
      : 'Hollow circular tube: Removes low-stressed core material while retaining maximum polar moment of inertia J. Highly efficient for steel pipe piles, offshore tubulars, and bridge piers.';

    geom = {
      do_mm, di_mm, ro_mm: ro * 1e3, ri_mm: ri * 1e3,
      isHollow: type === 'hollow',
    };

  } else if (type === 'rectangle') {
    const b_mm = dims.b !== undefined ? Number(dims.b) : 250;
    const h_mm = dims.h !== undefined ? Number(dims.h) : 450;

    if (b_mm <= 0) errors.push('Beam width b must be greater than 0 mm.');
    if (h_mm <= 0) errors.push('Beam depth h must be greater than 0 mm.');
    if (errors.length) throw new Error(errors.join('\n'));

    const b = b_mm / 1e3;
    const h = h_mm / 1e3;
    const w = Math.min(b, h); // shorter side (m)
    const d = Math.max(b, h); // longer side (m)
    const ratio = d / w;

    // St. Venant's Torsional Constant for solid rectangular section:
    // J = d * w³ * [ 1/3 - 0.21*(w/d)*(1 - w⁴/(12*d⁴)) ]
    J = d * (w ** 3) * (1 / 3 - 0.21 * (w / d) * (1 - (w ** 4) / (12 * (d ** 4))));

    // Maximum shear stress at midpoint of longer face:
    // tau_max = T * (3d + 1.8w) / (w² * d²)
    tauMax = (T * (3 * d + 1.8 * w) / ((w ** 2) * (d ** 2))) / 1e6;

    // Shear stress at midpoint of shorter face:
    const tauMidShort = tauMax * (w / d) * (0.742 + 0.258 * (w / d));
    tauMin = tauMidShort;

    // Plot across the longer dimension (-d/2 to +d/2)
    const halfD_mm = (d / 2) * 1e3;
    const xVals = [];
    const yVals = [];
    for (let i = 0; i <= nPts; i++) {
      const pos = -halfD_mm + (2 * halfD_mm * i) / nPts;
      xVals.push(pos);
      // Parabolic-like elasticity stress profile rising to tauMax at edges
      const norm = Math.abs(pos) / halfD_mm;
      yVals.push(tauMax * norm * (Math.sign(pos) || 1));
    }
    rPlot_mm = xVals;
    tauPlot = yVals;

    shapeName = 'Solid Rectangular Beam (RC Beam / Spandrel)';
    plotTitle = 'Shear Stress Distribution Along Major Axis';
    plotXTitle = 'Position Along Centerline (mm)';
    civilContext = 'St. Venant Warping Torsion: Cross-sections warp out of plane. Crucial civil engineering fact: Shear stress is ZERO at all 4 corners! Maximum shear stress occurs at the midpoint of the wider face. Governs torsional shear reinforcement (closed stirrups & longitudinal steel per IS 456 / ACI 318).';

    geom = {
      b_mm, h_mm, w_mm: w * 1e3, d_mm: d * 1e3, ratio,
      tauMidShort,
    };

  } else if (type === 'box') {
    const B_mm = dims.B !== undefined ? Number(dims.B) : 600;
    const H_mm = dims.H !== undefined ? Number(dims.H) : 400;
    const tw_mm = dims.tw !== undefined ? Number(dims.tw) : 40;
    const tf_mm = dims.tf !== undefined ? Number(dims.tf) : 40;

    if (B_mm <= 0 || H_mm <= 0) errors.push('Outer width B and depth H must be greater than 0 mm.');
    if (tw_mm <= 0 || tf_mm <= 0) errors.push('Wall thicknesses tw and tf must be greater than 0 mm.');
    if (2 * tw_mm >= B_mm) errors.push('Total web thickness (2 × tw) must be strictly less than outer width B.');
    if (2 * tf_mm >= H_mm) errors.push('Total flange thickness (2 × tf) must be strictly less than outer depth H.');
    if (errors.length) throw new Error(errors.join('\n'));

    const B = B_mm / 1e3;
    const H = H_mm / 1e3;
    const tw = tw_mm / 1e3;
    const tf = tf_mm / 1e3;

    // Bredt's Thin-Walled Closed Section Theory
    const bMid = B - tw;
    const hMid = H - tf;
    const Am = bMid * hMid; // enclosed mean area (m²)
    const ds_t = 2 * (bMid / tf + hMid / tw); // contour integral ∮ ds/t

    J = (4 * (Am ** 2)) / ds_t;
    const q = T / (2 * Am); // shear flow (N/m)
    shearFlow = q / 1e3;     // kN/m

    tauWeb = (q / tw) / 1e6;       // MPa
    tauFlange = (q / tf) / 1e6;    // MPa
    tauMax = Math.max(tauWeb, tauFlange);
    tauMin = Math.min(tauWeb, tauFlange);

    // Plot: shear stress profile around the centerline perimeter
    const perim_mm = 2 * (bMid + hMid) * 1e3;
    const xVals = [];
    const yVals = [];
    const segs = [
      { name: 'Bottom Flange', len: bMid * 1e3, tau: tauFlange },
      { name: 'Right Web',     len: hMid * 1e3, tau: tauWeb },
      { name: 'Top Flange',    len: bMid * 1e3, tau: tauFlange },
      { name: 'Left Web',      len: hMid * 1e3, tau: tauWeb },
    ];
    let curr = 0;
    for (const seg of segs) {
      xVals.push(curr, curr + seg.len);
      yVals.push(seg.tau, seg.tau);
      curr += seg.len;
    }
    rPlot_mm = xVals;
    tauPlot = yVals;

    shapeName = 'Hollow Box Girder (Bridge Superstructure / Metro / HSS)';
    plotTitle = 'Shear Stress Distribution Around Box Perimeter (Bredt Theory)';
    plotXTitle = 'Perimeter Coordinate s (mm)';
    civilContext = 'Bredt-Batho Closed Tube Theory: The definitive civil bridge section! The continuous closed cell generates uniform shear flow q = T/(2Am). Its torsional rigidity J is thousands of times higher than open steel girders, making it the premier choice for curved flyovers and metro viaducts.';

    geom = {
      B_mm, H_mm, tw_mm, tf_mm,
      bMid_mm: bMid * 1e3, hMid_mm: hMid * 1e3,
      Am_m2: Am,
    };

  } else if (type === 'ibeam') {
    const d_mm = dims.d !== undefined ? Number(dims.d) : 300;
    const bf_mm = dims.bf !== undefined ? Number(dims.bf) : 150;
    const tf_mm = dims.tf !== undefined ? Number(dims.tf) : 12;
    const tw_mm = dims.tw !== undefined ? Number(dims.tw) : 8;

    if (d_mm <= 0 || bf_mm <= 0) errors.push('Beam depth d and flange width bf must be greater than 0 mm.');
    if (tf_mm <= 0 || tw_mm <= 0) errors.push('Flange and web thicknesses must be greater than 0 mm.');
    if (2 * tf_mm >= d_mm) errors.push('Total flange thickness (2 × tf) must be strictly less than depth d.');
    if (errors.length) throw new Error(errors.join('\n'));

    const d = d_mm / 1e3;
    const bf = bf_mm / 1e3;
    const tf = tf_mm / 1e3;
    const tw = tw_mm / 1e3;
    const hw = d - 2 * tf; // clear web height (m)

    // St. Venant Torsion for Open Thin-Walled Section:
    // J = (1/3) * sum(bi * ti³) = (1/3) * [ 2 * bf * tf³ + hw * tw³ ]
    J = (1 / 3) * (2 * bf * (tf ** 3) + hw * (tw ** 3));

    const tMax = Math.max(tf, tw);
    tauMax = (T * tMax / J) / 1e6;      // MPa
    tauFlange = (T * tf / J) / 1e6;    // MPa
    tauWeb = (T * tw / J) / 1e6;       // MPa
    tauMin = Math.min(tauFlange, tauWeb);

    // Plot across the thicker flange thickness: linear stress from -tauFlange to +tauFlange
    const halfTf = (tf / 2) * 1e3;
    const xVals = [];
    const yVals = [];
    for (let i = 0; i <= nPts; i++) {
      const pos = -halfTf + (2 * halfTf * i) / nPts;
      xVals.push(pos);
      yVals.push(tauFlange * (pos / halfTf));
    }
    rPlot_mm = xVals;
    tauPlot = yVals;

    shapeName = 'Structural Steel I-Beam (Wide Flange / ISMB)';
    plotTitle = 'Linear Shear Stress Profile Across Flange Thickness';
    plotXTitle = 'Through-Thickness Position (mm)';
    civilContext = 'Open Thin-Walled Section: Flanges and web twist as uncoupled flat narrow strips (J = 1/3 Σ bi ti³). Has negligible torsional stiffness compared to box girders (thousands of times smaller J), making Lateral-Torsional Buckling (LTB) a governing design check in steel structures (IS 800 / AISC 360).';

    geom = {
      d_mm, bf_mm, tf_mm, tw_mm, hw_mm: hw * 1e3,
    };
  } else {
    throw new Error(`Unknown shaft cross-section type: ${type}`);
  }

  // Torsional deformation & stiffness
  const thetaRad = (T * L) / (G * J);
  const thetaDeg = thetaRad * (180 / Math.PI);
  const torsionalStiffness = (G * J / L) / 1e3; // kN·m/rad

  return {
    shapeType: type,
    shapeName,
    civilContext,
    J_mm4: J * 1e12,
    J_m4: J,
    tauMax,
    tauMin,
    tauWeb,
    tauFlange,
    shearFlow_kNm: shearFlow,
    thetaRad,
    thetaDeg,
    torsionalStiffness,
    rPlot_mm,
    tauPlot,
    plotTitle,
    plotXTitle,
    ro_mm: geom.ro_mm || 0,
    ri_mm: geom.ri_mm || 0,
    isHollow: geom.isHollow || false,
    geom,
  };
}
