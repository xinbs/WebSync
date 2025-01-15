from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager, create_access_token, get_jwt_identity, jwt_required
from werkzeug.utils import secure_filename
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import os
import hashlib
import time
import bcrypt
from datetime import datetime, timedelta
from enum import Enum
from sqlalchemy import Enum as SQLEnum
from crypto_utils import crypto  # 导入加密工具
import base64
import io

app = Flask(__name__)
CORS(app)

# 配置
UPLOAD_FOLDER = 'uploads'
SYNC_FOLDER = 'sync'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///websync.db'
app.config['JWT_SECRET_KEY'] = 'your-secret-key'  # 在生产环境中使用安全的密钥
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(days=1)

db = SQLAlchemy(app)
jwt = JWTManager(app)

class UserRole(str, Enum):
    ADMIN = 'admin'
    MANAGER = 'manager'
    USER = 'user'

class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(128), nullable=False)
    role = db.Column(SQLEnum(UserRole), nullable=False, default=UserRole.USER)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    login_attempts = db.Column(db.Integer, default=0)
    last_login_attempt = db.Column(db.DateTime)
    storage_limit = db.Column(db.BigInteger, nullable=False, default=1024*1024*1024)  # 默认1GB
    storage_used = db.Column(db.BigInteger, nullable=False, default=0)

class File(db.Model):
    __tablename__ = 'files'
    id = db.Column(db.Integer, primary_key=True)
    path = db.Column(db.String(500), nullable=False)
    hash = db.Column(db.String(64), nullable=False)
    last_modified = db.Column(db.DateTime, nullable=False)
    size = db.Column(db.Integer, nullable=False)
    owner_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    is_public = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

