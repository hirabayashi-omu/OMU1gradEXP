/**
 * EIS Engine - Fuel Cell Electrochemical Impedance Calculation Engine
 * 
 * Implements comprehensive Fuel Cell AC impedance physics:
 * 1. Cable & Fixture Inductance: Z_L = j * omega * L
 * 2. Ohmic Resistance (Membrane, GDL, contact): Z_ohm = R_ohm
 * 3. 2-Terminal error resistance: Z_lead = 2 * R_lead (when in 2-wire mode)
 * 4. Anode Reaction (HOR): Z_anode = R_cta / (1 + (j * omega * C_dla)^n_a)
 * 5. Cathode Reaction (ORR): Z_cathode = R_ctc / (1 + (j * omega)^n_c * Q_c)
 * 6. Finite-length Warburg / Mass Transport (GDL Diffusion / Flooding):
 *    Z_w = R_w * tanh((j * omega * tau_w)^alpha_w) / (j * omega * tau_w)^alpha_w
 * 
 * Total Impedance:
 * Z_total(f) = Z_lead + Z_L + Z_ohm + Z_anode + (Z_cathode + Z_w)
 */

class Complex {
  constructor(re = 0, im = 0) {
    this.re = re;
    this.im = im;
  }

  static fromPolar(r, thetaRad) {
    return new Complex(r * Math.cos(thetaRad), r * Math.sin(thetaRad));
  }

  add(c) {
    return new Complex(this.re + c.re, this.im + c.im);
  }

  sub(c) {
    return new Complex(this.re - c.re, this.im - c.im);
  }

  mul(c) {
    if (typeof c === 'number') {
      return new Complex(this.re * c, this.im * c);
    }
    return new Complex(
      this.re * c.re - this.im * c.im,
      this.re * c.im + this.im * c.re
    );
  }

  div(c) {
    if (typeof c === 'number') {
      return new Complex(this.re / c, this.im / c);
    }
    const denom = c.re * c.re + c.im * c.im;
    if (denom === 0) return new Complex(1e12, 0);
    return new Complex(
      (this.re * c.re + this.im * c.im) / denom,
      (this.im * c.re - this.re * c.im) / denom
    );
  }

  magnitude() {
    return Math.sqrt(this.re * this.re + this.im * this.im);
  }

  phaseDeg() {
    return Math.atan2(this.im, this.re) * (180 / Math.PI);
  }

  phaseRad() {
    return Math.atan2(this.im, this.re);
  }

  pow(p) {
    const r = this.magnitude();
    if (r === 0) return new Complex(0, 0);
    const theta = this.phaseRad();
    const rNew = Math.pow(r, p);
    const thetaNew = theta * p;
    return new Complex(rNew * Math.cos(thetaNew), rNew * Math.sin(thetaNew));
  }

  // Complex tanh(z) = sinh(z) / cosh(z) with high-frequency numerical stability
  tanh() {
    const x = this.re;
    const y = this.im;
    
    // For large |x|, tanh(x + iy) -> sign(x)
    if (x > 20) return new Complex(1, 0);
    if (x < -20) return new Complex(-1, 0);

    const cosh2x = Math.cosh(2 * x);
    const cos2y = Math.cos(2 * y);
    const denom = cosh2x + cos2y;
    if (denom === 0 || !isFinite(denom)) return new Complex(1, 0);
    
    const reVal = Math.sinh(2 * x) / denom;
    const imVal = Math.sin(2 * y) / denom;
    return new Complex(
      isFinite(reVal) ? reVal : (x > 0 ? 1 : -1),
      isFinite(imVal) ? imVal : 0
    );
  }
}

