from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager, create_access_token, get_jwt_identity, jwt_required
from werkzeug.utils import secure_filename
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from flask_socketio import SocketIO, emit
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
import logging
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 从环境变量加载配置
UPLOAD_FOLDER = os.environ.get('UPLOAD_FOLDER', 'uploads')
SYNC_FOLDER = os.environ.get('SYNC_FOLDER', 'sync')
SQLALCHEMY_DATABASE_URI = os.environ.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///websync.db')
JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'your-secret-key')
JWT_ACCESS_TOKEN_EXPIRES = int(os.environ.get('JWT_ACCESS_TOKEN_EXPIRES', 86400))

app = Flask(__name__)

# 配置 CORS，允许所有跨域请求（仅用于开发环境）
CORS(app, supports_credentials=True)

# 配置
app.config['SQLALCHEMY_DATABASE_URI'] = SQLALCHEMY_DATABASE_URI
app.config['JWT_SECRET_KEY'] = JWT_SECRET_KEY
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(seconds=JWT_ACCESS_TOKEN_EXPIRES)

db = SQLAlchemy(app)
jwt = JWTManager(app)

# 初始化 SocketIO
socketio = SocketIO(app, cors_allowed_origins="*")

@socketio.on('connect')
def handle_connect():
    print('Client connected')

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')

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
    def __init__(self, app_context, socketio):
        self.app_context = app_context
        self.socketio = socketio

    def on_modified(self, event):
        if not event.is_directory:
            with self.app_context:
                # 检查文件是否真的发生了变化
                file_path = event.src_path
                rel_path = os.path.relpath(file_path, UPLOAD_FOLDER)
                file_record = File.query.filter_by(path=rel_path).first()
                
                if file_record:
                    # 获取文件当前状态
                    stat = os.stat(file_path)
                    current_size = stat.st_size
                    current_mtime = datetime.fromtimestamp(stat.st_mtime)
                    
                    # 只有当文件大小或修改时间发生变化时才更新
                    if current_size != file_record.size or current_mtime != file_record.last_modified:
                        update_file_info(event.src_path)
                        # 发送文件更新事件
                        self.socketio.emit('files_updated', {'message': '文件已更新'})
                else:
                    # 如果是新文件，则更新并发送通知
                    update_file_info(event.src_path)
                    self.socketio.emit('files_updated', {'message': '新文件已添加'})

    def on_created(self, event):
        if not event.is_directory:
            with self.app_context:
                # 检查文件是否已存在于数据库中
                file_path = event.src_path
                rel_path = os.path.relpath(file_path, UPLOAD_FOLDER)
                file_record = File.query.filter_by(path=rel_path).first()
                
                if not file_record:
                    update_file_info(event.src_path)
                    self.socketio.emit('files_updated', {'message': '新文件已添加'})

    def on_deleted(self, event):
        if not event.is_directory:
            with self.app_context:
                # 检查文件是否存在于数据库中
                file_path = event.src_path
                rel_path = os.path.relpath(file_path, UPLOAD_FOLDER)
                file_record = File.query.filter_by(path=rel_path).first()
                
                if file_record:
                    db.session.delete(file_record)
                    db.session.commit()
                    self.socketio.emit('files_updated', {'message': '文件已删除'})

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

def get_current_user():
    try:
        user_id = int(get_jwt_identity())
        return User.query.get(user_id)
    except (ValueError, TypeError):
        return None

