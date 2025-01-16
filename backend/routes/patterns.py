from flask import Blueprint, jsonify, send_file
import os

patterns_bp = Blueprint('patterns', __name__)

PATTERNS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'patterns')

@patterns_bp.route('/list', methods=['GET'])
def list_patterns():
    """获取所有可用的 pattern 文件列表"""
    try:
        # 确保目录存在
        if not os.path.exists(PATTERNS_DIR):
            os.makedirs(PATTERNS_DIR)
            
        # 获取所有文件（排除隐藏文件和目录）
        pattern_files = [f for f in os.listdir(PATTERNS_DIR) 
                        if not f.startswith('.') and os.path.isfile(os.path.join(PATTERNS_DIR, f))]
        return jsonify(pattern_files)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@patterns_bp.route('/files', methods=['GET'])
def get_all_patterns():
    """获取所有模式文件的内容"""
    try:
        all_patterns = {}
        pattern_files = [f for f in os.listdir(PATTERNS_DIR) 
                        if not f.startswith('.') and os.path.isfile(os.path.join(PATTERNS_DIR, f))]
        
        for filename in pattern_files:
            file_path = os.path.join(PATTERNS_DIR, filename)
            patterns = {}
            with open(file_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith('#'):
                        continue
                    try:
                        name, pattern = line.split(' ', 1)
                        patterns[name] = pattern.strip()
                    except ValueError:
                        continue
            all_patterns[filename] = patterns
            
        return jsonify(all_patterns)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@patterns_bp.route('/<filename>', methods=['GET'])
def get_pattern_file(filename):
    """获取指定 pattern 文件的内容"""
    try:
        file_path = os.path.join(PATTERNS_DIR, filename)
        if not os.path.exists(file_path):
            return jsonify({'error': 'Pattern file not found'}), 404

        patterns = {}
        with open(file_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                # 跳过空行和注释
                if not line or line.startswith('#'):
                    continue
                try:
                    name, pattern = line.split(' ', 1)
                    patterns[name] = pattern.strip()
                except ValueError:
                    continue

        return jsonify(patterns)
    except Exception as e:
        return jsonify({'error': str(e)}), 500 