class EISEngine {
  constructor(params = {}) {
    this.defaultParams = {
      // Measurement configuration
      mode: '4-terminal', // '4-terminal' or '2-terminal'
      targetCell: 'full', // 'full' (全セル), 'cathode' (カソード半電池), 'anode' (アノード半電池)
      rLead: 45.0,        // Lead & contact resistance in mOhm      // Inductive element (High frequency cable/cell geometry)
      lCable: 25.0,       // nH
      enableInductance: true,

      // Ohmic resistance (Electrolyte Membrane & Contact)
      rOhm: 30.0,         // mOhm
      enableROhm: true,

      // Anode charge transfer (HOR) & Mass Transport
      rCtAnode: 6.0,      // mOhm
      cDlAnode: 2500.0,   // uF
      enableAnode: true,
      enableWarburgAnode: false,
      rWarburgAnode: 0.0, // mOhm (改質ガス・希釈水素・アノードフラッディング時)
      tauWarburgAnode: 0.08, // seconds
      alphaWarburgAnode: 0.5,

      // Cathode charge transfer (ORR)
      rCtCathode: 110.0,  // mOhm
      qCathode: 18.0,     // mF*s^(n-1)
      nCathode: 0.88,     // CPE exponent
      enableCathode: true,

      // Mass transport / Warburg (Gas diffusion in GDL / Flooding)
      enableWarburg: true,
      rWarburg: 35.0,     // mOhm
      tauWarburg: 0.20,   // seconds
      alphaWarburg: 0.5,

      // Measurement Sweep settings
      fMin: 0.05,         // Hz
      fMax: 100000.0,     // Hz (100 kHz)
      pointsPerDecade: 10,// points per decade
      noiseLevel: 0.0,    // % Gaussian noise
      acAmplitude: 10.0,  // mV
    };

    this.params = Object.assign({}, this.defaultParams, params);

    // Initial baseline parameters (Normal operation reference)
    this.baselineParams = {
      mode: '4-terminal',
      targetCell: 'full',
      rLead: 45.0,
      lCable: 25.0,
      enableInductance: true,
      rOhm: 30.0,
      enableROhm: true,
      rCtAnode: 6.0,
      cDlAnode: 2500.0,
      enableAnode: true,
      enableWarburgAnode: false,
      rWarburgAnode: 0.0,
      tauWarburgAnode: 0.08,
      alphaWarburgAnode: 0.5,
      rCtCathode: 110.0,
      qCathode: 18.0,
      nCathode: 0.88,
      enableCathode: true,
      rWarburg: 35.0,
      tauWarburg: 0.20,
      alphaWarburg: 0.5,
      enableWarburg: true,
      noiseLevel: 0.0,
      fMin: 0.05,
      fMax: 100000.0,
      pointsPerDecade: 10
    };
  }

  setBaselineParams(params) {
    this.baselineParams = Object.assign({}, this.baselineParams, params);
  }

  setParams(newParams) {
    this.params = Object.assign({}, this.params, newParams);
  }

  getFrequencyList(customParams = null) {
    const p = customParams || this.params;
    const decMin = Math.log10(p.fMin);
    const decMax = Math.log10(p.fMax);
    const totalDecades = decMax - decMin;
    const totalPoints = Math.round(totalDecades * p.pointsPerDecade) + 1;
    
    const freqs = [];
    for (let i = 0; i < totalPoints; i++) {
      const logF = decMax - (i / (totalPoints - 1)) * totalDecades; // sweep from High to Low freq
      freqs.push(Math.pow(10, logF));
    }
    return freqs;
  }

