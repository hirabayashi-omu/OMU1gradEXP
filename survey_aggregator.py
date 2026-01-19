import os
import json
import pandas as pd
from base64 import b64decode
import binascii

# ※ 本スクリプトを実行するには 'pycryptodome' ライブラリが必要です。
# インストール: pip install pycryptodome
try:
    from Crypto.Cipher import AES
    from Crypto.Protocol.KDF import PBKDF2
    from Crypto.Hash import SHA256
except ImportError:
    print("Error: 'pycryptodome' がインストールされていません。")
    print("pip install pycryptodome を実行してください。")
    exit(1)

# システムのデフォルトパスワード
DEFAULT_PASS = "antigravity-secure-scramble-2026"

def hex_to_bytes(h):
    return binascii.unhexlify(h)

def decrypt_data(obj, password=DEFAULT_PASS):
    salt = hex_to_bytes(obj['salt'])
    iv = hex_to_bytes(obj['iv'])
    payload = hex_to_bytes(obj['payload'])
    
    # PBKDF2で鍵を派生 (JS側: iterations=100000, hash=SHA-256)
    key = PBKDF2(password, salt, dkLen=32, count=100000, hmac_hash_module=SHA256)
    
    # AES-GCM 復号
    # JS側の AES-GCM は末尾 16バイトが認証タグ
    tag = payload[-16:]
    cipher_text = payload[:-16]
    
    cipher = AES.new(key, AES.MODE_GCM, nonce=iv)
    decrypted = cipher.decrypt_and_verify(cipher_text, tag)
    return decrypted.decode('utf-8')

def aggregate_surveys(directory="."):
    results = []
    
    files = [f for f in os.listdir(directory) if f.endswith('.dat')]
    print(f"集計開始: {len(files)} 件のファイルをスキャン中...")
    
    for filename in files:
        try:
            with open(os.path.join(directory, filename), 'r', encoding='utf-8') as f:
                hex_shell = f.read().strip()
                
                # 1. Hexシェルをデコード（封筒JSON文字列へ）
                envelope_json_str = binascii.unhexlify(hex_shell).decode('utf-8')
                envelope = json.loads(envelope_json_str)
                
                # 2. 復号化
                decrypted_json_str = decrypt_data(envelope)
                data = json.loads(decrypted_json_str)
                
                # 3. アンケートデータ抽出
                user = data.get('user', {})
                survey = data.get('survey', {})
                
                if not survey:
                    continue
                
                row = {
                    "氏名": user.get('studentName'),
                    "クラス": user.get('className'),
                    "番号": user.get('attendanceId'),
                    "Q1_機": survey.get('q1', {}).get('mech'),
                    "Q1_エ": survey.get('q1', {}).get('energy'),
                    "Q1_環": survey.get('q1', {}).get('water'),
                    "Q1_化": survey.get('q1', {}).get('chem'),
                    "Q2_機": survey.get('q2', {}).get('mech'),
                    "Q2_エ": survey.get('q2', {}).get('energy'),
                    "Q2_環": survey.get('q2', {}).get('water'),
                    "Q2_化": survey.get('q2', {}).get('chem'),
                    "Q3_社会繋がり": ";".join(survey.get('q3', [])),
                    "Q4_印象深い": survey.get('q4'),
                    "Q5_思考": survey.get('q5', {}).get('think'),
                    "Q5_接続": survey.get('q5', {}).get('connect'),
                    "Q5_理解": survey.get('q5', {}).get('flow'),
                    "Q5_チーム": survey.get('q5', {}).get('team'),
                    "Q6_志望": ";".join(survey.get('q6', [])) if isinstance(survey.get('q6'), list) else survey.get('q6'),
                    "Q7_感想": survey.get('q_free', '').replace('\n', ' ')
                }
                results.append(row)
                
        except Exception as e:
            print(f"Skipping {filename}: {e}")

    if results:
        df = pd.DataFrame(results)
        output_file = "aggregated_survey_results.csv"
        # Excelで開けるようにBOM付きUTF-8で保存
        df.to_csv(output_file, index=False, encoding='utf-8-sig')
        print(f"成功: {len(results)} 件のデータを {output_file} に出力しました。")
    else:
        print("データが見つかりませんでした。")

if __name__ == "__main__":
    # カレントディレクトリの .dat ファイルを集計
    aggregate_surveys()
