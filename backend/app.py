from flask import Flask, request, send_file, jsonify, redirect
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager, create_access_token, get_jwt_identity, jwt_required
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from werkzeug.utils import secure_filename
from werkzeug.exceptions import RequestEntityTooLarge
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from flask_socketio import SocketIO, emit
import os
import glob
import json
import hashlib
import time
import bcrypt
import secrets
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from enum import Enum
from sqlalchemy import Enum as SQLEnum
from crypto_utils import crypto  # 导入加密工具
import base64
import io
import logging
from dotenv import load_dotenv
from routes.patterns import patterns_bp

# 加载环境变量
load_dotenv()

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 从环境变量加载配置
UPLOAD_FOLDER = os.environ.get('UPLOAD_FOLDER', 'uploads')
SYNC_FOLDER = os.environ.get('SYNC_FOLDER', 'sync')
SQLALCHEMY_DATABASE_URI = os.environ.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///websync.db')
JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', '')
JWT_ACCESS_TOKEN_EXPIRES = int(os.environ.get('JWT_ACCESS_TOKEN_EXPIRES', 86400))
ALLOWED_ORIGINS = os.environ.get('ALLOWED_ORIGINS', 'http://localhost:3000').split(',')
MAX_UPLOAD_SIZE = int(os.environ.get('MAX_UPLOAD_SIZE', 100 * 1024 * 1024))
MAGIC_LINK_DEFAULT_TTL = int(os.environ.get('MAGIC_LINK_DEFAULT_TTL', 120))
MAGIC_LINK_MIN_TTL = int(os.environ.get('MAGIC_LINK_MIN_TTL', 60))
MAGIC_LINK_MAX_TTL = int(os.environ.get('MAGIC_LINK_MAX_TTL', 600))
MAGIC_LINK_RATE_LIMIT = int(os.environ.get('MAGIC_LINK_RATE_LIMIT', 10))
GOOGLE_OAUTH_STATE_COOKIE = 'websync_oauth_state'
GOOGLE_OAUTH_STATE_MAX_AGE = 600

if (
    len(JWT_SECRET_KEY) < 32
    or JWT_SECRET_KEY in {'your-secret-key', 'your-secret-key-here'}
    or JWT_SECRET_KEY.startswith('replace-')
):
    raise RuntimeError('JWT_SECRET_KEY 必须配置为至少 32 个字符的随机密钥')
if MAX_UPLOAD_SIZE <= 0:
    raise RuntimeError('MAX_UPLOAD_SIZE 必须大于 0')
if not (
    0 < MAGIC_LINK_MIN_TTL
    <= MAGIC_LINK_DEFAULT_TTL
    <= MAGIC_LINK_MAX_TTL
):
    raise RuntimeError('Magic Link 有效期配置无效')
if MAGIC_LINK_RATE_LIMIT <= 0:
    raise RuntimeError('MAGIC_LINK_RATE_LIMIT 必须大于 0')

app = Flask(__name__)

# 配置 CORS，允许指定源的跨域请求
CORS(app, origins=ALLOWED_ORIGINS, supports_credentials=True)

# 配置
app.config['SQLALCHEMY_DATABASE_URI'] = SQLALCHEMY_DATABASE_URI
app.config['JWT_SECRET_KEY'] = JWT_SECRET_KEY
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(seconds=JWT_ACCESS_TOKEN_EXPIRES)
app.config['MAX_CONTENT_LENGTH'] = MAX_UPLOAD_SIZE

db = SQLAlchemy(app)
jwt = JWTManager(app)

# 初始化 SocketIO
socketio = SocketIO(
    app,
    cors_allowed_origins=ALLOWED_ORIGINS,
    async_mode='eventlet',  # 使用 eventlet 作为异步模式
    ping_timeout=60,
    logger=True,
    engineio_logger=True
)

# 注册路由
app.register_blueprint(patterns_bp, url_prefix='/api/patterns')

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

class MagicLoginCode(db.Model):
    __tablename__ = 'magic_login_codes'
    id = db.Column(db.Integer, primary_key=True)
    code_hash = db.Column(db.String(64), unique=True, nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False, index=True)
    used_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, index=True)