  /**
   * Calculate impedance Z at a single frequency f (Hz)
   */
  calculateZ(f, addNoise = false) {
    const p = this.params;
    const omega = 2 * Math.PI * f;
    let Z_total = new Complex(0, 0);

    // 1. Lead resistance (2-terminal mode adds 2 * rLead)
    if (p.mode === '2-terminal') {
      const zLead = new Complex(p.rLead * 2.0, 0);
      Z_total = Z_total.add(zLead);
    }

    // 2. High frequency cable inductance (Z_L = j * omega * L)
    if (p.enableInductance !== false && p.lCable > 0) {
      const L_Henry = p.lCable * 1e-9;
      const xL_mOhm = omega * L_Henry * 1000.0;
      const zL = new Complex(0, xL_mOhm);
      Z_total = Z_total.add(zL);
    }

    // 3. Ohmic Resistance (Membrane + bulk) - In half-cell, reference electrode is at membrane midpoint
    if (p.enableROhm !== false && p.rOhm > 0) {
      const membraneFraction = p.targetCell === 'full' ? 1.0 : 0.5;
      const zOhm = new Complex(p.rOhm * membraneFraction, 0);
      Z_total = Z_total.add(zOhm);
    }

    // 4. Anode Reaction ((R_cta + Z_Wa) // C_dla) - included in Full-cell and Anode Half-cell
    const includeAnode = p.enableAnode !== false && (p.targetCell === 'full' || p.targetCell === 'anode');
    if (includeAnode) {
      let zFaradaicAnode = new Complex(p.rCtAnode || 0, 0);

      // Anode Warburg (Hydrogen mass transport / Reformate dilution / Starvation)
      if (p.enableWarburgAnode && p.rWarburgAnode > 0) {
        const jOmegaTauA = new Complex(0, omega * (p.tauWarburgAnode || 0.08));
        const sA = jOmegaTauA.pow(p.alphaWarburgAnode || 0.5);
        let zWa;
        if (sA.magnitude() < 1e-5) {
          zWa = new Complex(p.rWarburgAnode, 0);
        } else {
          const tanhSA = sA.tanh();
          zWa = tanhSA.div(sA).mul(p.rWarburgAnode);
        }
        zFaradaicAnode = zFaradaicAnode.add(zWa);
      }

      if (p.cDlAnode > 0 && zFaradaicAnode.magnitude() > 0) {
        const yFaradaic = new Complex(1, 0).div(zFaradaicAnode);
        const bAnode = omega * p.cDlAnode * 1e-6; // 1/mOhm
        const yAnodeTotal = new Complex(yFaradaic.re, yFaradaic.im + bAnode);
        const zAnode = new Complex(1, 0).div(yAnodeTotal);
        Z_total = Z_total.add(zAnode);
      } else if (zFaradaicAnode.magnitude() > 0) {
        Z_total = Z_total.add(zFaradaicAnode);
      }
    }

    // 5. Cathode Reaction (R_ctc // CPE_c) + Warburg - included in Full-cell and Cathode Half-cell
    const includeCathode = p.enableCathode !== false && (p.targetCell === 'full' || p.targetCell === 'cathode');
    if (includeCathode) {
      const jOmega = new Complex(0, omega);
      const jOmegaN = jOmega.pow(p.nCathode);
      const yCpe = jOmegaN.mul(p.qCathode * 1e-3); // Admittance in 1/mOhm
      const gCathode = 1.0 / p.rCtCathode;
      const yCathodeTotal = new Complex(gCathode + yCpe.re, yCpe.im);
      let zCathode = new Complex(1, 0).div(yCathodeTotal);

      // 6. Mass Transport / Finite-Length Warburg Impedance (Cathode GDL)
      if (p.enableWarburg !== false && p.rWarburg > 0) {
        const jOmegaTau = new Complex(0, omega * p.tauWarburg);
        const s = jOmegaTau.pow(p.alphaWarburg);
        let zW;
        if (s.magnitude() < 1e-5) {
          zW = new Complex(p.rWarburg, 0);
        } else {
          const tanhS = s.tanh();
          zW = tanhS.div(s).mul(p.rWarburg);
        }
        zCathode = zCathode.add(zW);
      }

      Z_total = Z_total.add(zCathode);
    } else if (p.enableWarburg !== false && p.rWarburg > 0 && (p.targetCell === 'full' || p.targetCell === 'cathode')) {
      // If Cathode charge transfer is OFF but Warburg is ON
      const jOmegaTau = new Complex(0, omega * p.tauWarburg);
      const s = jOmegaTau.pow(p.alphaWarburg);
      let zW = s.magnitude() < 1e-5 ? new Complex(p.rWarburg, 0) : s.tanh().div(s).mul(p.rWarburg);
      Z_total = Z_total.add(zW);
    }

    // Optional realistic measurement noise
    if (addNoise && p.noiseLevel > 0) {
      const noiseAmp = (p.noiseLevel / 100.0) * Z_total.magnitude();
      const u1 = Math.max(1e-6, Math.random());
      const u2 = Math.random();
      const randStd = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      const randStd2 = Math.sqrt(-2.0 * Math.log(u1)) * Math.sin(2.0 * Math.PI * u2);
      
      const lowFreqFactor = f < 0.5 ? Math.sqrt(0.5 / f) : 1.0;
      Z_total = new Complex(
        Z_total.re + randStd * noiseAmp * 0.7 * lowFreqFactor,
        Z_total.im + randStd2 * noiseAmp * 0.7 * lowFreqFactor
      );
    }

    return {
      f: f,
      omega: omega,
      zRe: Z_total.re,
      zIm: Z_total.im,
      negZIm: -Z_total.im,
      mag: Z_total.magnitude(),
      phase: Z_total.phaseDeg(),
      phaseRad: Z_total.phaseRad(),
      complex: Z_total
    };
  }

