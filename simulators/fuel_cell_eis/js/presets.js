/**
 * Fuel Cell Operating Condition Presets & Educational Scenarios
 */

window.FC_PRESETS = {
  normal: {
    id: 'normal',
    name: '🌟 正常運転 (Normal Operation)',
    badge: '正常 (Good)',
    badgeClass: 'badge-success',
    description: '適正な温度（80℃）・加湿（RH 100%）・適切なガス流量で発電している理想的なPEFC（固体高分子形燃料電池）の状態です。',
    interpretation: '高周波切片 R_Ω は約 30 mΩ と小さく、カソードORRの適度な半円と、低周波にわずかなガス拡散抵抗のみが見られます。',
    params: {
      mode: '4-terminal',
      rLead: 45.0,
      lCable: 25.0,
      enableInductance: true,
      rOhm: 30.0,
      rCtAnode: 6.0,
      cDlAnode: 2500.0,
      enableAnode: true,
      rCtCathode: 110.0,
      qCathode: 18.0,
      nCathode: 0.88,
      enableWarburg: true,
      rWarburg: 35.0,
      tauWarburg: 0.2,
      alphaWarburg: 0.5,
      noiseLevel: 0.0
    }
  },

  flooding: {
    id: 'flooding',
    name: '💧 フラッディング (Cathode Flooding)',
    badge: '生成水閉塞 (Warning)',
    badgeClass: 'badge-danger',
    description: 'カソードで生成した液水がガス拡散層（GDL）や流路に滞留し、酸素ガスの電極触媒への拡散供給が強く阻害されている状態です。',
    interpretation: '中周波のカソード半円に重なって、低周波領域（< 1 Hz）に巨大な有限長Warburg拡散円弧（または45°の直線的立ち上がり）が出現します。膜抵抗 R_Ω は湿潤のため低値（〜25 mΩ）を維持します。',
    params: {
      mode: '4-terminal',
      rLead: 45.0,
      lCable: 25.0,
      enableInductance: true,
      rOhm: 25.0,
      rCtAnode: 6.0,
      cDlAnode: 2500.0,
      enableAnode: true,
      rCtCathode: 130.0,
      qCathode: 22.0,
      nCathode: 0.82,
      enableWarburg: true,
      rWarburg: 190.0,    // Huge diffusion resistance!
      tauWarburg: 0.8,
      alphaWarburg: 0.5,
      noiseLevel: 0.0
    }
  },

  dryout: {
    id: 'dryout',
    name: '🏜️ 電解質膜乾燥 (Membrane Dry-out)',
    badge: '水分不足 (Warning)',
    badgeClass: 'badge-warning',
    description: '供給ガスの加湿不足や高温運転により、電解質高分子膜（ナフィオン等）の含水率が低下し、プロトン伝導度が激減している状態です。',
    interpretation: 'Cole-Coleプロット全体が高周波側（右側）へ大きく水平シフトします。高周波実軸切片 R_Ω が 30 mΩ から 95 mΩ 以上へと大幅に増大します。水分が少ないためフラッディングは起きず、低周波のWarburg円弧は小さくなります。',
    params: {
      mode: '4-terminal',
      rLead: 45.0,
      lCable: 25.0,
      enableInductance: true,
      rOhm: 95.0,         // High Ohmic membrane resistance!
      rCtAnode: 12.0,
      cDlAnode: 1500.0,
      enableAnode: true,
      rCtCathode: 140.0,
      qCathode: 12.0,
      nCathode: 0.90,
      enableWarburg: true,
      rWarburg: 25.0,
      tauWarburg: 0.15,
      alphaWarburg: 0.5,
      noiseLevel: 0.0
    }
  },

  poisoning: {
    id: 'poisoning',
    name: '⚡ 触媒劣化 / CO被毒 (Catalyst Degradation / CO Poisoning)',
    badge: '活性低下 (Critical)',
    badgeClass: 'badge-danger',
    description: '改質ガス中の微量一酸化炭素（CO）によるアノードPt被毒、または長期耐久によるカソードPt触媒の溶解・凝集（ECA減少）が生じている状態です。',
    interpretation: '電荷移動抵抗 R_ct（特に主円弧の直径）が数倍に巨大化します。緩和周波数 f_max（円弧の頂点）が低周波側へシフトします。膜のオーム抵抗 R_Ω は変化しません。',
    params: {
      mode: '4-terminal',
      rLead: 45.0,
      lCable: 25.0,
      enableInductance: true,
      rOhm: 32.0,
      rCtAnode: 45.0,     // Anode poisoned!
      cDlAnode: 1800.0,
      enableAnode: true,
      enableWarburgAnode: false,
      rWarburgAnode: 0.0,
      rCtCathode: 320.0,  // Huge charge transfer resistance!
      qCathode: 9.0,
      nCathode: 0.85,
      enableWarburg: true,
      rWarburg: 40.0,
      tauWarburg: 0.25,
      alphaWarburg: 0.5,
      noiseLevel: 0.0
    }
  },

  reformateH2: {
    id: 'reformateH2',
    name: '🔥 改質ガス・希釈水素運転 (Anode Hydrogen Dilution / Starvation)',
    badge: 'アノード拡散律速 (Warning)',
    badgeClass: 'badge-warning',
    description: '改質水素ガス（H2濃度低下・CO2希釈）や水素利用率過大による局所水素欠乏状態。アノード触媒層での水素ガス拡散抵抗（Z_W,a）が顕在化します。',
    interpretation: '高周波のアノード半円に続いて、アノード水素物質移動（Warburg Z_W,a ≈ 35 mΩ）による追加の円弧・歪みが出現します。カソードORR円弧と重なり、全体の偏平化が進みます。',
    params: {
      mode: '4-terminal',
      rLead: 45.0,
      lCable: 25.0,
      enableInductance: true,
      rOhm: 30.0,
      rCtAnode: 15.0,     // Increased anode activation resistance
      cDlAnode: 2200.0,
      enableAnode: true,
      enableWarburgAnode: true,
      rWarburgAnode: 35.0,// Anode hydrogen diffusion resistance!
      tauWarburgAnode: 0.08,
      alphaWarburgAnode: 0.5,
      rCtCathode: 110.0,
      qCathode: 18.0,
      nCathode: 0.88,
      enableWarburg: true,
      rWarburg: 35.0,
      tauWarburg: 0.20,
      alphaWarburg: 0.5,
      noiseLevel: 0.0
    }
  },

  twoTerminalComparison: {
    id: 'twoTerminalComparison',
    name: '🔌 2端子測定時のリード線誤差 (2-Wire Artifact)',
    badge: '測定誤差注意 (Artifact)',
    badgeClass: 'badge-info',
    description: '4端子法（Kelvin結線）ではなく2端子法で測定した状態。測定プローブのリード線抵抗やクランプの接触抵抗（2 × 45 mΩ = 90 mΩ）がそのまま測定値に直列加算されます。',
    interpretation: 'セル自体の膜抵抗は 30 mΩ であっても、見かけ上の高周波切片は 120 mΩ となり、真の燃料電池性能を誤認してしまいます。4端子法に切り替えると電圧センス線（V+, V-）に電流が流れないため、この 90 mΩ が完全にキャンセルされます。',
    params: {
      mode: '2-terminal', // 2-wire mode!
      rLead: 45.0,
      lCable: 40.0,
      enableInductance: true,
      rOhm: 30.0,
      rCtAnode: 6.0,
      cDlAnode: 2500.0,
      enableAnode: true,
      rCtCathode: 110.0,
      qCathode: 18.0,
      nCathode: 0.88,
      enableWarburg: true,
      rWarburg: 35.0,
      tauWarburg: 0.2,
      alphaWarburg: 0.5,
      noiseLevel: 0.0
    }
  },

  sofcHighTemp: {
    id: 'sofcHighTemp',
    name: '🔬 SOFC 高温運転 (Solid Oxide Fuel Cell ~750℃)',
    badge: 'SOFCモード (High Temp)',
    badgeClass: 'badge-purple',
    description: '700〜800℃で作動する固体酸化物形燃料電池（SOFC）。酸化物イオン伝導体（YSZ等）の電解質とペロブスカイト型空気極（LSCF等）の特性を示します。',
    interpretation: '高温のため電荷移動の活性化障壁が低く、高周波に電解質粒界・電極界面の高速緩和円弧、中低周波に多孔質電極内のガス拡散インピーダンスが現れます。',
    params: {
      mode: '4-terminal',
      rLead: 45.0,
      lCable: 15.0,
      enableInductance: true,
      rOhm: 75.0,         // Ceramic electrolyte ohmic resistance
      rCtAnode: 18.0,
      cDlAnode: 1000.0,
      enableAnode: true,
      rCtCathode: 65.0,
      qCathode: 40.0,
      nCathode: 0.92,
      enableWarburg: true,
      rWarburg: 80.0,
      tauWarburg: 0.08,
      alphaWarburg: 0.5,
      noiseLevel: 0.0
    }
  }
};