@app.route('/api/register', methods=['POST'])
@jwt_required()
def register():
    current_user = User.query.get(get_jwt_identity())
    if current_user.role not in [UserRole.ADMIN, UserRole.MANAGER]:
        return jsonify({'error': '没有权限创建用户'}), 403
        
    data = request.get_json()
    if not data or 'email' not in data or 'password' not in data:
        return jsonify({'error': '请提供邮箱和密码'}), 400
        
    if User.query.filter_by(email=data['email']).first():
        return jsonify({'error': '邮箱已被注册'}), 400
        
    # 验证密码长度
    if len(data['password']) < 6:
        return jsonify({'error': '密码长度至少为6位'}), 400
        
    # 创建新用户
    hashed_password = bcrypt.hashpw(data['password'].encode('utf-8'), bcrypt.gensalt())
    new_user = User(
        email=data['email'],
        password=hashed_password,
        role=data.get('role', UserRole.USER),
        created_by=current_user.id
    )
    
    db.session.add(new_user)
    db.session.commit()
    
    # 创建访问令牌，确保 new_user.id 转换为字符串
    access_token = create_access_token(identity=str(new_user.id))
    
    return jsonify({
        'access_token': access_token,
        'user': {
            'id': new_user.id,
            'email': new_user.email,
            'role': new_user.role
        }
    }), 201

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data or 'email' not in data or 'password' not in data:
        return jsonify({'error': '请提供邮箱和密码'}), 400
        
    user = User.query.filter_by(email=data['email']).first()
    if not user:
        return jsonify({'error': '用户不存在'}), 401
        
    # 检查登录尝试次数和时间限制
    if user.login_attempts >= 5:
        if user.last_login_attempt and (datetime.utcnow() - user.last_login_attempt).total_seconds() < 300:
            return jsonify({'error': '登录尝试次数过多，请5分钟后再试'}), 429
        else:
            # 重置登录尝试次数
            user.login_attempts = 0
            
    if not bcrypt.checkpw(data['password'].encode('utf-8'), user.password):
        # 更新登录尝试记录
        user.login_attempts += 1
        user.last_login_attempt = datetime.utcnow()
        db.session.commit()
        return jsonify({'error': '密码错误'}), 401
        
    # 登录成功，重置登录尝试记录
    user.login_attempts = 0
    user.last_login_attempt = None
    db.session.commit()
    
    # 创建访问令牌，确保 user.id 转换为字符串
    access_token = create_access_token(identity=str(user.id))
    
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
    try:
        current_user = get_current_user()
        if not current_user:
            return jsonify({'error': '用户未找到'}), 404
            
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
    except Exception as e:
        print(f"Error in get_users: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/files', methods=['GET'])
@jwt_required()
def list_files():
    try:
        current_user = get_current_user()
        if not current_user:
            return jsonify({'error': '用户未找到'}), 404
        
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
    except Exception as e:
        print(f"Error in list_files: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/upload', methods=['POST'])
@jwt_required()
def upload_file():
    try:
        logger.info("开始处理文件上传请求")
        current_user = get_current_user()
        if not current_user:
            logger.error("用户未找到")
            return jsonify({'error': '用户未找到'}), 404
        
        logger.info(f"当前用户: {current_user.email}")
        
        if 'file' not in request.files:
            logger.error("请求中没有文件")
            return jsonify({'error': '没有文件被上传'}), 400
            
        file = request.files['file']
        if file.filename == '':
            logger.error("文件名为空")
            return jsonify({'error': '没有选择文件'}), 400
            
        if file:
            logger.info(f"准备上传文件: {file.filename}")
            # 检查文件大小和存储限制
            file_size = len(file.read())
            file.seek(0)  # 重置文件指针
            
            logger.info(f"文件大小: {file_size}, 当前已用空间: {current_user.storage_used}, 存储限制: {current_user.storage_limit}")
            
            if current_user.storage_used + file_size > current_user.storage_limit:
                logger.error("存储空间不足")
                return jsonify({'error': '存储空间不足'}), 400
                
            filename = secure_filename(file.filename)
            logger.info(f"安全文件名: {filename}")
            
            # 确保上传目录存在
            os.makedirs(UPLOAD_FOLDER, exist_ok=True)
            
            file_path = os.path.join(UPLOAD_FOLDER, filename)
            logger.info(f"文件保存路径: {file_path}")
            
            try:
                file.save(file_path)
                logger.info("文件保存成功")
            except Exception as e:
                logger.error(f"文件保存失败: {str(e)}")
                return jsonify({'error': f'文件保存失败: {str(e)}'}), 500
            
            try:
                stat = os.stat(file_path)
                with open(file_path, 'rb') as f:
                    file_hash = hashlib.sha256(f.read()).hexdigest()
                    
                logger.info(f"文件哈希值: {file_hash}")
                    
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
                logger.info("文件信息保存到数据库成功")
                
                # 发送文件更新通知
                socketio.emit('files_updated', {'message': '新文件已上传'})
                
                return jsonify({
                    'message': '文件上传成功',
                    'file': {
                        'id': new_file.id,
                        'path': new_file.path,
                        'size': new_file.size,
                        'modified': new_file.last_modified.isoformat(),
                        'owner': current_user.email,
                        'type': 'own',
                        'is_public': new_file.is_public
                    }
                })
            except Exception as e:
                logger.error(f"数据库操作失败: {str(e)}")
                if os.path.exists(file_path):
                    os.remove(file_path)
                    logger.info("已删除已上传的文件")
                db.session.rollback()
                return jsonify({'error': f'保存文件信息失败: {str(e)}'}), 500
        
        logger.error("文件上传失败：未知原因")
        return jsonify({'error': '文件上传失败'}), 400
        
    except Exception as e:
        logger.error(f"文件上传过程中发生错误: {str(e)}")
        db.session.rollback()
        return jsonify({'error': f'文件上传失败: {str(e)}'}), 500

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
        
        # 发送文件更新通知
        socketio.emit('files_updated', {'message': '文件已删除'})
        
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
    try:
        current_user = get_current_user()
        if not current_user:
            return jsonify({'error': '用户未找到'}), 404
            
        items = ClipboardItem.query.filter_by(owner_id=current_user.id).order_by(ClipboardItem.id.desc()).all()
        result = []
        for item in items:
            try:
                if item.type in ['text', 'code']:
                    decrypted_content = crypto.decrypt(item.content)
                    content = decrypted_content.decode('utf-8')
                else:
                    content = item.content
                
                result.append({
                    'id': item.id,
                    'content': content,
                    'type': item.type,
                    'created_at': item.created_at.strftime('%Y-%m-%d %H:%M:%S')
                })
            except Exception as e:
                print(f"解密错误: {str(e)}")  # 调试日志
                result.append({
                    'id': item.id,
                    'content': '解密失败',
                    'type': item.type,
                    'created_at': item.created_at.strftime('%Y-%m-%d %H:%M:%S')
                })
        
        return jsonify(result)
    except Exception as e:
        print(f"Error in list_clipboard_items: {str(e)}")
        return jsonify({'error': str(e)}), 500

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
            file_content = file.read()  # 已经是bytes类型
            encrypted_content = crypto.encrypt(file_content)  # 返回bytes类型
            
            # 生成唯一文件名
            timestamp = datetime.utcnow().strftime('%Y%m%d%H%M%S')
            filename = f"{timestamp}_{secure_filename(file.filename)}.enc"
            file_path = os.path.join(image_dir, filename)
            
            # 直接写入加密后的二进制内容
            with open(file_path, 'wb') as f:
                f.write(encrypted_content)
            
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
            
        try:
            # 加密文本内容
            encrypted_content = crypto.encrypt(data['content'])
            
            item = ClipboardItem(
                content=encrypted_content,  # 直接存储加密后的内容
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
        except Exception as e:
            print(f"Error saving encrypted text: {e}")  # 调试日志
            db.session.rollback()
            return jsonify({'error': f'保存加密文本失败: {str(e)}'}), 500

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
        current_user = get_current_user()
        if not current_user:
            return jsonify({'error': '用户未找到'}), 404

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
            encrypted_content = f.read()  # 读取为bytes类型
        
        # 解密图片内容
        try:
            decrypted_content = crypto.decrypt(encrypted_content)  # 返回bytes类型
            if not decrypted_content:
                raise Exception('解密后的内容为空')
                
            # 返回解密后的图片
            return send_file(
                io.BytesIO(decrypted_content),
                mimetype='image/*',
                as_attachment=False
            )
        except Exception as e:
            print(f"图片解密错误: {str(e)}")  # 调试日志
            return jsonify({'error': '图片解密失败'}), 500
            
    except Exception as e:
        print(f"读取图片错误: {str(e)}")  # 调试日志
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

@app.route('/api/users/<int:user_id>', methods=['DELETE'])
@jwt_required()
def delete_user(user_id):
    try:
        current_user = get_current_user()
        if not current_user:
            return jsonify({'error': '用户未找到'}), 404
            
        if current_user.role != UserRole.ADMIN:
            return jsonify({'error': '只有管理员可以删除用户'}), 403
            
        target_user = User.query.get(user_id)
        if not target_user:
            return jsonify({'error': '要删除的用户不存在'}), 404
            
        if target_user.role == UserRole.ADMIN:
            return jsonify({'error': '不能删除管理员账户'}), 403
            
        # 删除用户的文件
        user_files = File.query.filter_by(owner_id=user_id).all()
        for file in user_files:
            file_path = os.path.join(UPLOAD_FOLDER, file.path)
            if os.path.exists(file_path):
                os.remove(file_path)
            db.session.delete(file)
            
        # 删除用户的剪贴板内容
        clipboard_items = ClipboardItem.query.filter_by(owner_id=user_id).all()
        for item in clipboard_items:
            if item.type == 'image' and item.image_path:
                file_path = os.path.join(UPLOAD_FOLDER, 'clipboard_images', item.image_path)
                if os.path.exists(file_path):
                    os.remove(file_path)
            db.session.delete(item)
            
        # 删除用户的文件共享记录
        FileShare.query.filter_by(user_id=user_id).delete()
        FileShare.query.filter_by(created_by=user_id).delete()
        
        # 删除用户
        db.session.delete(target_user)
        db.session.commit()
        
        return jsonify({'message': '用户删除成功'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'删除用户失败: {str(e)}'}), 500

@app.route('/api/clipboard/<int:item_id>')
@jwt_required()
def get_clipboard_item(item_id):
    try:
        current_user = get_current_user()
        if not current_user:
            return jsonify({'error': '用户未找到'}), 404
            
        item = ClipboardItem.query.get_or_404(item_id)
        
        if item.owner_id != current_user.id:
            return jsonify({'error': '没有权限访问此内容'}), 403
            
        if item.type == 'image':
            # 读取并解密图片
            file_path = os.path.join(UPLOAD_FOLDER, 'clipboard_images', item.image_path)
            with open(file_path, 'rb') as f:
                encrypted_content = f.read()
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
    except Exception as e:
        print(f"Error in get_clipboard_item: {str(e)}")
        return jsonify({'error': str(e)}), 500

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
    event_handler = FileChangeHandler(app.app_context(), socketio)
    observer.schedule(event_handler, UPLOAD_FOLDER, recursive=False)
    observer.start()
    
    try:
        # 使用 gevent 运行 WebSocket 服务器
        from gevent import pywsgi
        from geventwebsocket.handler import WebSocketHandler
        server = pywsgi.WSGIServer(('127.0.0.1', 5002), app, handler_class=WebSocketHandler)
        print('WebSync 服务已启动，监听地址：http://127.0.0.1:5002')
        server.serve_forever()
    finally:
        observer.stop()
        observer.join()
