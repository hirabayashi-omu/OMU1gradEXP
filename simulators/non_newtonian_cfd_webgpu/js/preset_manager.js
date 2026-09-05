/**
 * preset_manager.js - レオロジー数理パラメータ プリセット管理モジュール
 * 
 * 機能:
 *   1. ブラウザキャッシュ (LocalStorage) へのカスタムプリセット保存・読込・削除
 *   2. プリセットの JSON ファイルエクスポート (ダウンロード保存)
 *   3. プリセットの JSON ファイルインポート (ファイル読込)
 *   4. デフォルトプリセットとのシームレス統合
 */

import { COSMETIC_PRESETS } from './models.js?v=127';

const STORAGE_KEY = 'OMU1gradEXP_custom_rheology_presets_v1';

export class PresetManager {
  constructor() {
    this.customPresets = this.loadFromStorage();
  }

  /**
   * LocalStorage からカスタムプリセットを読込
   */
  loadFromStorage() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      console.warn('LocalStorage load error:', e);
      return {};
    }
  }

  /**
   * LocalStorage にカスタムプリセットを保存
   */
  saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.customPresets));
    } catch (e) {
      console.error('LocalStorage save error:', e);
    }
  }

  /**
   * 全プリセット（組み込み + カスタム）の辞書を取得
   */
  getAllPresets() {
    return { ...COSMETIC_PRESETS, ...this.customPresets };
  }

  /**
   * 指定IDのプリセットを取得
   */
  getPreset(id) {
    return this.customPresets[id] || COSMETIC_PRESETS[id] || null;
  }

  /**
   * 新しいカスタムプリセットを保存 (キャッシュ)
   */
  saveCustomPreset(presetData) {
    const id = presetData.id || `custom_${Date.now()}`;
    const newPreset = {
      id: id,
      name: presetData.name || 'カスタム処方',
      desc: presetData.desc || 'ユーザー定義レオロジーパラメータ',
      hlb: parseFloat(presetData.hlb) || 10.0,
      emulsion_type: presetData.emulsion_type || 'カスタム処方',
      polarity: presetData.polarity || '両親媒性',
      tau_y: parseFloat(presetData.tau_y) || 0.0,
      K: parseFloat(presetData.K) || 1.0,
      n: parseFloat(presetData.n) || 1.0,
      m_reg: parseFloat(presetData.m_reg) || 100.0,
      eta_min: parseFloat(presetData.eta_min) || 0.001,
      eta_max: parseFloat(presetData.eta_max) || 200.0,
      rho: parseFloat(presetData.rho) || 1000.0,
      sigma: parseFloat(presetData.sigma) || 40.0,
      inlet_vel: parseFloat(presetData.inlet_vel) || 1.15,
      materialId: presetData.materialId || 'cream_white',
      material: presetData.material || null,
      isCustom: true,
      updatedAt: new Date().toISOString()
    };

    this.customPresets[id] = newPreset;
    this.saveToStorage();
    return newPreset;
  }

  /**
   * カスタムプリセットを削除
   */
  deleteCustomPreset(id) {
    if (this.customPresets[id]) {
      delete this.customPresets[id];
      this.saveToStorage();
      return true;
    }
    return false;
  }

  /**
   * プリセットを JSON ファイルとしてエクスポート（ダウンロード）
   */
  exportToJsonFile(presetOrAll) {
    const dataToExport = presetOrAll || this.getAllPresets();
    const jsonStr = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const name = (presetOrAll && presetOrAll.name)
      ? `rheology_preset_${presetOrAll.name.replace(/[\s\/\\]+/g, '_')}.json`
      : `rheology_presets_${new Date().toISOString().slice(0, 10)}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * JSON ファイルからプリセットをインポート
   * @param {File} file 
   * @returns {Promise<Array<object>>} インポートされたプリセット一覧
   */
  importFromJsonFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target.result);
          const imported = [];

          if (parsed && typeof parsed === 'object') {
            // 単一プリセットまたは複数プリセットの辞書
            if (parsed.tau_y !== undefined && parsed.K !== undefined) {
              // 単一
              const saved = this.saveCustomPreset(parsed);
              imported.push(saved);
            } else {
              // 辞書形式
              for (const key in parsed) {
                const item = parsed[key];
                if (item && typeof item === 'object' && item.tau_y !== undefined) {
                  const saved = this.saveCustomPreset(item);
                  imported.push(saved);
                }
              }
            }
          }

          if (imported.length > 0) {
            resolve(imported);
          } else {
            reject(new Error('有効なレオロジーパラメータプリセットが含まれていません。'));
          }
        } catch (err) {
          reject(new Error('JSONの解析に失敗しました: ' + err.message));
        }
      };
      reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました。'));
      reader.readAsText(file, 'utf-8');
    });
  }
}
