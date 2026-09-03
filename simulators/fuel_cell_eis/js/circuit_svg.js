/**
 * Fuel Cell Equivalent Circuit Schematic SVG Renderer
 * 
 * Renders high-fidelity electronic circuit schematic symbols:
 * - L_cable: Inductor coil (Toggleable ON/OFF)
 * - R_ohm: Resistor rectangle (Toggleable ON/OFF)
 * - Anode Branch: R_cta // C_dla (Toggleable ON/OFF)
 * - Cathode Branch: (R_ctc + Z_w) // CPE_c (Toggleable ON/OFF)
 * - Dynamic value annotations and interactive hover hitboxes
 */

class CircuitSchematicVisualizer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.activeElement = null;
    this.params = {};
    this.targetCell = 'full';
  }

  update(params, onHoverCallback) {
    this.params = params;
    this.targetCell = params.targetCell || 'full';
    this.onHoverCallback = onHoverCallback;
    this.render();
  }

  render() {
    if (!this.container) return;

    const p = this.params;
    const isCathodeHalf = this.targetCell === 'cathode';
    const isAnodeHalf = this.targetCell === 'anode';

    const isLActive = p.enableInductance !== false;
    const isROhmActive = p.enableROhm !== false;
    const isAnodeActive = p.enableAnode !== false && !isCathodeHalf;
    const isAnodeWarburgActive = isAnodeActive && p.enableWarburgAnode && p.rWarburgAnode > 0;
    const isCathodeActive = p.enableCathode !== false && !isAnodeHalf;
    const isWarburgActive = p.enableWarburg !== false && isCathodeActive;

    const width = 960;
    const height = 170;

    const svg = `
      <svg viewBox="0 0 ${width} ${height}" class="circuit-schematic-svg" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="glowCyanCirc" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feComposite in="SourceGraphic" in2="blur" operator="over"/>
          </filter>
        </defs>

        <!-- Background -->
        <rect width="${width}" height="${height}" fill="#080e1c" rx="8" stroke="#1e3a63" stroke-width="1"/>

        <!-- Wire path lines (Main continuous backbone) -->
        <g stroke="#64748b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <!-- Terminal In to L_cable -->
          <line x1="30" y1="85" x2="65" y2="85"/>
          <!-- L_cable internal connection (65 to 135) & out to R_ohm (135 to 165) -->
          <line x1="135" y1="85" x2="170" y2="85"/>
          <!-- R_ohm (170 to 230) to Anode Split Node (250) -->
          <line x1="230" y1="85" x2="250" y2="85"/>
          
          <!-- ================= ANODE PARALLEL BRANCHES ================= -->
          <!-- Top Branch: Split (250,85) -> (270,45) -> R_cta (290) -->
          <path d="M 250 85 L 270 85 L 270 45 L 290 45" fill="none" opacity="${isAnodeActive ? '1.0' : '0.3'}"/>
          <!-- Series line between R_cta (360) and Z_Wa (380) -->
          <line x1="360" y1="45" x2="380" y2="45" opacity="${isAnodeActive ? '1.0' : '0.3'}"/>
          <!-- Top Branch End: Z_Wa (450) -> (470,45) -> Join (490,85) -->
          <path d="M 450 45 L 470 45 L 470 85 L 490 85" fill="none" opacity="${isAnodeActive ? '1.0' : '0.3'}"/>

          <!-- Bottom Branch: Split (250,85) -> (270,125) -> C_dla (365) -->
          <path d="M 250 85 L 270 85 L 270 125 L 365 125" fill="none" opacity="${isAnodeActive ? '1.0' : '0.3'}"/>
          <!-- Bottom Branch End: C_dla (377) -> (470,125) -> Join (490,85) -->
          <path d="M 377 125 L 470 125 L 470 85" fill="none" opacity="${isAnodeActive ? '1.0' : '0.3'}"/>

          <!-- Direct pass-through if Anode is OFF -->
          ${!isAnodeActive ? '<line x1="250" y1="85" x2="490" y2="85" stroke="#38bdf8" stroke-dasharray="4,4"/>' : ''}

          <!-- Intermediate Backbone from Anode Join (490) to Cathode Split (520) -->
          <line x1="490" y1="85" x2="520" y2="85"/>

          <!-- ================= CATHODE PARALLEL BRANCHES ================= -->
          <!-- Top Branch: Split (520,85) -> (540,45) -> R_ctc (560) -->
          <path d="M 520 85 L 540 85 L 540 45 L 560 45" fill="none" opacity="${isCathodeActive ? '1.0' : '0.3'}"/>
          <!-- Series line between R_ctc (630) and Z_Wc (650) -->
          <line x1="630" y1="45" x2="650" y2="45" opacity="${isCathodeActive ? '1.0' : '0.3'}"/>
          <!-- Top Branch End: Z_Wc (725) -> (755,45) -> Join (775,85) -->
          <path d="M 725 45 L 755 45 L 755 85 L 775 85" fill="none" opacity="${isCathodeActive ? '1.0' : '0.3'}"/>

          <!-- Bottom Branch: Split (520,85) -> (540,125) -> CPE_c (635) -->
          <path d="M 520 85 L 540 85 L 540 125 L 635 125" fill="none" opacity="${isCathodeActive ? '1.0' : '0.3'}"/>
          <!-- Bottom Branch End: CPE_c (647) -> (755,125) -> Join (775,85) -->
          <path d="M 647 125 L 755 125 L 755 85" fill="none" opacity="${isCathodeActive ? '1.0' : '0.3'}"/>

          <!-- Direct pass-through if Cathode is OFF -->
          ${!isCathodeActive ? '<line x1="520" y1="85" x2="775" y2="85" stroke="#38bdf8" stroke-dasharray="4,4"/>' : ''}

          <!-- Output Backbone from Cathode Join (775) to Output Terminal (930) -->
          <line x1="775" y1="85" x2="930" y2="85"/>
        </g>

        <!-- Node Junction Dots -->
        <circle cx="250" cy="85" r="4" fill="${isAnodeActive ? '#38bdf8' : '#475569'}"/>
        <circle cx="490" cy="85" r="4" fill="${isAnodeActive ? '#38bdf8' : '#475569'}"/>
        <circle cx="520" cy="85" r="4" fill="${isCathodeActive ? '#38bdf8' : '#475569'}"/>
        <circle cx="775" cy="85" r="4" fill="${isCathodeActive ? '#38bdf8' : '#475569'}"/>

        <!-- External Terminals -->
        <circle cx="30" cy="85" r="5" fill="#ef4444" stroke="#fff" stroke-width="1.5"/>
        <text x="30" y="110" fill="#ef4444" font-family="'Outfit', sans-serif" font-size="10.5" font-weight="bold" text-anchor="middle">WE (+)</text>

        <circle cx="930" cy="85" r="5" fill="#3b82f6" stroke="#fff" stroke-width="1.5"/>
        <text x="930" y="110" fill="#3b82f6" font-family="'Outfit', sans-serif" font-size="10.5" font-weight="bold" text-anchor="middle">CE (-)</text>

        <!-- ================= COMPONENT 1: L_cable (Inductor) ================= -->
        <g class="circ-hover-group" data-element="L" transform="translate(65, 65)" style="cursor: pointer;" opacity="${isLActive ? '1.0' : '0.35'}">
          <rect x="-5" y="-15" width="80" height="50" fill="transparent" rx="4"/>
          <!-- Coil curls (from 0 to 70) -->
          <path d="M 0 20 C 5 5, 15 5, 17 20 C 19 5, 29 5, 31 20 C 33 5, 43 5, 45 20 C 47 5, 57 5, 60 20 L 70 20" fill="none" stroke="#ef4444" stroke-width="2.5"/>
          <text x="35" y="-2" fill="#ef4444" font-family="'JetBrains Mono', Consolas, monospace" font-size="11.5" font-weight="bold" text-anchor="middle">
            L<tspan dy="3" font-size="8.5">cable</tspan>
          </text>
          <text x="35" y="38" fill="${isLActive ? '#94a3b8' : '#f87171'}" font-family="'JetBrains Mono', Consolas, monospace" font-size="10" text-anchor="middle">
            ${isLActive ? p.lCable.toFixed(0)+'nH' : '[OFF]'}
          </text>
        </g>

        <!-- ================= COMPONENT 2: R_ohm (Membrane Resistor) ================= -->
        <g class="circ-hover-group" data-element="R_ohm" transform="translate(170, 65)" style="cursor: pointer;" opacity="${isROhmActive ? '1.0' : '0.35'}">
          <rect x="-5" y="-15" width="70" height="50" fill="transparent" rx="4"/>
          <!-- Resistor rectangle (from 0 to 60) -->
          <rect x="0" y="10" width="60" height="20" fill="#0f172a" stroke="#10b981" stroke-width="2.2" rx="2"/>
          <text x="30" y="-2" fill="#34d399" font-family="'JetBrains Mono', Consolas, monospace" font-size="11.5" font-weight="bold" text-anchor="middle">
            R<tspan dy="3" font-size="9">Ω</tspan>
          </text>
          <text x="30" y="24" fill="#34d399" font-family="'JetBrains Mono', Consolas, monospace" font-size="9.5" font-weight="bold" text-anchor="middle">電解質膜</text>
          <text x="30" y="44" fill="${isROhmActive ? '#10b981' : '#f87171'}" font-family="'JetBrains Mono', Consolas, monospace" font-size="10.5" font-weight="bold" text-anchor="middle">
            ${isROhmActive ? (p.targetCell==='full'?p.rOhm:p.rOhm/2).toFixed(1)+'mΩ' : '[OFF]'}
          </text>
        </g>

        <!-- ================= ANODE TANK ( (R_cta + Z_Wa) // C_dla ) ================= -->
        <g transform="translate(0, 0)" opacity="${isAnodeActive ? '1.0' : '0.35'}">
          <!-- Top Branch Left: R_cta (290 to 360) -->
          <g class="circ-hover-group" data-element="anode" transform="translate(290, 25)" style="cursor: pointer;">
            <rect x="-5" y="-10" width="80" height="40" fill="transparent" rx="4"/>
            <rect x="0" y="10" width="70" height="20" fill="#0f172a" stroke="#f59e0b" stroke-width="2" rx="2"/>
            <text x="35" y="4" fill="#fbbf24" font-family="'JetBrains Mono', Consolas, monospace" font-size="11" font-weight="bold" text-anchor="middle">
              R<tspan dy="3" font-size="8.5">ct,a</tspan>
            </text>
            <text x="35" y="24" fill="#fcd34d" font-family="'JetBrains Mono', Consolas, monospace" font-size="10" font-weight="bold" text-anchor="middle">
              ${isAnodeActive ? p.rCtAnode.toFixed(1)+'mΩ' : '[OFF]'}
            </text>
          </g>

          <!-- Top Branch Right: Z_Wa (Anode Warburg) (380 to 450) -->
          <g class="circ-hover-group" data-element="anode" transform="translate(380, 25)" style="cursor: pointer;" opacity="${isAnodeWarburgActive ? '1.0' : '0.4'}">
            <rect x="-5" y="-10" width="80" height="40" fill="transparent" rx="4"/>
            <rect x="0" y="10" width="70" height="20" fill="#1e1b4b" stroke="#f59e0b" stroke-width="1.8" rx="2"/>
            <line x1="0" y1="30" x2="70" y2="10" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="3,2"/>
            <text x="35" y="4" fill="#fbbf24" font-family="'JetBrains Mono', Consolas, monospace" font-size="11" font-weight="bold" text-anchor="middle">
              Z<tspan dy="3" font-size="8.5">W,a</tspan>
            </text>
            <text x="35" y="24" fill="#fcd34d" font-family="'JetBrains Mono', Consolas, monospace" font-size="9" font-weight="bold" text-anchor="middle">
              ${isAnodeWarburgActive ? 'R='+p.rWarburgAnode.toFixed(0)+'mΩ' : '[0mΩ]'}
            </text>
          </g>

          <!-- Bottom Branch: C_dla (Capacitor) (Plates at 365 and 377) -->
          <g class="circ-hover-group" data-element="anode" transform="translate(310, 105)" style="cursor: pointer;">
            <rect x="0" y="-10" width="120" height="40" fill="transparent" rx="4"/>
            <!-- Equal Capacitor Plates -->
            <line x1="55" y1="10" x2="55" y2="30" stroke="#f59e0b" stroke-width="3"/>
            <line x1="67" y1="10" x2="67" y2="30" stroke="#f59e0b" stroke-width="3"/>
            <text x="61" y="43" fill="#f59e0b" font-family="'JetBrains Mono', Consolas, monospace" font-size="10.5" font-weight="bold" text-anchor="middle">
              ${isAnodeActive ? `C<tspan dy="2" font-size="8.5">dl,a</tspan><tspan dy="-2"> (${p.cDlAnode.toFixed(0)}µF)</tspan>` : 'C_dl,a [OFF]'}
            </text>
          </g>

          <!-- Tank Label -->
          <text x="370" y="15" fill="#f59e0b" font-family="'Outfit', sans-serif" font-size="10.5" font-weight="bold" text-anchor="middle">
            【 アノード HOR &amp; 水素拡散並列タンク ${isAnodeActive ? '' : '(OFF)'} 】
          </text>
        </g>

        <!-- ================= CATHODE TANK ( (R_ctc + Z_w) // CPE_c ) ================= -->
        <g transform="translate(0, 0)" opacity="${isCathodeActive ? '1.0' : '0.35'}">
          <!-- Top Branch Left: R_ctc (560 to 630) -->
          <g class="circ-hover-group" data-element="cathode" transform="translate(560, 25)" style="cursor: pointer;">
            <rect x="-5" y="-10" width="80" height="40" fill="transparent" rx="4"/>
            <rect x="0" y="10" width="70" height="20" fill="#0f172a" stroke="#0ea5e9" stroke-width="2" rx="2"/>
            <text x="35" y="4" fill="#38bdf8" font-family="'JetBrains Mono', Consolas, monospace" font-size="11" font-weight="bold" text-anchor="middle">
              R<tspan dy="3" font-size="8.5">ct,c</tspan> (ORR)
            </text>
            <text x="35" y="24" fill="#7dd3fc" font-family="'JetBrains Mono', Consolas, monospace" font-size="10" font-weight="bold" text-anchor="middle">
              ${isCathodeActive ? p.rCtCathode.toFixed(1)+'mΩ' : '[OFF]'}
            </text>
          </g>

          <!-- Top Branch Right: Z_w (Warburg) (650 to 725) -->
          <g class="circ-hover-group" data-element="warburg" transform="translate(650, 25)" style="cursor: pointer;" opacity="${isWarburgActive ? '1.0' : '0.4'}">
            <rect x="-5" y="-10" width="85" height="40" fill="transparent" rx="4"/>
            <!-- Warburg block symbol with diagonal line -->
            <rect x="0" y="10" width="75" height="20" fill="#1e1b4b" stroke="#c084fc" stroke-width="2" rx="2"/>
            <line x1="0" y1="30" x2="75" y2="10" stroke="#c084fc" stroke-width="1.5" stroke-dasharray="3,2"/>
            <text x="37" y="4" fill="#c084fc" font-family="'JetBrains Mono', Consolas, monospace" font-size="11" font-weight="bold" text-anchor="middle">
              Z<tspan dy="3" font-size="8.5">W,c</tspan>
            </text>
            <text x="37" y="24" fill="#e9d5ff" font-family="'JetBrains Mono', Consolas, monospace" font-size="9.5" font-weight="bold" text-anchor="middle">
              ${isWarburgActive ? 'R<tspan dy="2" font-size="7.5">W,c</tspan>='+p.rWarburg.toFixed(0)+'mΩ' : '[OFF]'}
            </text>
          </g>

          <!-- Bottom Branch: CPE_c (Constant Phase Element) (Plates at 635 and 647) -->
          <g class="circ-hover-group" data-element="cathode" transform="translate(580, 105)" style="cursor: pointer;">
            <rect x="0" y="-10" width="120" height="40" fill="transparent" rx="4"/>
            <!-- Parallel Equal Capacitor / CPE Plates -->
            <line x1="55" y1="10" x2="55" y2="30" stroke="#38bdf8" stroke-width="3"/>
            <line x1="67" y1="10" x2="67" y2="30" stroke="#38bdf8" stroke-width="3"/>
            <text x="61" y="43" fill="#38bdf8" font-family="'JetBrains Mono', Consolas, monospace" font-size="10.5" font-weight="bold" text-anchor="middle">
              ${isCathodeActive ? `CPE<tspan dy="2" font-size="8.5">c</tspan><tspan dy="-2"> (Q=${p.qCathode.toFixed(0)}mF, n=${p.nCathode.toFixed(2)})</tspan>` : 'CPE_c [OFF]'}
            </text>
          </g>

          <!-- Tank Label -->
          <text x="645" y="15" fill="#38bdf8" font-family="'Outfit', sans-serif" font-size="10.5" font-weight="bold" text-anchor="middle">
            【 カソード ORR + 物質移動 並列タンク ${isCathodeActive ? '' : '(OFF)'} 】
          </text>
        </g>
      </svg>
    `;

    this.container.innerHTML = svg;

    // Attach hover listeners to circuit symbols
    const hoverGroups = this.container.querySelectorAll('.circ-hover-group');
    hoverGroups.forEach(g => {
      const elKey = g.getAttribute('data-element');
      g.addEventListener('mouseenter', () => {
        if (this.onHoverCallback) this.onHoverCallback(elKey);
      });
      g.addEventListener('mouseleave', () => {
        if (this.onHoverCallback) this.onHoverCallback(null);
      });
    });
  }
}

// Export to window
window.CircuitSchematicVisualizer = CircuitSchematicVisualizer;