@jwt.token_in_blocklist_loader
def reject_non_allowed_users(jwt_header, jwt_payload):
    """旧账号已经签发的 JWT 也不能继续访问。"""
    try:
        config, _ = load_google_oauth_config()
        allowed_email = config['allowed_email'].strip().lower()
        user = db.session.get(User, int(jwt_payload['sub']))
        return not user or user.email.lower() != allowed_email
    except (KeyError, TypeError, ValueError, OSError, RuntimeError):
        return True

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

        config, _ = load_google_oauth_config()
        allowed_email = config['allowed_email'].strip().lower()
        admin = User.query.filter_by(email=allowed_email).first()
        if not admin:
            # password 字段是旧数据库结构的必填字段；随机值不可用于登录。
            password = bcrypt.hashpw(secrets.token_bytes(32), bcrypt.gensalt())
            admin = User(
                email=allowed_email,
                password=password,
                role=UserRole.ADMIN,
                storage_limit=1024*1024*1024*100  # 管理员默认100GB
            )
            db.session.add(admin)
        else:
            admin.role = UserRole.ADMIN
        db.session.commit()
        print("Google account ready")
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
    return jsonify({'error': '本站只允许指定的 Google 账号登录，不能创建其他账号'}), 403

@app.route('/api/login', methods=['POST'])
def login():
    return jsonify({'error': '密码登录已关闭，请使用 Google 登录'}), 410

def load_google_oauth_config():
    configured_path = os.environ.get('GOOGLE_OAUTH_CLIENT_JSON')
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    candidates = [configured_path] if configured_path else []
    candidates.extend(sorted(glob.glob(os.path.join(project_root, 'client_secret_*.json'))))

    for path in candidates:
        if path and os.path.isfile(path):
            with open(path, 'r', encoding='utf-8') as config_file:
                config = json.load(config_file).get('web')
            required_keys = ('client_id', 'client_secret', 'auth_uri', 'token_uri', 'allowed_email')
            if config and all(config.get(key) for key in required_keys):
                redirect_uris = config.get('redirect_uris') or []
                if not redirect_uris:
                    raise RuntimeError('Google OAuth JSON 中缺少 redirect_uris')
                return config, redirect_uris[0]
    raise RuntimeError('未找到有效的 Google OAuth client_secret JSON')

def get_frontend_url():
    _, callback_uri = load_google_oauth_config()
    callback_parts = urllib.parse.urlsplit(callback_uri)
    return os.environ.get(
        'FRONTEND_URL',
        urllib.parse.urlunsplit((callback_parts.scheme, callback_parts.netloc, '/', '', ''))
    ).rstrip('/')

def frontend_redirect(fragment):
    frontend_url = get_frontend_url()
    return redirect(f'{frontend_url}/#{fragment}')

def no_store_json(payload, status=200):
    response = jsonify(payload)
    response.status_code = status
    response.headers['Cache-Control'] = 'no-store'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Referrer-Policy'] = 'no-referrer'
    return response

@app.route('/api/auth/google', methods=['GET'])
def google_login():
    try:
        config, callback_uri = load_google_oauth_config()
        state = secrets.token_urlsafe(32)
        signed_state = URLSafeTimedSerializer(JWT_SECRET_KEY).dumps(
            state,
            salt='google-oauth-state'
        )
        params = urllib.parse.urlencode({
            'client_id': config['client_id'],
            'redirect_uri': callback_uri,
            'response_type': 'code',
            'scope': 'openid email profile',
            'state': state,
            'prompt': 'select_account'
        })
        response = redirect(f"{config['auth_uri']}?{params}")
        response.set_cookie(
            GOOGLE_OAUTH_STATE_COOKIE,
            signed_state,
            max_age=GOOGLE_OAUTH_STATE_MAX_AGE,
            httponly=True,
            secure=urllib.parse.urlsplit(callback_uri).scheme == 'https',
            samesite='Lax',
            path='/'
        )
        return response
    except (OSError, ValueError, RuntimeError) as error:
        logger.error("Google OAuth 配置错误: %s", error)
        return jsonify({'error': 'Google 登录配置不可用'}), 500