  /**
   * Calculate isolated theoretical component curves and geometric parameters for overlay
   */
  getTheoreticalComponents() {
    const p = this.params;
    const baseOffset = (p.mode === '2-terminal' ? p.rLead * 2.0 : 0) + (p.enableROhm !== false ? (p.targetCell === 'full' ? p.rOhm : p.rOhm * 0.5) : 0);

    // High-resolution log-frequency list for smooth theoretical arcs (from 10 MHz down to 0.001 Hz)
    const theoFreqs = [];
    const minLog = -4; // 1e-4 Hz (0.0001 Hz)
    const maxLog = 7;  // 1e7 Hz (10 MHz)
    const numPoints = 220;
    for (let i = 0; i <= numPoints; i++) {
      const logF = maxLog - (i / numPoints) * (maxLog - minLog);
      theoFreqs.push(Math.pow(10, logF));
    }

    // 1. Anode Isolated Arc (from baseOffset to baseOffset + R_cta + R_w,a)
    const anodeArc = [];
    const isAnodeActive = p.enableAnode !== false && p.targetCell !== 'cathode';
    const anodeWaR = (isAnodeActive && p.enableWarburgAnode) ? (p.rWarburgAnode || 0) : 0;
    const anodeTotalR = isAnodeActive ? ((p.rCtAnode || 0) + anodeWaR) : 0;
    
    if (isAnodeActive && anodeTotalR > 0) {
      for (const f of theoFreqs) {
        const omega = 2 * Math.PI * f;
        let zFaradaicA = new Complex(p.rCtAnode || 0, 0);
        if (p.enableWarburgAnode && p.rWarburgAnode > 0) {
          const jOmegaTauA = new Complex(0, omega * (p.tauWarburgAnode || 0.08));
          const sA = jOmegaTauA.pow(p.alphaWarburgAnode || 0.5);
          let zWa = sA.magnitude() < 1e-5 ? new Complex(p.rWarburgAnode, 0) : sA.tanh().div(sA).mul(p.rWarburgAnode);
          zFaradaicA = zFaradaicA.add(zWa);
        }

        let zAnode;
        if (p.cDlAnode > 0 && zFaradaicA.magnitude() > 0) {
          const yFaradaic = new Complex(1, 0).div(zFaradaicA);
          const bAnode = omega * p.cDlAnode * 1e-6;
          const yAnodeTotal = new Complex(yFaradaic.re, yFaradaic.im + bAnode);
          zAnode = new Complex(1, 0).div(yAnodeTotal);
        } else {
          zAnode = zFaradaicA;
        }

        anodeArc.push({
          f,
          zRe: baseOffset + zAnode.re,
          negZIm: -zAnode.im
        });
      }
    }

    // 2. Cathode Isolated CPE Arc (Depressed Semicircle Arc)
    const cathodeArc = [];
    const idealCathodeArc = []; // Ideal RC semicircle with n=1 for direct comparison
    const isCathodeActive = p.enableCathode !== false && p.rCtCathode > 0 && p.targetCell !== 'anode';
    const cathodeOffset = baseOffset + anodeTotalR;
    const rCtc = isCathodeActive ? p.rCtCathode : 0;
    const nC = p.nCathode || 0.88;
    const qC = (p.qCathode || 15.0) * 1e-3;

    // Peak frequency of Cathode CPE arc: omega_max = (1 / (R_ct * Q))^(1/n)
    let fApexCathode = 100;
    if (isCathodeActive && qC > 0) {
      const omegaMax = Math.pow(1.0 / (rCtc * qC), 1.0 / nC);
      fApexCathode = omegaMax / (2 * Math.PI);
    }

    // Depressed semicircle center & radius in Cole-Cole plane:
    // Angle of depression alpha = (1 - n) * pi / 2
    const alphaDepress = (1.0 - nC) * Math.PI / 2.0;
    const centerZRe = cathodeOffset + rCtc / 2.0;
    const centerNegZIm = -(rCtc / (2.0 * Math.tan(nC * Math.PI / 2.0))); // Center is below real axis (negative -Z'')
    const radiusDepress = rCtc / (2.0 * Math.sin(nC * Math.PI / 2.0));

    if (isCathodeActive) {
      for (const f of theoFreqs) {
        const omega = 2 * Math.PI * f;
        const jOmega = new Complex(0, omega);
        const jOmegaN = jOmega.pow(nC);
        const yCpe = jOmegaN.mul(qC);
        const gCathode = 1.0 / rCtc;
        const yCathodeTotal = new Complex(gCathode + yCpe.re, yCpe.im);
        const zCathode = new Complex(1, 0).div(yCathodeTotal);
        cathodeArc.push({
          f,
          zRe: cathodeOffset + zCathode.re,
          negZIm: -zCathode.im
        });

        // Ideal semicircle (n=1, same fApex or equivalent C)
        const cIdeal = qC; // equivalent capacity
        const bIdeal = omega * cIdeal;
        const yIdeal = new Complex(gCathode, bIdeal);
        const zIdeal = new Complex(1, 0).div(yIdeal);
        idealCathodeArc.push({
          f,
          zRe: cathodeOffset + zIdeal.re,
          negZIm: -zIdeal.im
        });
      }
    }

    // 3. Warburg Isolated Curve (starting after Cathode R_ctc)
    const warburgCurve = [];
    const isWarburgActive = p.enableWarburg !== false && p.rWarburg > 0 && p.targetCell !== 'anode';
    const warburgOffset = cathodeOffset + rCtc;
    if (isWarburgActive) {
      for (const f of theoFreqs) {
        const omega = 2 * Math.PI * f;
        const jOmegaTau = new Complex(0, omega * p.tauWarburg);
        const s = jOmegaTau.pow(p.alphaWarburg);
        let zW;
        if (s.magnitude() < 1e-5) {
          zW = new Complex(p.rWarburg, 0);
        } else {
          const tanhS = s.tanh();
          zW = tanhS.div(s).mul(p.rWarburg);
        }
        warburgCurve.push({
          f,
          zRe: warburgOffset + zW.re,
          negZIm: -zW.im
        });
      }
    }

    // 4. Inductance Line
    const inductanceLine = [];
    if (p.enableInductance !== false && p.lCable > 0) {
      for (const f of theoFreqs) {
        const omega = 2 * Math.PI * f;
        const zL_im = omega * p.lCable * 1e-6; // mOhm
        inductanceLine.push({
          f,
          zRe: baseOffset,
          negZIm: -zL_im // Negative on Nyquist (-Z'') means below real axis
        });
      }
    }

    return {
      baseOffset,
      cathodeOffset,
      warburgOffset,
      anodeArc,
      cathodeArc,
      idealCathodeArc,
      warburgCurve,
      inductanceLine,
      // Depressed semicircle geometry
      isCathodeActive,
      isAnodeActive,
      isWarburgActive,
      isAnodeWarburgActive: (isAnodeActive && p.enableWarburgAnode && p.rWarburgAnode > 0),
      fApexCathode,
      alphaDepressDeg: (alphaDepress * 180 / Math.PI),
      centerZRe,
      centerNegZIm,
      radiusDepress,
      nCathode: nC,
      rCtCathode: rCtc,
      rCtAnode: anodeTotalR,
      rCtAnodePure: p.rCtAnode,
      rWarburgAnode: anodeWaR,
      rWarburg: isWarburgActive ? p.rWarburg : 0
    };
  }

