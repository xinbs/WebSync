import os
import unittest
from datetime import datetime, timedelta
from urllib.parse import parse_qs, urlsplit

os.environ['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
os.environ['JWT_SECRET_KEY'] = 'test-only-random-jwt-secret-with-32-characters'

import app as module
from flask_jwt_extended import create_access_token


class MagicLinkTestCase(unittest.TestCase):
    def setUp(self):
        self.context = module.app.app_context()
        self.context.push()
        module.db.create_all()
        self.original_oauth_loader = module.load_google_oauth_config
        module.load_google_oauth_config = lambda: ({
            'allowed_email': 'allowed@example.test'
        }, 'https://example.test/auth/google/callback')
        self.user = module.User(
            email='allowed@example.test',
            password=b'not-used-for-login',
            role=module.UserRole.ADMIN
        )
        module.db.session.add(self.user)
        module.db.session.commit()
        self.access_token = create_access_token(identity=str(self.user.id))
        self.client = module.app.test_client()

    def tearDown(self):
        module.load_google_oauth_config = self.original_oauth_loader
        module.db.session.remove()
        module.db.drop_all()
        self.context.pop()

    def auth_headers(self):
        return {'Authorization': f'Bearer {self.access_token}'}

    def create_code(self, expires_in=120):
        response = self.client.post(
            '/api/auth/magic-link',
            headers=self.auth_headers(),
            json={'expires_in': expires_in}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['Cache-Control'], 'no-store')
        magic_link = response.get_json()['magic_link']
        self.assertNotIn('access_token', magic_link)
        fragment = urlsplit(magic_link).fragment
        code = parse_qs(fragment)['magic_code'][0]
        record = module.MagicLoginCode.query.order_by(
            module.MagicLoginCode.id.desc()
        ).first()
        self.assertNotEqual(record.code_hash, code)
        self.assertEqual(len(record.code_hash), 64)
        return code

    def test_link_is_single_use_and_creates_valid_session(self):
        code = self.create_code()
        first = self.client.post(
            '/api/auth/magic-link/consume',
            json={'code': code}
        )
        self.assertEqual(first.status_code, 200)
        self.assertIn('access_token', first.get_json())

        session = self.client.get(
            '/api/auth/me',
            headers={
                'Authorization': (
                    f"Bearer {first.get_json()['access_token']}"
                )
            }
        )
        self.assertEqual(session.status_code, 200)

        replay = self.client.post(
            '/api/auth/magic-link/consume',
            json={'code': code}
        )
        self.assertEqual(replay.status_code, 400)

    def test_expired_link_is_rejected(self):
        code = self.create_code(expires_in=60)
        record = module.MagicLoginCode.query.one()
        record.expires_at = datetime.utcnow() - timedelta(seconds=1)
        module.db.session.commit()

        response = self.client.post(
            '/api/auth/magic-link/consume',
            json={'code': code}
        )
        self.assertEqual(response.status_code, 400)

    def test_generation_requires_authentication_and_valid_ttl(self):
        unauthenticated = self.client.post(
            '/api/auth/magic-link',
            json={'expires_in': 120}
        )
        self.assertEqual(unauthenticated.status_code, 401)

        invalid_ttl = self.client.post(
            '/api/auth/magic-link',
            headers=self.auth_headers(),
            json={'expires_in': 30}
        )
        self.assertEqual(invalid_ttl.status_code, 400)

    def test_default_ttl_and_hourly_rate_limit(self):
        original_limit = module.MAGIC_LINK_RATE_LIMIT
        module.MAGIC_LINK_RATE_LIMIT = 1
        try:
            first = self.client.post(
                '/api/auth/magic-link',
                headers=self.auth_headers(),
                json={}
            )
            self.assertEqual(first.status_code, 200)
            self.assertEqual(
                first.get_json()['expires_in'],
                module.MAGIC_LINK_DEFAULT_TTL
            )

            second = self.client.post(
                '/api/auth/magic-link',
                headers=self.auth_headers(),
                json={}
            )
            self.assertEqual(second.status_code, 429)
        finally:
            module.MAGIC_LINK_RATE_LIMIT = original_limit

    def test_regeneration_invalidates_previous_unused_link(self):
        first_code = self.create_code()
        second_code = self.create_code()

        first = self.client.post(
            '/api/auth/magic-link/consume',
            json={'code': first_code}
        )
        self.assertEqual(first.status_code, 400)

        second = self.client.post(
            '/api/auth/magic-link/consume',
            json={'code': second_code}
        )
        self.assertEqual(second.status_code, 200)


if __name__ == '__main__':
    unittest.main()