@app.route('/auth/google/callback', methods=['GET'])
def google_callback():
    if request.args.get('error'):
        return frontend_redirect('auth_error=google_denied')

    code = request.args.get('code')
    state = request.args.get('state')
    signed_state = request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)
    if not code or not state or not signed_state:
        return frontend_redirect('auth_error=invalid_state')

    try:
        expected_state = URLSafeTimedSerializer(JWT_SECRET_KEY).loads(
            signed_state,
            salt='google-oauth-state',
            max_age=GOOGLE_OAUTH_STATE_MAX_AGE
        )
        if not secrets.compare_digest(state, expected_state):
            return frontend_redirect('auth_error=invalid_state')

        config, callback_uri = load_google_oauth_config()
        token_body = urllib.parse.urlencode({
            'code': code,
            'client_id': config['client_id'],
            'client_secret': config['client_secret'],
            'redirect_uri': callback_uri,
            'grant_type': 'authorization_code'
        }).encode('utf-8')
        token_request = urllib.request.Request(
            config['token_uri'],
            data=token_body,
            headers={'Content-Type': 'application/x-www-form-urlencoded'}
        )
        with urllib.request.urlopen(token_request, timeout=10) as token_response:
            token_data = json.load(token_response)

        google_access_token = token_data.get('access_token')
        if not google_access_token:
            raise ValueError('Google token 响应中缺少 access_token')

        userinfo_request = urllib.request.Request(
            'https://openidconnect.googleapis.com/v1/userinfo',
            headers={'Authorization': f'Bearer {google_access_token}'}
        )
        with urllib.request.urlopen(userinfo_request, timeout=10) as userinfo_response:
            google_user = json.load(userinfo_response)

        email = str(google_user.get('email', '')).lower()
        allowed_email = config['allowed_email'].strip().lower()
        if email != allowed_email or not google_user.get('email_verified'):
            return frontend_redirect('auth_error=account_not_allowed')

        user = User.query.filter_by(email=allowed_email).first()
        if not user:
            user = User(
                email=allowed_email,
                password=bcrypt.hashpw(secrets.token_bytes(32), bcrypt.gensalt()),
                role=UserRole.ADMIN,
                storage_limit=1024*1024*1024*100
            )
            db.session.add(user)
            db.session.commit()
        elif user.role != UserRole.ADMIN:
            user.role = UserRole.ADMIN
            db.session.commit()

        access_token = create_access_token(identity=str(user.id))
        response = frontend_redirect(
            f'access_token={urllib.parse.quote(access_token, safe="")}'
        )
        response.delete_cookie(GOOGLE_OAUTH_STATE_COOKIE, path='/')
        return response
    except (BadSignature, SignatureExpired):
        return frontend_redirect('auth_error=invalid_state')
    except (OSError, ValueError, urllib.error.URLError, json.JSONDecodeError) as error:
        logger.error("Google OAuth 回调失败: %s", error)
        return frontend_redirect('auth_error=google_failed')

@app.route('/api/auth/me', methods=['GET'])
@jwt_required()
def auth_me():
    user = get_current_user()
    if not user:
        return jsonify({'error': '用户未找到'}), 404
    return jsonify({
        'user': {
            'id': user.id,
            'email': user.email,
            'role': user.role
        }
    })

