import os
from cryptography.fernet import Fernet

class CryptoUtils:
    def __init__(self):
        self.key_file = 'encryption.key'
        self.fernet = None
        self._load_or_create_key()
    
    def _load_or_create_key(self):
        try:
            if os.path.exists(self.key_file):
                with open(self.key_file, 'rb') as f:
                    key = f.read()
            else:
                key = Fernet.generate_key()
                with open(self.key_file, 'wb') as f:
                    f.write(key)
            self.fernet = Fernet(key)
        except Exception as e:
            print(f"Error handling encryption key: {e}")
            raise
    
    def encrypt(self, data):
        if isinstance(data, str):
            data = data.encode()
        return self.fernet.encrypt(data)
    
    def decrypt(self, data):
        try:
            if isinstance(data, str):
                data = data.encode()
            return self.fernet.decrypt(data)
        except Exception as e:
            print(f"Decryption error: {e}")
            raise

crypto = CryptoUtils() 