  /**
   * Compute complete EIS spectrum for arbitrary parameters
   */
  calculateSpectrumWithParams(customParams, addNoise = false) {
    const origParams = this.params;
    this.params = Object.assign({}, this.params, customParams);
    const freqs = this.getFrequencyList(this.params);
    const spec = freqs.map(f => this.calculateZ(f, addNoise));
    this.params = origParams;
    return spec;
  }

  /**
   * Compute baseline reference spectrum (e.g. Normal operation state)
   */
  calculateBaselineSpectrum() {
    return this.calculateSpectrumWithParams(this.baselineParams, false);
  }

  /**
   * Compute complete EIS spectrum for all sweep frequencies
   */
  calculateSpectrum(addNoise = false) {
    const freqs = this.getFrequencyList();
    return freqs.map(f => this.calculateZ(f, addNoise));
  }

  /**
   * Auto-extract key fuel cell EIS diagnostic metrics
   */
  analyzeSpectrum(spectrum) {
    if (!spectrum || spectrum.length === 0) return null;

    let minImDist = Infinity;
    let rOhmEst = spectrum[0].zRe;

    for (let i = 0; i < spectrum.length; i++) {
      const pt = spectrum[i];
      if (pt.f >= 500 && Math.abs(pt.zIm) < minImDist) {
        minImDist = Math.abs(pt.zIm);
        rOhmEst = pt.zRe;
      }
    }

    let maxNegZIm = -Infinity;
    let fApex = 100;

    for (let i = 0; i < spectrum.length; i++) {
      const pt = spectrum[i];
      if (pt.negZIm > maxNegZIm) {
        maxNegZIm = pt.negZIm;
        fApex = pt.f;
      }
    }

    const lowFreqPt = spectrum[spectrum.length - 1];
    const rTotalEst = lowFreqPt.zRe;
    const rPolEst = Math.max(0, rTotalEst - rOhmEst);

    const estimatedRct = Math.max(1, 2 * maxNegZIm);
    const estimatedCdl_uF = (1 / (2 * Math.PI * fApex * (estimatedRct * 1e-3))) * 1e6;

    let diagnosis = {
      membraneHealth: 'Good (正常・低抵抗)',
      catalystHealth: 'Active (高活性・良好)',
      massTransportHealth: 'Smooth (良好・フラッディングなし)',
      overallSeverity: 'normal',
      bulletPoints: []
    };

    if (rOhmEst > 60) {
      diagnosis.membraneHealth = 'High Resistance / Dehydrated (膜乾燥・高抵抗)';
      diagnosis.overallSeverity = 'warning';
      diagnosis.bulletPoints.push('オーム抵抗 R_Ω が著しく高くなっています。電解質膜の乾燥または接触不良が疑われます。');
    } else if (this.params.mode === '2-terminal') {
      diagnosis.membraneHealth = 'Lead Resistance Superimposed (2端子リード線抵抗重畳)';
      diagnosis.overallSeverity = 'info';
      diagnosis.bulletPoints.push('2端子測定モードのため、リード線・接触抵抗（約 ' + (this.params.rLead * 2).toFixed(1) + ' mΩ）が高周波切片に加算されています。');
    } else {
      diagnosis.bulletPoints.push('高周波切片 R_Ω ≈ ' + rOhmEst.toFixed(1) + ' mΩ (電解質膜プロトン伝導性・接触良好)');
    }

    if (this.params.rCtCathode > 250) {
      diagnosis.catalystHealth = 'Poisoned / Degraded (触媒劣化・CO被毒)';
      diagnosis.overallSeverity = 'danger';
      diagnosis.bulletPoints.push('電荷移動抵抗 R_ct が極めて大きく、カソード酸素還元反応（ORR）または触媒活性低下（被毒・劣化）が検知されます。');
    } else {
      diagnosis.bulletPoints.push('電荷移動抵抗 R_ct ≈ ' + this.params.rCtCathode.toFixed(1) + ' mΩ (反応活性良好, 緩和周波数 f_max ≈ ' + fApex.toFixed(1) + ' Hz)');
    }

    if (this.params.enableWarburg && this.params.rWarburg > 100) {
      diagnosis.massTransportHealth = 'Severe Flooding (深刻なフラッディング)';
      diagnosis.overallSeverity = 'danger';
      diagnosis.bulletPoints.push('低周波領域（< 1 Hz）に巨大なWarburg拡散円弧が出現しています。カソード生成水滞留（フラッディング）による酸素拡散阻害が推測されます。');
    } else if (this.params.enableWarburg && this.params.rWarburg > 40) {
      diagnosis.bulletPoints.push('低周波拡散抵抗 R_W,c ≈ ' + this.params.rWarburg.toFixed(1) + ' mΩ (カソードガス拡散層物質移動抵抗あり)');
    }

    if (this.params.enableWarburgAnode && this.params.rWarburgAnode > 10) {
      diagnosis.bulletPoints.push('アノード水素物質移動抵抗 R_W,a ≈ ' + this.params.rWarburgAnode.toFixed(1) + ' mΩ (改質ガス希釈・アノードフラッディング/水素枯渇の影響)');
    }

    return {
      rOhmEst,
      rPolEst,
      rTotalEst,
      maxNegZIm,
      fApex,
      estimatedCdl_uF,
      diagnosis
    };
  }
}

// Export for browser
window.Complex = Complex;
window.EISEngine = EISEngine;