@app.route('/api/auth/magic-link', methods=['POST'])
@jwt_required()
def create_magic_link():
    current_user = get_current_user()
    if not current_user:
        return no_store_json({'error': '用户未找到'}, 404)

    try:
        config, _ = load_google_oauth_config()
        if current_user.email.lower() != config['allowed_email'].strip().lower():
            return no_store_json({'error': '没有权限生成临时登录链接'}, 403)

        payload = request.get_json(silent=True) or {}
        expires_in = int(payload.get('expires_in', MAGIC_LINK_DEFAULT_TTL))
        if not MAGIC_LINK_MIN_TTL <= expires_in <= MAGIC_LINK_MAX_TTL:
            return no_store_json({
                'error': (
                    f'有效期必须在 {MAGIC_LINK_MIN_TTL} 到 '
                    f'{MAGIC_LINK_MAX_TTL} 秒之间'
                )
            }, 400)

        now = datetime.utcnow()
        recent_count = MagicLoginCode.query.filter(
            MagicLoginCode.user_id == current_user.id,
            MagicLoginCode.created_at >= now - timedelta(hours=1)
        ).count()
        if recent_count >= MAGIC_LINK_RATE_LIMIT:
            return no_store_json({'error': '临时登录链接生成过于频繁，请稍后再试'}, 429)

        # 仅清理一天以前的记录，保留近期记录用于限流和审计。
        MagicLoginCode.query.filter(
            MagicLoginCode.expires_at < now - timedelta(days=1)
        ).delete(synchronize_session=False)

        # 同一账号只保留最新一条未使用链接，重新生成会立即作废旧链接。
        MagicLoginCode.query.filter(
            MagicLoginCode.user_id == current_user.id,
            MagicLoginCode.used_at.is_(None),
            MagicLoginCode.expires_at > now
        ).update({'used_at': now}, synchronize_session=False)

        code = secrets.token_urlsafe(32)
        code_hash = hashlib.sha256(code.encode('utf-8')).hexdigest()
        expires_at = now + timedelta(seconds=expires_in)
        db.session.add(MagicLoginCode(
            code_hash=code_hash,
            user_id=current_user.id,
            expires_at=expires_at
        ))
        db.session.commit()

        magic_link = (
            f'{get_frontend_url()}/#magic_code='
            f'{urllib.parse.quote(code, safe="")}'
        )
        return no_store_json({
            'magic_link': magic_link,
            'expires_in': expires_in,
            'expires_at': expires_at.isoformat() + 'Z'
        })
    except (KeyError, TypeError, ValueError, OSError, RuntimeError):
        db.session.rollback()
        return no_store_json({'error': '无法生成临时登录链接'}, 400)

@app.route('/api/auth/magic-link/consume', methods=['POST'])
def consume_magic_link():
    payload = request.get_json(silent=True) or {}
    code = payload.get('code')
    if not isinstance(code, str) or not 20 <= len(code) <= 200:
        return no_store_json({'error': '临时登录链接无效或已过期'}, 400)

    now = datetime.utcnow()
    code_hash = hashlib.sha256(code.encode('utf-8')).hexdigest()
    record = MagicLoginCode.query.filter_by(code_hash=code_hash).first()
    if not record:
        return no_store_json({'error': '临时登录链接无效或已过期'}, 400)

    user_id = record.user_id
    consumed = MagicLoginCode.query.filter(
        MagicLoginCode.id == record.id,
        MagicLoginCode.used_at.is_(None),
        MagicLoginCode.expires_at > now
    ).update({'used_at': now}, synchronize_session=False)
    if consumed != 1:
        db.session.rollback()
        return no_store_json({'error': '临时登录链接无效或已过期'}, 400)

    try:
        config, _ = load_google_oauth_config()
        user = db.session.get(User, user_id)
        allowed_email = config['allowed_email'].strip().lower()
        if not user or user.email.lower() != allowed_email:
            db.session.commit()
            return no_store_json({'error': '临时登录链接无效或已过期'}, 400)

        db.session.commit()
        access_token = create_access_token(identity=str(user.id))
        return no_store_json({'access_token': access_token})
    except (KeyError, OSError, RuntimeError):
        db.session.rollback()
        return no_store_json({'error': '临时登录链接无效或已过期'}, 400)

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

def _finalize_upload(current_user, filename, file_path):
    """对已写入磁盘的文件计算哈希、入库并广播，返回上传成功响应。"""
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

