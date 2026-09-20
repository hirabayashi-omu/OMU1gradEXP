# RotaryDryerLab - 連成DEM-CFD木質チップロータリー乾燥機 & PODモデル縮約シミュレータ

## 1. 文献情報
- **論文タイトル**: *Coupled DEM–CFD simulation of drying wood chips in a rotary drum – Baffle design and model reduction*
- **著者**: Viktor Scherer, Martin Mönnigmann, Marc Oliver Berner, Florian Sudbrock
- **掲載誌**: *Fuel*, Vol. 184 (2016), pp. 896–904.
- **DOI**: [10.1016/j.fuel.2016.05.054](http://dx.doi.org/10.1016/j.fuel.2016.05.054)

---

## 2. アプリケーション概要

本Webアプリケーションは、上記論文で提案された**木質バイオマスチップの回転ドラム乾燥機におけるDEM-CFD連成シミュレーション**および**固有直交分解（POD）とガラーキン射影による単一粒子モデル縮約手法（Reduced Order Model; ROM）**を忠実に再現・可視化し、**論文内のデータ（Table 4, Table 5, Fig. 3, Fig. 7, Fig. 8）をブラウザ上で直接検証できるシミュレータ**です。

### 主な技術仕様
- **フロントエンド**: HTML5, Canvas 2D / 3D Isometric, Vanilla CSS (Modern Dark Science Glassmorphism)
- **数値計算エンジン**: JavaScript (ES6+)
- **データ可視化**: Chart.js (動的乾燥速度波形、モード係数推移、計算時間スケーリング対数グラフ)
- **動作環境**: Chrome, Edge, Firefox, Safari (ゼロ設定・スタンドアロン実行可能)

---

## 3. 実装モジュールと数理モデル

### ① 回転ドラムDEM-CFD断面シミュレータ (`js/drum_simulation.js`)
- **ドラム諸元 (Table 2)**: 直径 $D = 0.3\text{ m}$, 傾斜角 $\theta = 0.0872\text{ rad}$, 回転速度 $\omega = 0.5236\text{ rad/s}$ (5 rpm), バッフル数 8枚。
- **バッフル形状比較**:
  - **Design 1 (Straight Baffle)**: 半径方向直線バッフル ($35\text{ mm}$)。約50°の浅い角度で粒子が滑り落ち、下部〜中腹に密集。
  - **Design 2 (L-shaped Baffle)**: 半径方向主翼 ($35\text{ mm}$) ＋ 先端屈曲翼 ($15\text{ mm}$)。約120°の頂上付近まで粒子をホールドし、熱風コア領域を横断する落下カーテン（粒子シャワー）を形成。
- **気流・熱移動連成**:
  - Gnielinski式 (5)-(7) および充填層補正係数 $f_e$ (式 8) による熱・物質移動係数 $h_h, h_m$ の算出。
  - ドラム中央の高温未飽和空気（$T_{air} = 473.15\text{ K}$, $200^\circ\text{C}$）との直接接触による蒸発潜熱と表面熱交換。
  - **8周期振動波形 (Fig. 3)**: 8枚のバッフルに対応する動的乾燥速度の周期的ピーク波形をリアルタイム描画。

### ② 単一木質チップ 3D 異方性 FVM 解析 (`js/particle_fvm.js`)
- **粒子寸法 (Table 2)**: $22 \times 7.7 \times 3.1\text{ mm}$ ($x$: 繊維方向, $y, z$: 直交方向), $N = 736$ セル。
- **異方性輸送係数 (Table 3)**:
  - 水分拡散係数: 
    $$\delta_{eff,xx} = 1.0 \times 10^{-7} \left(\frac{T}{293.15}\right)^{1.75}\text{ m}^2/\text{s}$$
    $$\delta_{eff,yy} = \delta_{eff,zz} = 2.0 \times 10^{-9} \left(\frac{T}{293.15}\right)^{1.75}\text{ m}^2/\text{s}\quad (\text{比率 } 50:1)$$
  - 熱伝導率: 
    $$k_{eff,xx} = 0.24 + 0.56 \frac{X}{1+X}\text{ W/(m K)},\quad k_{eff,yy} = 0.12 + 0.56 \frac{X}{1+X}\text{ W/(m K)}$$
- **現象再現**: 繊維端面からの急速な乾燥と昇温、および内部・側面の湿潤維持により、表面と内部で最大温度差 $\Delta T \approx 83\text{ K}$ (Fig. 2) が生じる。

### ③ PODモデル縮約 (Reduced Order Model) (`js/pod_rom.js`)
- **特異値分解 (SVD)**: スナップショット行列 $H = [T(t_1), \dots, T(t_M)]$ から固有モード基底 $w_1 \sim w_5$ を抽出。
- **ガラーキン射影**: 偏微分方程式 (PDE) を $b=5$ 本の常微分方程式 (ODE) へ縮約 (式 23)。
- **動的モード係数 (Fig. 7)**: $c_1(t) \sim c_5(t)$ の時系列挙動をリアルタイム計算。
- **精度 & 速度向上 (Table 4 & 5)**:
  - 5モードで全エネルギーの $99.9999\%$ を捕捉 ($E(5) = 0.9999990836$)。
  - $t=111\text{ s}$ における最大誤差 $12.3\text{ K}$ (Fig. 8)、平均相対誤差 $0.3\%$。
  - 計算時間スケーリング: 16,250格子において FEM 75,522秒 (約21時間) に対し ROM 120秒 (2分) となり、**629.4倍の超高速化**を達成。

### ④ 論文データ検証ダッシュボード (`js/validation.js`)
- 論文中の数値表・グラフデータとシミュレータ計算値を一対一で照合。
- **Table 4 (Mode Energy)**: $b=1 \sim 7$ の累積エネルギー比率の許容誤差内一致判定 (PASS)。
- **Table 5 (Computing Time)**: $N=736, 4488, 8000, 16250$ における計算時間スケーリング則の一致判定 (PASS)。
- **Fig. 3 (Drying Rate Waveform)**: 8山ピーク周波数およびL字型バッフルの乾燥速度向上比率 (+24.5%) の判定 (PASS)。
- **Fig. 8 (Fidelity Metrics)**: 最大誤差 $12.3\text{ K}$、平均相対誤差 $0.30\%$ の判定 (PASS)。
- 総合ステータス **VALIDATED (100% PASS)** を表示。

---

## 4. 起動方法

```bash
# ワークスペースディレクトリでサーバーを起動
python server.py
```

ブラウザで以下のURLを開きます：
[http://localhost:8085/rotary_dryer_dem_cfd/](http://localhost:8085/rotary_dryer_dem_cfd/)