class FileShare(db.Model):
    __tablename__ = 'file_shares'
    id = db.Column(db.Integer, primary_key=True)
    file_id = db.Column(db.Integer, db.ForeignKey('files.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

class FileChangeHandler(FileSystemEventHandler):
    def __init__(self, app_context):
        self.app_context = app_context

    def on_modified(self, event):
        if not event.is_directory:
            with self.app_context:
                update_file_info(event.src_path)

def update_file_info(file_path):
    try:
        if not os.path.exists(file_path):
            return
            
        rel_path = os.path.relpath(file_path, UPLOAD_FOLDER)
        stat = os.stat(file_path)
        
        with open(file_path, 'rb') as f:
            file_hash = hashlib.sha256(f.read()).hexdigest()
            
        file_record = File.query.filter_by(path=rel_path).first()
        if file_record:
            file_record.hash = file_hash
            file_record.last_modified = datetime.fromtimestamp(stat.st_mtime)
            file_record.size = stat.st_size
        else:
            new_file = File(
                path=rel_path,
                hash=file_hash,
                last_modified=datetime.fromtimestamp(stat.st_mtime),
                size=stat.st_size
            )
            db.session.add(new_file)
            
        db.session.commit()
    except Exception as e:
        print(f"Error updating file info: {e}")

def init_upload_folder():
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    os.makedirs(SYNC_FOLDER, exist_ok=True)

def create_initial_admin():
    try:
        # 确保数据库表已创建
        db.create_all()
        
        admin = User.query.filter_by(role=UserRole.ADMIN).first()
        if not admin:
            password = bcrypt.hashpw('admin123'.encode('utf-8'), bcrypt.gensalt())
            admin = User(
                email='admin@websync.com',
                password=password,
                role=UserRole.ADMIN,
                storage_limit=1024*1024*1024*100  # 管理员默认100GB
            )
            db.session.add(admin)
            db.session.commit()
            print("Initial admin account created")
    except Exception as e:
        print(f"Error creating initial admin: {e}")
        db.session.rollback()

@app.route('/api/register', methods=['POST'])
@jwt_required()
def register():
    current_user = User.query.get(get_jwt_identity())
    if current_user.role != UserRole.ADMIN:
        return jsonify({'error': '只有管理员可以创建新用户'}), 403

    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    role = data.get('role', UserRole.USER)
    storage_limit = data.get('storage_limit', 1024*1024*1024)  # 默认1GB

    if not email or not password:
        return jsonify({'error': '邮箱和密码不能为空'}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({'error': '该邮箱已被注册'}), 400

    hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
    new_user = User(
        email=email,
        password=hashed_password,
        role=role,
        created_by=current_user.id,
        storage_limit=storage_limit
    )
    
    db.session.add(new_user)
    db.session.commit()
    return jsonify({'message': '用户创建成功'}), 201

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')

    user = User.query.filter_by(email=email).first()
    
    if not user:
        return jsonify({'error': '用户不存在'}), 401
        
    if user.login_attempts >= 5 and user.last_login_attempt:
        time_diff = datetime.utcnow() - user.last_login_attempt
        if time_diff < timedelta(minutes=15):
            return jsonify({'error': '登录尝试次数过多，请15分钟后再试'}), 429

    if not bcrypt.checkpw(password.encode('utf-8'), user.password):
        user.login_attempts += 1
        user.last_login_attempt = datetime.utcnow()
        db.session.commit()
        return jsonify({'error': '密码错误'}), 401

    user.login_attempts = 0
    user.last_login_attempt = None
    db.session.commit()

    access_token = create_access_token(identity=user.id)
    return jsonify({
        'access_token': access_token,
        'user': {
            'id': user.id,
            'email': user.email,
            'role': user.role
        }
    })

@app.route('/api/users', methods=['GET'])
@jwt_required()
def get_users():
    current_user = User.query.get(get_jwt_identity())
    if current_user.role not in [UserRole.ADMIN, UserRole.MANAGER]:
        return jsonify({'error': '没有权限查看用户列表'}), 403

    users = User.query.all()
    return jsonify([{
        'id': user.id,
        'email': user.email,
        'role': user.role,
        'created_at': user.created_at.isoformat(),
        'storage_limit': user.storage_limit,
        'storage_used': user.storage_used
    } for user in users])

@app.route('/api/files', methods=['GET'])
@jwt_required()
def list_files():
    current_user = User.query.get(get_jwt_identity())
    
    # 查询用户可以访问的所有文件
    owned_files = File.query.filter_by(owner_id=current_user.id).all()
    shared_files = File.query.join(FileShare).filter(FileShare.user_id == current_user.id).all()
    public_files = File.query.filter_by(is_public=True).all()
    
    # 如果是管理员，可以看到所有文件
    if current_user.role == UserRole.ADMIN:
        all_files = File.query.all()
    else:
        all_files = list(set(owned_files + shared_files + public_files))
    
    files_data = []
    for file in all_files:
        owner = User.query.get(file.owner_id)
        file_type = 'own' if file.owner_id == current_user.id else \
                   'shared' if file in shared_files else \
                   'public' if file.is_public else \
                   'admin_view'
        
        files_data.append({
            'id': file.id,
            'path': file.path,
            'size': file.size,
            'modified': file.last_modified.isoformat(),
            'owner': owner.email if owner else 'Unknown',
            'type': file_type,
            'is_public': file.is_public
        })
    
    return jsonify(files_data)

@app.route('/api/upload', methods=['POST'])
@jwt_required()
def upload_file():
    current_user = User.query.get(get_jwt_identity())
    
    if 'file' not in request.files:
        return jsonify({'error': '没有文件被上传'}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': '没有选择文件'}), 400
        
    if file:
        # 检查文件大小和存储限制
        file_size = len(file.read())
        file.seek(0)  # 重置文件指针
        
        if current_user.storage_used + file_size > current_user.storage_limit:
            return jsonify({'error': '存储空间不足'}), 400
            
        filename = secure_filename(file.filename)
        file_path = os.path.join(UPLOAD_FOLDER, filename)
        file.save(file_path)
        
        stat = os.stat(file_path)
        with open(file_path, 'rb') as f:
            file_hash = hashlib.sha256(f.read()).hexdigest()
            
        new_file = File(
            path=filename,
            hash=file_hash,
            last_modified=datetime.fromtimestamp(stat.st_mtime),
            size=stat.st_size,
            owner_id=current_user.id
        )
        
        # 更新用户已使用的存储空间
        current_user.storage_used += stat.st_size
        
        db.session.add(new_file)
        db.session.commit()
        
        return jsonify({'message': '文件上传成功'})
    
    return jsonify({'error': '文件上传失败'}), 400

@app.route('/api/download/<path:filename>')
@jwt_required()
def download_file(filename):
    current_user = User.query.get(get_jwt_identity())
    file_record = File.query.filter_by(path=filename).first()
    
    if not file_record:
        return jsonify({'error': '文件不存在'}), 404
        
    # 检查用户是否有权限下载文件
    if not (file_record.owner_id == current_user.id or
            file_record.is_public or
            current_user.role == UserRole.ADMIN or
            FileShare.query.filter_by(
                file_id=file_record.id,
                user_id=current_user.id
            ).first()):
        return jsonify({'error': '没有权限下载此文件'}), 403
        
    file_path = os.path.join(UPLOAD_FOLDER, filename)
    return send_file(file_path, as_attachment=True)

@app.route('/api/files/<int:file_id>/share', methods=['POST'])
@jwt_required()
def share_file(file_id):
    current_user = User.query.get(get_jwt_identity())
    file_record = File.query.get(file_id)
    
    if not file_record:
        return jsonify({'error': '文件不存在'}), 404
    
    if not (file_record.owner_id == current_user.id or current_user.role == UserRole.ADMIN):
        return jsonify({'error': '没有权限共享此文件'}), 403

    data = request.get_json()
    share_type = data.get('type')

    if share_type == 'public':
        file_record.is_public = True
        db.session.commit()
        return jsonify({'message': '文件已设为公开'})
    elif share_type == 'user':
        user_email = data.get('user_email')
        if not user_email:
            return jsonify({'error': '请指定要共享的用户'}), 400
        
        target_user = User.query.filter_by(email=user_email).first()
        if not target_user:
            return jsonify({'error': '用户不存在'}), 404

        existing_share = FileShare.query.filter_by(
            file_id=file_id,
            user_id=target_user.id
        ).first()

        if existing_share:
            return jsonify({'error': '文件已经共享给该用户'}), 400

        new_share = FileShare(
            file_id=file_id,
            user_id=target_user.id,
            created_by=current_user.id
        )
        db.session.add(new_share)
        db.session.commit()
        
        return jsonify({'message': '文件共享成功'})

    return jsonify({'error': '无效的共享类型'}), 400

@app.route('/api/files/<int:file_id>/share', methods=['DELETE'])
@jwt_required()
def unshare_file(file_id):
    current_user = User.query.get(get_jwt_identity())
    file_record = File.query.get(file_id)
    
    if not file_record:
        return jsonify({'error': '文件不存在'}), 404
    
    if not (file_record.owner_id == current_user.id or current_user.role == UserRole.ADMIN):
        return jsonify({'error': '没有权限取消共享此文件'}), 403

    data = request.get_json()
    share_type = data.get('type')

    if share_type == 'public':
        file_record.is_public = False
        db.session.commit()
        return jsonify({'message': '文件已取消公开'})
    elif share_type == 'user':
        user_email = data.get('user_email')
        if not user_email:
            return jsonify({'error': '请指定要取消共享的用户'}), 400
        
        target_user = User.query.filter_by(email=user_email).first()
        if not target_user:
            return jsonify({'error': '用户不存在'}), 404

        share_record = FileShare.query.filter_by(
            file_id=file_id,
            user_id=target_user.id
        ).first()

        if not share_record:
            return jsonify({'error': '文件未共享给该用户'}), 404
            
        db.session.delete(share_record)
        db.session.commit()
        
        return jsonify({'message': '已取消文件共享'})

    return jsonify({'error': '无效的共享类型'}), 400

@app.route('/api/files/<int:file_id>', methods=['DELETE'])
@jwt_required()
def delete_file(file_id):
    current_user = User.query.get(get_jwt_identity())
    file_record = File.query.get(file_id)
    
    if not file_record:
        return jsonify({'error': '文件不存在'}), 404
        
    if not (file_record.owner_id == current_user.id or current_user.role == UserRole.ADMIN):
        return jsonify({'error': '没有权限删除此文件'}), 403
        
    try:
        # 更新用户已使用的存储空间
        file_owner = User.query.get(file_record.owner_id)
        if file_owner:
            file_owner.storage_used = max(0, file_owner.storage_used - file_record.size)
        
        # 删除物理文件
        file_path = os.path.join(UPLOAD_FOLDER, file_record.path)
        if os.path.exists(file_path):
            os.remove(file_path)
            
        # 删除共享记录
        FileShare.query.filter_by(file_id=file_id).delete()
        
        # 删除文件记录
        db.session.delete(file_record)
        db.session.commit()
        
        return jsonify({'message': '文件删除成功'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'删除文件时发生错误: {str(e)}'}), 500

class ClipboardItem(db.Model):
    __tablename__ = 'clipboard_items'
    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.Text, nullable=True)  # 文本内容
    type = db.Column(db.String(10), nullable=False)  # text, code, image
    image_path = db.Column(db.String(500), nullable=True)  # 图片路径
    owner_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

@app.route('/api/clipboard', methods=['GET'])
@jwt_required()
def list_clipboard_items():
    current_user = User.query.get(get_jwt_identity())
    items = ClipboardItem.query.filter_by(owner_id=current_user.id)\
        .order_by(ClipboardItem.created_at.desc())\
        .limit(50)\
        .all()
    
    return jsonify([{
        'id': item.id,
        'content': item.content,
        'type': item.type,
        'image_path': item.image_path if item.type == 'image' else None,
        'created_at': item.created_at.isoformat()
    } for item in items])

@app.route('/api/clipboard', methods=['POST'])
@jwt_required()
def create_clipboard_item():
    current_user = User.query.get(get_jwt_identity())
    
    if 'file' in request.files:  # 处理图片
        file = request.files['file']
        if not file.filename:
            return jsonify({'error': '没有选择文件'}), 400
            
        if not file.content_type.startswith('image/'):
            return jsonify({'error': '只支持图片文件'}), 400
            
        try:
            # 创建图片存储目录
            image_dir = os.path.join(UPLOAD_FOLDER, 'clipboard_images')
            os.makedirs(image_dir, exist_ok=True)
            
            # 读取文件内容并加密
            file_content = file.read()
            encrypted_content = crypto.encrypt(file_content)
            
            # 生成唯一文件名
            timestamp = datetime.utcnow().strftime('%Y%m%d%H%M%S')
            filename = f"{timestamp}_{secure_filename(file.filename)}.enc"
            file_path = os.path.join(image_dir, filename)
            
            # 保存加密后的内容
            with open(file_path, 'wb') as f:
                f.write(base64.b64decode(encrypted_content.encode()))
            
            # 创建记录
            item = ClipboardItem(
                type='image',
                image_path=filename,
                owner_id=current_user.id
            )
            
            db.session.add(item)
            db.session.commit()
            
            return jsonify({
                'id': item.id,
                'type': item.type,
                'image_path': filename,
                'created_at': item.created_at.isoformat()
            }), 201
        except Exception as e:
            print(f"Error saving encrypted image: {e}")  # 调试日志
            db.session.rollback()
            return jsonify({'error': f'保存加密图片失败: {str(e)}'}), 500

    else:  # 处理文本
        data = request.get_json()
        if not data or 'content' not in data:
            return jsonify({'error': '缺少内容'}), 400
            
        # 加密文本内容
        encrypted_content = crypto.encrypt(data['content'])
        
        item = ClipboardItem(
            content=encrypted_content,
            type=data.get('type', 'text'),
            owner_id=current_user.id
        )
        
        db.session.add(item)
        db.session.commit()
        
        return jsonify({
            'id': item.id,
            'content': data['content'],  # 返回原始内容
            'type': item.type,
            'created_at': item.created_at.isoformat()
        }), 201

@app.route('/api/clipboard/<int:item_id>', methods=['DELETE'])
@jwt_required()
def delete_clipboard_item(item_id):
    current_user = User.query.get(get_jwt_identity())
    item = ClipboardItem.query.get_or_404(item_id)
    
    if item.owner_id != current_user.id:
        return jsonify({'error': '没有权限删除此内容'}), 403
        
    try:
        if item.type == 'image' and item.image_path:
            # 删除图片文件
            file_path = os.path.join(UPLOAD_FOLDER, 'clipboard_images', item.image_path)
            if os.path.exists(file_path):
                os.remove(file_path)
        
        db.session.delete(item)
        db.session.commit()
        return jsonify({'message': '删除成功'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'删除失败: {str(e)}'}), 500

@app.route('/api/clipboard/image/<int:item_id>')
@jwt_required()
def get_clipboard_image(item_id):
    try:
        current_user = User.query.get(get_jwt_identity())
        if not current_user:
            return jsonify({'error': '用户不存在'}), 401

        item = ClipboardItem.query.get_or_404(item_id)
        
        if item.owner_id != current_user.id:
            return jsonify({'error': '没有权限查看此图片'}), 403
            
        if item.type != 'image' or not item.image_path:
            return jsonify({'error': '图片不存在'}), 404
            
        file_path = os.path.join(UPLOAD_FOLDER, 'clipboard_images', item.image_path)
        if not os.path.exists(file_path):
            return jsonify({'error': '图片文件不存在'}), 404

        # 读取加密的图片内容
        with open(file_path, 'rb') as f:
            encrypted_content = base64.b64encode(f.read()).decode()
        
        # 解密图片内容
        decrypted_content = crypto.decrypt(encrypted_content)
        if not decrypted_content:
            return jsonify({'error': '图片解密失败'}), 500

        # 返回解密后的图片
        return send_file(
            io.BytesIO(decrypted_content),
            mimetype='image/*',
            as_attachment=False
        )
    except Exception as e:
        print(f"Error sending file: {e}")  # 调试日志
        return jsonify({'error': '读取图片失败'}), 500

@app.route('/api/users/<int:user_id>/reset-password', methods=['POST'])
@jwt_required()
def reset_password(user_id):
    current_user = User.query.get(get_jwt_identity())
    target_user = User.query.get(user_id)
    
    if not target_user:
        return jsonify({'error': '用户不存在'}), 404
        
    # 只有管理员可以重置他人密码，普通用户只能重置自己的密码
    if current_user.role != UserRole.ADMIN and current_user.id != user_id:
        return jsonify({'error': '没有权限执行此操作'}), 403
        
    data = request.get_json()
    if not data or 'new_password' not in data:
        return jsonify({'error': '请提供新密码'}), 400
        
    new_password = data['new_password']
    if len(new_password) < 6:
        return jsonify({'error': '密码长度至少为6位'}), 400
        
    # 加密新密码并更新
    hashed_password = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt())
    target_user.password = hashed_password
    db.session.commit()
    
    return jsonify({'message': '密码重置成功'})

@app.route('/api/clipboard/<int:item_id>')
@jwt_required()
def get_clipboard_item(item_id):
    current_user = User.query.get(get_jwt_identity())
    item = ClipboardItem.query.get_or_404(item_id)
    
    if item.owner_id != current_user.id:
        return jsonify({'error': '没有权限访问此内容'}), 403
        
    if item.type == 'image':
        # 读取并解密图片
        file_path = os.path.join(UPLOAD_FOLDER, 'clipboard_images', item.image_path)
        with open(file_path, 'rb') as f:
            encrypted_content = base64.b64encode(f.read()).decode()
        decrypted_content = crypto.decrypt(encrypted_content)
        return send_file(
            io.BytesIO(decrypted_content),
            mimetype='image/*',
            as_attachment=False
        )
    else:
        # 解密文本内容
        decrypted_content = crypto.decrypt(item.content).decode()
        return jsonify({
            'id': item.id,
            'content': decrypted_content,
            'type': item.type,
            'created_at': item.created_at.isoformat()
        })

if __name__ == '__main__':
    init_upload_folder()
    
    # 在应用上下文中初始化数据库
    with app.app_context():
        try:
            db.create_all()
            create_initial_admin()
        except Exception as e:
            print(f"Error during initialization: {e}")
    
    observer = Observer()
    event_handler = FileChangeHandler(app.app_context())
    observer.schedule(event_handler, UPLOAD_FOLDER, recursive=False)
    observer.start()
    
    try:
        app.run(port=5002, debug=True)
    finally:
        observer.stop()
        observer.join()