@app.route('/api/clipboard/attach', methods=['POST'])
@jwt_required()
def attach_file():
    """通过剪贴板通道接收文件：请求体为裸二进制流，文件名走 query 参数。

    用于绕开本地安全软件对 multipart 上传请求的拦截，与 /api/upload 等价。
    """
    try:
        logger.info("开始处理 attach 上传请求")
        current_user = get_current_user()
        if not current_user:
            logger.error("用户未找到")
            return jsonify({'error': '用户未找到'}), 404

        raw_filename = request.args.get('filename', '')
        if not raw_filename:
            logger.error("缺少文件名")
            return jsonify({'error': '缺少文件名'}), 400

        filename = secure_filename(raw_filename)
        if not filename:
            logger.error(f"文件名无效: {raw_filename}")
            return jsonify({'error': '文件名无效'}), 400

        file_size = request.content_length or 0
        logger.info(f"attach 文件: {filename}, 声明大小: {file_size}, 当前已用空间: {current_user.storage_used}, 存储限制: {current_user.storage_limit}")

        if current_user.storage_used + file_size > current_user.storage_limit:
            logger.error("存储空间不足")
            return jsonify({'error': '存储空间不足'}), 400

        # 确保上传目录存在
        os.makedirs(UPLOAD_FOLDER, exist_ok=True)

        file_path = os.path.join(UPLOAD_FOLDER, filename)
        logger.info(f"文件保存路径: {file_path}")

        # 流式写入，避免大文件占用内存
        try:
            with open(file_path, 'wb') as f:
                while True:
                    chunk = request.stream.read(65536)
                    if not chunk:
                        break
                    f.write(chunk)
            logger.info("文件保存成功")
        except Exception as e:
            logger.error(f"文件保存失败: {str(e)}")
            return jsonify({'error': f'文件保存失败: {str(e)}'}), 500

        if os.path.getsize(file_path) == 0:
            os.remove(file_path)
            logger.error("请求体为空")
            return jsonify({'error': '没有文件被上传'}), 400

        return _finalize_upload(current_user, filename, file_path)

    except RequestEntityTooLarge:
        return jsonify({'error': '上传文件超过大小限制'}), 413
    except Exception as e:
        logger.error(f"attach 上传过程中发生错误: {str(e)}")
        db.session.rollback()
        return jsonify({'error': f'文件上传失败: {str(e)}'}), 500

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
            file.stream.seek(0, os.SEEK_END)
            file_size = file.stream.tell()
            file.stream.seek(0)
            
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

            return _finalize_upload(current_user, filename, file_path)
        
        logger.error("文件上传失败：未知原因")
        return jsonify({'error': '文件上传失败'}), 400
        
    except RequestEntityTooLarge:
        return jsonify({'error': '上传文件超过大小限制'}), 413
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

@app.route('/api/users/<int:user_id>', methods=['PUT'])
@jwt_required()
def update_user(user_id):
    try:
        current_user = get_current_user()
        if not current_user:
            return jsonify({'error': '用户未找到'}), 404
            
        # 只有管理员和管理者可以编辑用户
        if current_user.role not in [UserRole.ADMIN, UserRole.MANAGER]:
            return jsonify({'error': '没有权限编辑用户'}), 403
            
        target_user = User.query.get(user_id)
        if not target_user:
            return jsonify({'error': '要编辑的用户不存在'}), 404
            
        # 普通管理者不能编辑管理员账户
        if target_user.role == UserRole.ADMIN and current_user.role != UserRole.ADMIN:
            return jsonify({'error': '没有权限编辑管理员账户'}), 403
            
        data = request.get_json()
        if not data:
            return jsonify({'error': '没有提供有效的数据'}), 400
            
        # 更新邮箱
        if 'email' in data and data['email'] != target_user.email:
            # 检查邮箱是否已被使用
            existing_user = User.query.filter_by(email=data['email']).first()
            if existing_user and existing_user.id != user_id:
                return jsonify({'error': '邮箱已被其他用户使用'}), 400
            target_user.email = data['email']
            
        # 更新角色（只有管理员可以更改角色）
        if 'role' in data and current_user.role == UserRole.ADMIN:
            target_user.role = data['role']
            
        # 更新存储限制
        if 'storage_limit' in data:
            target_user.storage_limit = int(data['storage_limit'])
            
        db.session.commit()
        
        return jsonify({
            'message': '用户更新成功',
            'user': {
                'id': target_user.id,
                'email': target_user.email,
                'role': target_user.role,
                'storage_limit': target_user.storage_limit,
                'storage_used': target_user.storage_used
            }
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'更新用户失败: {str(e)}'}), 500

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
        # 使用 eventlet 运行服务器
        print('WebSync 服务已启动，监听地址：http://0.0.0.0:5002')
        socketio.run(app, host='0.0.0.0', port=5002, debug=False)
    finally:
        observer.stop()
        observer.join()
