/**
 * Interactive SVG 4-Terminal / Kelvin Connection & Fuel Cell Visualizer
 * 
 * Supports:
 * 1. Full Cell Measurement (4-Terminal Kelvin across MEA: Anode V+ to Cathode V-)
 * 2. Cathode Half-Cell (3-Electrode with Membrane Reference Electrode RE)
 * 3. Anode Half-Cell (3-Electrode with Membrane Reference Electrode RE)
 * 4. 2-Terminal Comparison Mode (with jumper wires)
 * 5. Frequency-Synchronized AC Current & Voltage Oscillation (周波数同期 交流振動)
 * 6. Crystal-Clear Reference Electrode (RE) Connection & Callout Graphics
 */

class WiringVisualizer {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.options = Object.assign({
      instrumentType: 'fra', // 'fra' or 'lcr'
      mode: '4-terminal',    // '4-terminal' or '2-terminal'
      targetCell: 'full',    // 'full', 'cathode', 'anode'
      rLead: 45.0,           // mOhm
      isSimulating: false,
      activeFreq: 1000.0     // Hz
    }, options);

    this.render();
  }

  setMode(mode, rLead) {
    this.options.mode = mode;
    if (rLead !== undefined) this.options.rLead = rLead;
    this.render();
  }

  setTargetCell(targetCell) {
    this.options.targetCell = targetCell;
    this.render();
  }

  setInstrumentType(type) {
    this.options.instrumentType = type;
    this.render();
  }

  /**
   * Calculates dynamic animation duration synchronized with frequency
   */
  calcAnimDuration(freq) {
    const f = Math.max(0.01, freq || 1000.0);
    const logF = Math.log10(f);
    const dur = 2.0 - 0.35 * logF;
    return Math.max(0.22, Math.min(3.2, dur)).toFixed(2) + 's';
  }

  setSimulationState(isSimulating, freq) {
    this.options.isSimulating = isSimulating;
    if (freq !== undefined) this.options.activeFreq = freq;
    
    const curFreq = this.options.activeFreq || 1000.0;
    const durStr = this.calcAnimDuration(curFreq);

    // Update live frequency display
    const freqEl = document.getElementById('svg-live-freq');
    if (freqEl) {
      if (curFreq >= 1000) {
        freqEl.textContent = `${(curFreq / 1000).toFixed(2)} kHz`;
      } else {
        freqEl.textContent = `${curFreq.toFixed(2)} Hz`;
      }
    }

    const modeTag = document.getElementById('svg-ac-speed-tag');
    if (modeTag) {
      modeTag.textContent = `⇄ AC 交流変調 (${curFreq >= 1000 ? (curFreq/1000).toFixed(1)+'kHz' : curFreq.toFixed(1)+'Hz'} 同期)`;
    }

    // Dynamically update SVG animation durations in real-time
    const animIds = ['anim-i-pos', 'anim-i-neg', 'anim-v-pos', 'anim-v-neg'];
    animIds.forEach(id => {
      const animEl = document.getElementById(id);
      if (animEl) {
        animEl.setAttribute('dur', durStr);
      }
    });
  }

  setSimulating(isSimulating, freq) {
    this.setSimulationState(isSimulating, freq);
  }

  render() {
    if (!this.container) return;

    const is4T = this.options.mode === '4-terminal';
    const isFra = this.options.instrumentType === 'fra';
    const target = this.options.targetCell || 'full';
    const isCathodeHalf = target === 'cathode';
    const isAnodeHalf = target === 'anode';
    const isHalfCell = isCathodeHalf || isAnodeHalf;
    const rLead = this.options.rLead || 45.0;
    const curFreq = this.options.activeFreq || 1000.0;
    const animDur = this.calcAnimDuration(curFreq);

    // Pixel-perfect anchor points
    // Instrument chassis is at (20, 30), sockets at x=265
    const pT1 = "265 282"; // I_cur+ (Red)
    const pT2 = "265 332"; // V_pot+ (Orange)
    const pT3 = "265 382"; // V_pot- (Cyan)
    const pT4 = "265 432"; // I_cur- (Blue)

    // Fuel cell at (715, 30)
    // Anode Tab: (740, 128)
    // Anode Sense Pad: (745, 185)
    // RE Membrane Probe tip: x = 715 + 107 = 822, y = 30 + 215 = 245
    const pAnodeTab = "740 128";
    const pAnodeSense = "745 185";
    const pRE = "822 245";
    const pCathodeSense = "899 305";
    const pCathodeTab = "904 368";

    // Path definitions for lead wires
    const pathIPos = isCathodeHalf 
      ? `M ${pT1} C 450 282, 600 368, ${pCathodeTab}`
      : `M ${pT1} C 440 260, 560 128, ${pAnodeTab}`;

    const pathINeg = isCathodeHalf
      ? `M ${pAnodeTab} C 580 128, 450 432, ${pT4}`
      : `M ${pCathodeTab} C 680 380, 480 440, ${pT4}`;

    const pathVPos = isCathodeHalf
      ? `M ${pT2} C 460 332, 650 305, ${pCathodeSense}`
      : `M ${pT2} C 440 310, 580 185, ${pAnodeSense}`;

    const pathVNeg = isHalfCell
      ? `M ${pT3} C 480 382, 640 245, ${pRE}`
      : `M ${pT3} C 460 382, 650 305, ${pCathodeSense}`;

    const svgHtml = `
      <svg viewBox="0 0 1040 510" class="wiring-svg" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <!-- Gradient for Instrument -->
          <linearGradient id="chassisGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#1e293b"/>
            <stop offset="100%" stop-color="#0f172a"/>
          </linearGradient>

          <!-- Screen Gradient -->
          <linearGradient id="screenGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#0284c7" stop-opacity="0.25"/>
            <stop offset="100%" stop-color="#082f49" stop-opacity="0.8"/>
          </linearGradient>

          <!-- Fuel Cell Membrane Gradient (Nafion) -->
          <linearGradient id="membraneGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#059669"/>
            <stop offset="50%" stop-color="#10b981"/>
            <stop offset="100%" stop-color="#059669"/>
          </linearGradient>

          <!-- Catalyst Gradients -->
          <linearGradient id="anodeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#d97706"/>
            <stop offset="100%" stop-color="#f59e0b"/>
          </linearGradient>
          <linearGradient id="cathodeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#0284c7"/>
            <stop offset="100%" stop-color="#38bdf8"/>
          </linearGradient>

          <!-- GDL Carbon Gradient -->
          <linearGradient id="gdlGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#334155"/>
            <stop offset="50%" stop-color="#475569"/>
            <stop offset="100%" stop-color="#334155"/>
          </linearGradient>

          <!-- Current Collector Endplate Gradient -->
          <linearGradient id="plateGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#64748b"/>
            <stop offset="50%" stop-color="#94a3b8"/>
            <stop offset="100%" stop-color="#64748b"/>
          </linearGradient>

          <!-- Glow Filters for Terminals & Probes -->
          <filter id="glowRed" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feComposite in="SourceGraphic" in2="blur" operator="over"/>
          </filter>
          <filter id="glowOrange" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feComposite in="SourceGraphic" in2="blur" operator="over"/>
          </filter>
          <filter id="glowCyan" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feComposite in="SourceGraphic" in2="blur" operator="over"/>
          </filter>
          <filter id="glowBlue" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feComposite in="SourceGraphic" in2="blur" operator="over"/>
          </filter>
        </defs>

        <!-- Background -->
        <rect width="1040" height="510" fill="#080e1c" rx="10"/>

        <!-- Grid Lines in Background for CAD appearance -->
        <g stroke="#1e293b" stroke-width="0.75" stroke-dasharray="3,6">
          ${[50, 100, 150, 200, 250, 300, 350, 400, 450].map(y => `<line x1="10" y1="${y}" x2="1030" y2="${y}"/>`).join('')}
          ${[100, 200, 300, 400, 500, 600, 700, 800, 900, 1000].map(x => `<line x1="${x}" y1="10" x2="${x}" y2="500"/>`).join('')}
        </g>

        <!-- ================= TOP PRINCIPLE CALLOUT BANNER ================= -->
        <g id="kelvin-principle-banner" transform="translate(315, 16)">
          <rect x="0" y="0" width="385" height="96" rx="6" fill="#0c172b" stroke="${is4T ? '#0ea5e9' : '#f59e0b'}" stroke-width="1.5"/>
          
          <text x="14" y="24" fill="${is4T ? '#38bdf8' : '#fbbf24'}" font-family="'Outfit', sans-serif" font-size="12" font-weight="700">
            ${is4T ? (isHalfCell ? `【 3極式・4端子 ${isCathodeHalf ? 'カソード' : 'アノード'}半電池ケルビン測定 】` : '【 4端子ケルビン結線 (4-Wire Kelvin Sensing) 】') : '【 2端子結線 (2-Wire Sensing: リード線誤差混入) 】'}
          </text>

          <text x="14" y="44" fill="#cbd5e1" font-size="10.5">
            ${is4T ? (isHalfCell ? `● 電圧検出(V-)を電解質膜内に挿入した参照極(RE)に直結し、${isCathodeHalf ? 'カソード' : 'アノード'}単独の過電圧を検出` : '● 電流駆動線(赤/青)と 電圧検出線(橙/水色)を完全分離') : '● 電流印加線と電圧検出線を計測器側で共通化 (ジャンパ)'}
          </text>
          
          <text x="14" y="62" fill="${is4T ? '#34d399' : '#f87171'}" font-size="10.5" font-weight="600">
            ${is4T ? (isHalfCell ? `● 対極の過電圧を完全排除！ 参照極基準で ${isCathodeHalf ? 'ORR' : 'HOR'} の真のインピーダンスを単離測定` : '● 電圧センス端子は入力超高抵抗 (Z_in > 10GΩ) のため I_sense ≈ 0') : '● 配線抵抗 (2×R_lead = '+(2*rLead).toFixed(0)+'mΩ) が測定インピーダンスにそのまま直列加算'}
          </text>

          <text x="14" y="80" fill="#94a3b8" font-family="'JetBrains Mono', Consolas, monospace" font-size="9.5">
            ${is4T ? (isHalfCell ? 'Z_measured = R_Ω/2 + Z_working (膜中心RE基準により対極インピーダンス非干渉)' : 'ΔV_error = I_sense × R_lead ≈ 0 mV ➜ 膜オーム抵抗 (R_Ω) を高精度測定') : 'Z_measured = 2×R_lead + R_Ω + Z_anode + Z_cathode (膜抵抗を誤認)'}
          </text>
        </g>

        <!-- ================= INSTRUMENT CHASSIS (LEFT) ================= -->
        <g id="instrument-unit" transform="translate(20, 30)">
          <rect x="0" y="0" width="275" height="445" rx="10" fill="url(#chassisGrad)" stroke="#334155" stroke-width="2"/>
          
          <rect x="10" y="10" width="255" height="34" rx="5" fill="#1e293b" stroke="#475569" stroke-width="1"/>
          <circle cx="18" cy="18" r="2.5" fill="#64748b"/>
          <circle cx="257" cy="18" r="2.5" fill="#64748b"/>
          <text x="137" y="32" fill="#38bdf8" font-family="'Outfit', sans-serif" font-size="12" font-weight="700" letter-spacing="0.5" text-anchor="middle">
            ${isFra ? '⚡ FRA + POTENTIOSTAT' : '📟 4-TERMINAL LCR METER'}
          </text>

          <!-- Screen -->
          <rect x="10" y="52" width="255" height="98" rx="6" fill="url(#screenGrad)" stroke="#0ea5e9" stroke-width="1.5"/>
          
          <text x="20" y="74" fill="#94a3b8" font-family="'JetBrains Mono', Consolas, monospace" font-size="10.5">AC PERTURBATION:</text>
          <text x="165" y="74" fill="#38bdf8" font-family="'JetBrains Mono', Consolas, monospace" font-size="11" font-weight="600">~ 10 mV (交流)</text>

          <text x="20" y="93" fill="#94a3b8" font-family="'JetBrains Mono', Consolas, monospace" font-size="10.5">FREQUENCY (f):</text>
          <text x="155" y="93" id="svg-live-freq" fill="#4ade80" font-family="'JetBrains Mono', Consolas, monospace" font-size="12" font-weight="700">
            ${curFreq >= 1000 ? (curFreq/1000).toFixed(2)+' kHz' : curFreq.toFixed(2)+' Hz'}
          </text>

          <text x="20" y="112" fill="#94a3b8" font-family="'JetBrains Mono', Consolas, monospace" font-size="10.5">SENSING METHOD:</text>
          <text x="155" y="112" fill="${is4T ? '#38bdf8' : '#f59e0b'}" font-family="'Outfit', sans-serif" font-size="11" font-weight="700">
            ${is4T ? (isHalfCell ? '3-Electrode Kelvin' : '4-Wire Kelvin') : '2-Wire (High Error)'}
          </text>

          <text x="20" y="136" fill="#64748b" font-family="'JetBrains Mono', Consolas, monospace" font-size="9.5">AC OSCILLATION:</text>
          <circle cx="120" cy="132" r="4.5" fill="${this.options.isSimulating ? '#22c55e' : '#38bdf8'}" class="${this.options.isSimulating ? 'pulse-led' : ''}"/>
          <text x="130" y="136" fill="${this.options.isSimulating ? '#22c55e' : '#38bdf8'}" font-family="'JetBrains Mono', Consolas, monospace" font-size="9.5">
            ${this.options.isSimulating ? '周波数同期スイープ中' : '周波数同期振動中'}
          </text>

          <!-- Internal Routing -->
          <rect x="10" y="158" width="255" height="62" rx="4" fill="#0b1324" stroke="#1e293b" stroke-width="1"/>
          <circle cx="45" cy="189" r="14" fill="#1e293b" stroke="#ef4444" stroke-width="1.8"/>
          <text x="39" y="194" fill="#ef4444" font-size="13" font-weight="bold">~</text>
          <text x="28" y="171" fill="#94a3b8" font-size="8.5">AC Gen</text>

          <circle cx="125" cy="189" r="14" fill="#1e293b" stroke="#f59e0b" stroke-width="1.8"/>
          <text x="120" y="194" fill="#f59e0b" font-size="12" font-weight="bold">V</text>
          <text x="110" y="171" fill="#94a3b8" font-size="8.5">Lock-in</text>
          <text x="105" y="214" fill="#64748b" font-size="7.5">Z_in &gt; 10GΩ</text>

          <!-- 4 BNC Sockets -->
          <g transform="translate(15, 238)">
            <text x="5" y="10" fill="#ef4444" font-family="'JetBrains Mono', Consolas, monospace" font-size="11" font-weight="700">I_cur + (H_cur)</text>
            <text x="5" y="22" fill="#94a3b8" font-size="9.5">AC Drive Current (+)</text>
            <circle cx="230" cy="14" r="12" fill="#0f172a" stroke="#ef4444" stroke-width="2.5" filter="url(#glowRed)"/>
            <circle cx="230" cy="14" r="4.5" fill="#ef4444"/>
          </g>

          <g transform="translate(15, 288)">
            <text x="5" y="10" fill="#f59e0b" font-family="'JetBrains Mono', Consolas, monospace" font-size="11" font-weight="700">V_pot + (H_pot)</text>
            <text x="5" y="22" fill="#94a3b8" font-size="9.5">Voltage Sense High (+)</text>
            <circle cx="230" cy="14" r="12" fill="#0f172a" stroke="#f59e0b" stroke-width="2.5" filter="url(#glowOrange)"/>
            <circle cx="230" cy="14" r="4.5" fill="#f59e0b"/>
          </g>

          <g transform="translate(15, 338)">
            <text x="5" y="10" fill="#06b6d4" font-family="'JetBrains Mono', Consolas, monospace" font-size="11" font-weight="700">V_pot - (L_pot)</text>
            <text x="5" y="22" fill="#94a3b8" font-size="9.5">${isHalfCell ? 'RE Reference Sense (-)' : 'Voltage Sense Low (-)'}</text>
            <circle cx="230" cy="14" r="12" fill="#0f172a" stroke="#06b6d4" stroke-width="2.5" filter="url(#glowCyan)"/>
            <circle cx="230" cy="14" r="4.5" fill="#06b6d4"/>
          </g>

          <g transform="translate(15, 388)">
            <text x="5" y="10" fill="#3b82f6" font-family="'JetBrains Mono', Consolas, monospace" font-size="11" font-weight="700">I_cur - (L_cur)</text>
            <text x="5" y="22" fill="#94a3b8" font-size="9.5">Current Return (-)</text>
            <circle cx="230" cy="14" r="12" fill="#0f172a" stroke="#3b82f6" stroke-width="2.5" filter="url(#glowBlue)"/>
            <circle cx="230" cy="14" r="4.5" fill="#3b82f6"/>
          </g>
        </g>

        <!-- ================= WIRING LEADS ================= -->
        <g id="wires">
          <!-- WIRE 1: I_cur+ (Drive Current: WE side) -->
          <path id="wire-i-pos" d="${pathIPos}" fill="none" stroke="#ef4444" stroke-width="3" stroke-linecap="round"/>
          <path id="wire-i-neg" d="${pathINeg}" fill="none" stroke="#3b82f6" stroke-width="3" stroke-linecap="round"/>

          ${is4T ? `
            <!-- 4-Terminal Voltage Sense Leads -->
            <path id="wire-v-pos" d="${pathVPos}" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-dasharray="6,3" stroke-linecap="round"/>
            <path id="wire-v-neg" d="${pathVNeg}" fill="none" stroke="#06b6d4" stroke-width="2.5" stroke-dasharray="6,3" stroke-linecap="round"/>
            
            ${isHalfCell ? `
              <!-- Half-Cell Sensing: V+ to Working Electrode, V- directly to Membrane RE -->
              <circle cx="${(isCathodeHalf ? pCathodeSense : pAnodeSense).split(' ')[0]}" cy="${(isCathodeHalf ? pCathodeSense : pAnodeSense).split(' ')[1]}" r="6" fill="#f59e0b" stroke="#fff" stroke-width="1.8"/>
              <text x="${isCathodeHalf ? '915' : '735'}" y="${isCathodeHalf ? '300' : '172'}" fill="#f59e0b" font-family="'Outfit', sans-serif" font-size="10.5" font-weight="bold" text-anchor="${isCathodeHalf ? 'start' : 'end'}">
                V+ (${isCathodeHalf ? 'カソード作用極' : 'アノード作用極'})
              </text>

              <!-- RE Insertion Point at (822, 245) -->
              <circle cx="${pRE.split(' ')[0]}" cy="${pRE.split(' ')[1]}" r="6" fill="#06b6d4" stroke="#fff" stroke-width="2" filter="url(#glowCyan)"/>
            ` : `
              <!-- Full Cell Sensing Targets -->
              <circle cx="${pAnodeSense.split(' ')[0]}" cy="${pAnodeSense.split(' ')[1]}" r="6" fill="#f59e0b" stroke="#fff" stroke-width="1.8"/>
              <text x="735" y="172" fill="#f59e0b" font-family="'Outfit', sans-serif" font-size="10" font-weight="bold" text-anchor="end">V+ (アノード)</text>

              <circle cx="${pCathodeSense.split(' ')[0]}" cy="${pCathodeSense.split(' ')[1]}" r="6" fill="#06b6d4" stroke="#fff" stroke-width="1.8"/>
              <text x="915" y="300" fill="#06b6d4" font-family="'Outfit', sans-serif" font-size="10" font-weight="bold">V- (カソード)</text>
            `}
          ` : `
            <!-- 2-Terminal Mode: Jumpered at Instrument -->
            <path d="M ${pT2} C 300 332, 300 282, ${pT1}" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-dasharray="4,2"/>
            <path d="M ${pT3} C 300 382, 300 432, ${pT4}" fill="none" stroke="#06b6d4" stroke-width="2.5" stroke-dasharray="4,2"/>
            <circle cx="290" cy="307" r="3.5" fill="#f59e0b"/>
            <circle cx="290" cy="407" r="3.5" fill="#06b6d4"/>
            <text x="310" y="311" fill="#f59e0b" font-size="9.5" font-weight="bold">2端子 (V+ ジャンパ)</text>
            <text x="310" y="411" fill="#06b6d4" font-size="9.5" font-weight="bold">2端子 (V- ジャンパ)</text>
          `}

          <!-- Lead Wire Resistors Badges on Current Lines -->
          <g transform="translate(435, 140)">
            <rect x="0" y="0" width="105" height="24" rx="4" fill="#1e293b" stroke="#ef4444" stroke-width="1.2"/>
            <text x="6" y="16" fill="#fca5a5" font-family="'JetBrains Mono', Consolas, monospace" font-size="9.5">R_lead(+) = ${rLead.toFixed(1)}mΩ</text>
          </g>
          <g transform="translate(450, 420)">
            <rect x="0" y="0" width="105" height="24" rx="4" fill="#1e293b" stroke="#3b82f6" stroke-width="1.2"/>
            <text x="6" y="16" fill="#93c5fd" font-family="'JetBrains Mono', Consolas, monospace" font-size="9.5">R_lead(-) = ${rLead.toFixed(1)}mΩ</text>
          </g>
        </g>

        <!-- ================= FREQUENCY-SYNCHRONIZED AC OSCILLATING PARTICLES ================= -->
        <g id="animated-ac-particles">
          <!-- 1. AC Current Drive I+ Particle -->
          <circle r="4" fill="#fee2e2" class="pulse-particle">
            <animateMotion 
              id="anim-i-pos"
              path="${pathIPos}" 
              dur="${animDur}" 
              repeatCount="indefinite"
              keyPoints="0; 1; 0"
              keyTimes="0; 0.5; 1"
              calcMode="spline"
              keySplines="0.4 0 0.6 1; 0.4 0 0.6 1"/>
          </circle>

          <!-- 2. AC Current Drive I- Particle -->
          <circle r="4" fill="#dbeafe" class="pulse-particle">
            <animateMotion 
              id="anim-i-neg"
              path="${pathINeg}" 
              dur="${animDur}" 
              repeatCount="indefinite"
              keyPoints="0; 1; 0"
              keyTimes="0; 0.5; 1"
              calcMode="spline"
              keySplines="0.4 0 0.6 1; 0.4 0 0.6 1"/>
          </circle>

          <!-- 3. AC Voltage Sense V+ Particle -->
          ${is4T ? `
            <circle r="3.2" fill="#fef08a">
              <animateMotion 
                id="anim-v-pos"
                path="${pathVPos}" 
                dur="${animDur}" 
                repeatCount="indefinite"
                keyPoints="0; 0.7; 0"
                keyTimes="0; 0.5; 1"
                calcMode="spline"
                keySplines="0.4 0 0.6 1; 0.4 0 0.6 1"/>
            </circle>
            <circle r="3.2" fill="#a5f3fc">
              <animateMotion 
                id="anim-v-neg"
                path="${pathVNeg}" 
                dur="${animDur}" 
                repeatCount="indefinite"
                keyPoints="0; 0.7; 0"
                keyTimes="0; 0.5; 1"
                calcMode="spline"
                keySplines="0.4 0 0.6 1; 0.4 0 0.6 1"/>
            </circle>
          ` : ''}

          <!-- AC Frequency Synchronization Annotation Badge -->
          <g transform="translate(460, 255)">
            <rect x="-65" y="-14" width="180" height="28" rx="6" fill="#071226" stroke="#38bdf8" stroke-width="1.5" filter="url(#glowCyan)"/>
            <text id="svg-ac-speed-tag" x="25" y="4" fill="#38bdf8" font-family="'JetBrains Mono', Consolas, monospace" font-size="10" font-weight="bold" text-anchor="middle">
              ⇄ AC 交流変調 (${curFreq >= 1000 ? (curFreq/1000).toFixed(1)+'kHz' : curFreq.toFixed(1)+'Hz'} 同期)
            </text>
          </g>
        </g>

        <!-- ================= FUEL CELL SINGLE CELL FIXTURE (RIGHT) ================= -->
        <g id="fuel-cell-stack" transform="translate(715, 30)">
          <!-- Outer Cell Mounting Frame -->
          <rect x="0" y="0" width="305" height="445" rx="10" fill="#0d1829" stroke="#334155" stroke-width="2"/>
          <text x="152" y="26" fill="#f8fafc" font-family="'Outfit', sans-serif" font-size="13" font-weight="700" text-anchor="middle">
            ${isHalfCell ? (isCathodeHalf ? '🔋 カソード半電池測定 (3極式 Kelvin)' : '🔋 アノード半電池測定 (3極式 Kelvin)') : '🔋 PEFC 全セル構造 (Full Cell MEA)'}
          </text>

          <!-- Layer 1: Anode Endplate / Current Collector -->
          <rect x="30" y="55" width="22" height="345" rx="3" fill="url(#plateGrad)" stroke="#64748b" stroke-width="1" opacity="${isCathodeHalf ? '0.45' : '1.0'}"/>
          <!-- Anode Top Contact Tab (740, 128) -> local (25, 98) -->
          <rect x="15" y="90" width="20" height="15" fill="${isCathodeHalf ? '#3b82f6' : '#ef4444'}" rx="2"/>
          <circle cx="25" cy="98" r="4" fill="#ef4444" stroke="#fff" stroke-width="1"/>
          <text x="41" y="235" fill="#334155" font-family="'Outfit', sans-serif" font-size="10" font-weight="bold" transform="rotate(-90, 41, 235)" text-anchor="middle">
            ${isCathodeHalf ? 'ANODE (対極 COUNTER)' : 'ANODE (作用極 WORKING)'}
          </text>

          <!-- Layer 2: Anode Flow Field & GDL (H2 Channels) -->
          <rect x="54" y="65" width="26" height="325" fill="url(#gdlGrad)" stroke="#475569" stroke-width="1" opacity="${isCathodeHalf ? '0.45' : '1.0'}"/>
          ${[85, 125, 165, 205, 245, 285, 325].map(y => `
            <rect x="56" y="${y}" width="12" height="18" fill="#0f172a" rx="2" opacity="${isCathodeHalf ? '0.45' : '1.0'}"/>
            <text x="62" y="${y+13}" fill="#38bdf8" font-size="8" font-weight="bold" text-anchor="middle" opacity="${isCathodeHalf ? '0.45' : '1.0'}">H₂</text>
          `).join('')}

          <!-- Layer 3: Anode Catalyst Layer (Pt/C - HOR) -->
          <rect x="82" y="70" width="10" height="315" fill="url(#anodeGrad)" stroke="#d97706" stroke-width="1" opacity="${isCathodeHalf ? '0.35' : '1.0'}"/>
          
          <!-- Layer 4: Proton Exchange Membrane (Nafion) -> Center is local x=107 (global 822) -->
          <rect x="94" y="60" width="26" height="335" fill="url(#membraneGrad)" stroke="#10b981" stroke-width="1.5"/>
          ${[95, 145, 195, 295, 345].map(y => `
            <text x="107" y="${y}" fill="#ecfdf5" font-family="'JetBrains Mono', Consolas, monospace" font-size="10" font-weight="bold" text-anchor="middle">H⁺</text>
          `).join('')}

          <!-- ================= CRYSTAL-CLEAR RE REFERENCE ELECTRODE PROBE ================= -->
          ${isHalfCell ? `
            <g id="ref-electrode-probe" transform="translate(107, 215)">
              <!-- Capillary glass / platinum probe inserting straight into membrane center (0, 0) -->
              <line x1="-125" y1="0" x2="0" y2="0" stroke="#06b6d4" stroke-width="3.5" stroke-linecap="round"/>
              <line x1="-125" y1="0" x2="0" y2="0" stroke="#ffffff" stroke-width="1" stroke-dasharray="3,3"/>
              
              <!-- Reference Electrode Tip in Membrane Center -->
              <circle cx="0" cy="0" r="6" fill="#06b6d4" stroke="#ffffff" stroke-width="2" filter="url(#glowCyan)"/>
              
              <!-- Reference Electrode Callout Assembly on Left -->
              <g transform="translate(-130, -18)">
                <rect x="-105" y="0" width="115" height="36" rx="5" fill="#042f2e" stroke="#06b6d4" stroke-width="1.8" filter="url(#glowCyan)"/>
                <text x="-48" y="15" fill="#22d3ee" font-family="'Outfit', sans-serif" font-size="11" font-weight="bold" text-anchor="middle">
                  RE 参照極プローブ
                </text>
                <text x="-48" y="29" fill="#a5f3fc" font-family="'JetBrains Mono', monospace" font-size="9" font-weight="600" text-anchor="middle">
                  (DHE / 膜内電位基準)
                </text>
              </g>

              <text x="0" y="-12" fill="#22d3ee" font-family="'Outfit', sans-serif" font-size="9.5" font-weight="bold" text-anchor="middle">
                ▼ 膜内RE接点 (V- 結線先)
              </text>
            </g>
          ` : `
            <!-- Full Cell Mode indicator when NO reference electrode is used -->
            <g transform="translate(107, 215)">
              <text x="0" y="5" fill="#ecfdf5" font-family="'JetBrains Mono', monospace" font-size="10" font-weight="bold" text-anchor="middle">H⁺</text>
            </g>
          `}

          <text x="107" y="415" fill="#34d399" font-family="'Outfit', sans-serif" font-size="9.5" font-weight="bold" text-anchor="middle">
            電解質膜 (${isHalfCell ? 'R_Ω / 2' : 'R_Ω'})
          </text>

          <!-- Layer 5: Cathode Catalyst Layer (Pt/C - ORR) -->
          <rect x="122" y="70" width="10" height="315" fill="url(#cathodeGrad)" stroke="#0284c7" stroke-width="1" opacity="${isAnodeHalf ? '0.35' : '1.0'}"/>

          <!-- Layer 6: Cathode Flow Field & GDL (Air/O2 Channels) -->
          <rect x="134" y="65" width="26" height="325" fill="url(#gdlGrad)" stroke="#475569" stroke-width="1" opacity="${isAnodeHalf ? '0.45' : '1.0'}"/>
          ${[85, 125, 165, 205, 245, 285, 325].map(y => `
            <rect x="146" y="${y}" width="12" height="18" fill="#0f172a" rx="2" opacity="${isAnodeHalf ? '0.45' : '1.0'}"/>
            <text x="152" y="${y+13}" fill="#f87171" font-size="8" font-weight="bold" text-anchor="middle" opacity="${isAnodeHalf ? '0.45' : '1.0'}">O₂</text>
          `).join('')}

          <!-- Layer 7: Cathode Endplate / Current Collector -->
          <rect x="162" y="55" width="22" height="345" rx="3" fill="url(#plateGrad)" stroke="#64748b" stroke-width="1" opacity="${isAnodeHalf ? '0.45' : '1.0'}"/>
          <!-- Cathode Bottom Contact Tab (904, 368) -> local (189, 338) -->
          <rect x="179" y="330" width="20" height="15" fill="${isCathodeHalf ? '#ef4444' : '#3b82f6'}" rx="2"/>
          <circle cx="189" cy="338" r="4" fill="#3b82f6" stroke="#fff" stroke-width="1"/>
          <text x="173" y="235" fill="#334155" font-family="'Outfit', sans-serif" font-size="10" font-weight="bold" transform="rotate(90, 173, 235)" text-anchor="middle">
            ${isCathodeHalf ? 'CATHODE (作用極 WORKING)' : (isAnodeHalf ? 'CATHODE (対極 COUNTER)' : 'CATHODE CURRENT COLLECTOR')}
          </text>

          <!-- Labels for MEA components -->
          <g transform="translate(196, 75)">
            <text x="0" y="20" fill="#d97706" font-size="10" font-weight="bold" opacity="${isCathodeHalf ? '0.4' : '1.0'}">● アノード (HOR):</text>
            <text x="12" y="34" fill="#94a3b8" font-size="9" opacity="${isCathodeHalf ? '0.4' : '1.0'}">R_ct,a ∥ C_dl,a</text>

            <text x="0" y="65" fill="#34d399" font-size="10" font-weight="bold">● 電解質膜 (Nafion):</text>
            <text x="12" y="79" fill="#94a3b8" font-size="9">${isHalfCell ? 'R_Ω / 2 寄与' : 'オーム抵抗 R_Ω'}</text>

            <text x="0" y="110" fill="#0284c7" font-size="10" font-weight="bold" opacity="${isAnodeHalf ? '0.4' : '1.0'}">● カソード (ORR):</text>
            <text x="12" y="124" fill="#94a3b8" font-size="9" opacity="${isAnodeHalf ? '0.4' : '1.0'}">R_ct,c ∥ CPE_c</text>

            <text x="0" y="155" fill="#a855f7" font-size="10" font-weight="bold" opacity="${isAnodeHalf ? '0.4' : '1.0'}">● GDL物質移動:</text>
            <text x="12" y="169" fill="#94a3b8" font-size="9" opacity="${isAnodeHalf ? '0.4' : '1.0'}">拡散抵抗 Z_w</text>
          </g>
        </g>
      </svg>
    `;

    this.container.innerHTML = svgHtml;
  }
}

// Export to window
window.WiringVisualizer = WiringVisualizer;
