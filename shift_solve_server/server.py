from flask import Flask, request, jsonify
import json
import os
from flask_cors import CORS # CORSを有効にするために追加
from shift_generater import generate_actual_shifts # shift_solver.py から関数をインポート

app = Flask(__name__)
CORS(app) # すべてのオリジンからのリクエストを許可 (開発用)

# 保存先フォルダのパス (このスクリプトが python_shift_solver フォルダ内にあると仮定)
# スクリプトの場所を基準に絶対パスを生成
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SAVE_DIR = BASE_DIR # python_shift_solver フォルダのルートに保存
FILE_NAME = "received_schedule_input.json"
SAVE_PATH = os.path.join(SAVE_DIR, FILE_NAME)

@app.route('/generate_schedule', methods=['POST'])
def generate_schedule_route():
    """
    Reactアプリケーションからシフト生成データを受け取り、
    JSONファイルとして保存し、shift_solver.py を使ってシフトを生成し結果を返す。
    """
    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 400

    try:
        data = request.get_json()
    except Exception as e:
        return jsonify({"error": f"Failed to parse JSON: {str(e)}"}), 400

    # --- 1. JSONデータをファイルに保存 ---
    try:
        if not os.path.exists(SAVE_DIR):
            os.makedirs(SAVE_DIR)
        with open(SAVE_PATH, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=4)
        print(f"Data saved to {SAVE_PATH}")
    except Exception as e:
        print(f"Error saving data to file: {str(e)}")
        return jsonify({"error": f"Failed to save data to file: {str(e)}"}), 500

    # --- 2. Pythonでシフト生成コードを実行 ---
    try:
        # shift_solver.py の関数を呼び出してシフトを生成
        actual_assignments = generate_actual_shifts(data)
        print(f"Shift generation successful. Generated {len(actual_assignments)} assignments.")
    except Exception as e:
        error_message = f"Shift generation failed: {str(e)}"
        print(error_message)
        # エラーの詳細をログに出力（スタックトレースなど）
        import traceback
        traceback.print_exc()
        return jsonify({"error": error_message, "details": traceback.format_exc()}), 500

    # --- 3. 結果をReactアプリケーションに返す ---
    response_data = {
        "message": "シフト生成に成功しました。",
        "received_data_summary": {
            "num_teachers": len(data.get("teachers", [])),
            "num_students": len(data.get("students", [])),
            "input_file_path": SAVE_PATH
        },
        "assignments": actual_assignments # 生成された実際のシフト
    }
    return jsonify(response_data), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)
