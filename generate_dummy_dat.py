import json
import binascii
from Crypto.Cipher import AES
from Crypto.Protocol.KDF import PBKDF2
from Crypto.Hash import SHA256
from Crypto.Random import get_random_bytes

# システムのデフォルトパスワード (app.js 1237行目と一致させる)
DEFAULT_PASS = "antigravity-secure-scramble-2026"

def create_dat_file(filename, app_state):
    # 1. JSON文字列化
    json_str = json.dumps(app_state, ensure_ascii=False)
    
    # 2. 鍵の派生 (PBKDF2)
    salt = get_random_bytes(16)
    key = PBKDF2(DEFAULT_PASS, salt, dkLen=32, count=100000, hmac_hash_module=SHA256)
    
    # 3. AES-GCM 暗号化
    iv = get_random_bytes(12)
    cipher = AES.new(key, AES.MODE_GCM, nonce=iv)
    ciphertext, tag = cipher.encrypt_and_digest(json_str.encode('utf-8'))
    
    # Browser SubtleCrypto の AES-GCM は ciphertext + tag の形式
    payload = ciphertext + tag
    
    # 4. エンベロープJSON作成
    envelope = {
        "v": 6,
        "payload": binascii.hexlify(payload).decode('ascii'),
        "iv": binascii.hexlify(iv).decode('ascii'),
        "salt": binascii.hexlify(salt).decode('ascii'),
        "isProtected": False
    }
    
    # 5. ヘキサシェル化 (CryptoUtils.sToH と同等)
    envelope_json_str = json.dumps(envelope)
    hex_shell = binascii.hexlify(envelope_json_str.encode('utf-8')).decode('ascii')
    
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(hex_shell)
    print(f"Created: {filename}")

# ダミーデータ構成ヘルパー
def get_mock_experiments(level=1.0):
    """level: 0.0 ~ 1.0 で完成度を調整"""
    base = {
        "day1": {
            "title": "実験① 熱の可視化",
            "info": {"partners": [{"id":"01","name":"A"},{"id":"02","name":"B"}] if level > 0.5 else []},
            "safety": [True] * 4 if level > 0.8 else [True, True, False, False],
            "tools": ["thermometer", "camera"] if level > 0.4 else [],
            "photos": {"p1": "data:image/png;base64,...", "p2": "data:image/png;base64,..."} if level > 0.6 else {},
            "data": {"melting": {"m1":60,"m2":62,"m3":61}, "transfer": [1,2,3,4,5]},
            "method_text": "A" * int(150 * level),
            "discussion": "B" * int(450 * level),
            "questions": [{"text": "Q" * int(60 * level), "minChar": 50}],
            "refs": ["Ref 1"] if level > 0.7 else []
        },
        "day2": {
            "title": "実験② 燃料電池",
            "info": {"partners": [{"id":"03","name":"C"}]},
            "safety": [True] * 4,
            "tools": ["pipette"],
            "photos": {"p1": "..."} if level > 0.5 else {},
            "data": {"charge": [1,2], "dischargeA": [5,4,3,2,1], "assembly_method": "C" * int(120 * level)},
            "discussion": "D" * int(500 * level),
            "questions": [{"text": "Q", "minChar": 20}],
            "refs": []
        },
        "day3": {
            "title": "実験③ 水処理装置",
            "info": {"partners": [{"id":"04","name":"D"}]},
            "safety": [True, True, True],
            "tools": ["filter"],
            "photos": {"p1": "...", "p2": "...", "p3": "..."},
            "data": {"p1_text": "Result", "clarity": [3, 4], "coag_text": "E" * int(110 * level)},
            "discussion": "F" * int(380 * level),
            "questions": [{"text": "Q", "minChar": 30}],
            "refs": ["Ref 3"]
        }
    }
    return base

# ダミーデータ作成
dummy_students = [
    {
        "name": "佐藤 謙一", "id": "01", "class": "1年1組", "level": 0.9,
        "survey": {
            "q1": {"mech": "3", "energy": "2", "water": "2", "chem": "3"},
            "q2": {"mech": "5", "energy": "4", "water": "4", "chem": "4"},
            "q3": ["熱の可視化", "燃料電池"], "q4": "燃料電池",
            "q5": {"think": "4", "connect": "5", "flow": "4", "team": "5"},
            "q6": ["M", "I"], "q_free": "将来はロボット開発に携わりたいため、機械工学に非常に興味が湧きました。"
        }
    },
    {
        "name": "鈴木 芽衣", "id": "15", "class": "1年2組", "level": 0.7,
        "survey": {
            "q1": {"mech": "2", "energy": "3", "water": "5", "chem": "4"},
            "q2": {"mech": "3", "energy": "4", "water": "5", "chem": "5"},
            "q3": ["水処理装置"], "q4": "水処理装置",
            "q5": {"think": "5", "connect": "4", "flow": "5", "team": "4"},
            "q6": ["E"], "q_free": "環境問題への関心がありましたが、今回の実習で化学工学の重要性を知ることができました。"
        }
    },
    {
        "name": "田中 太郎", "id": "32", "class": "1年3組", "level": 0.4,
        "survey": {
            "q1": {"mech": "4", "energy": "4", "water": "3", "chem": "2"},
            "q2": {"mech": "5", "energy": "5", "water": "3", "chem": "3"},
            "q3": ["燃料電池", "熱の可視化"], "q4": "熱の可視化",
            "q5": {"think": "4", "connect": "3", "flow": "4", "team": "5"},
            "q6": ["M", "D"], "q_free": "目に見えない熱が色として見えるのが面白かったです。"
        }
    }
]

for s in dummy_students:
    app_state = {
        "user": {"className": s["class"], "attendanceId": s["id"], "studentName": s["name"]},
        "survey": s["survey"],
        "experiments": get_mock_experiments(s["level"])
    }
    filename = f"保存_{s['id']}_{s['name']}_202601201200.dat"
    create_dat_file(filename, app_state)
