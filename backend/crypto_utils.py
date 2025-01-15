from Crypto.Cipher import AES
from Crypto.Random import get_random_bytes
from Crypto.Util.Padding import pad, unpad
import base64
import os

class CryptoUtils:
    def __init__(self):
        # 从环境变量获取密钥，如果不存在则生成新密钥
        self.key = os.getenv('ENCRYPTION_KEY', '').encode() or get_random_bytes(32)
        if len(self.key) != 32:
            self.key = get_random_bytes(32)
    
    def encrypt(self, data):
        if isinstance(data, str):
            data = data.encode()
        
        # 生成随机IV
        iv = get_random_bytes(AES.block_size)
        cipher = AES.new(self.key, AES.MODE_CBC, iv)
        
        # 加密数据
        padded_data = pad(data, AES.block_size)
        encrypted_data = cipher.encrypt(padded_data)
        
        # 组合IV和加密数据
        combined = iv + encrypted_data
        
        # Base64编码
        return base64.b64encode(combined).decode('utf-8')
    
    def decrypt(self, encrypted_data):
        try:
            # Base64解码
            encrypted_bytes = base64.b64decode(encrypted_data.encode('utf-8'))
            
            # 分离IV和加密数据
            iv = encrypted_bytes[:AES.block_size]
            cipher_data = encrypted_bytes[AES.block_size:]
            
            # 解密
            cipher = AES.new(self.key, AES.MODE_CBC, iv)
            decrypted_data = unpad(cipher.decrypt(cipher_data), AES.block_size)
            
            return decrypted_data
        except Exception as e:
            print(f"Decryption error: {str(e)}")
            return None

# 创建全局实例
crypto = CryptoUtils() 