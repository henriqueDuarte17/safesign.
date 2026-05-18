import json
import mimetypes
import os
import pathlib
import sys
import uuid
import urllib.request

BASE_URL = 'http://127.0.0.1:3000'
UPLOAD_PATH = pathlib.Path(__file__).parent / 'upload-test.txt'
if not UPLOAD_PATH.exists():
    UPLOAD_PATH.write_text('Teste de upload com signatários.')

boundary = uuid.uuid4().hex
body_parts = []

def add_field(name, value):
    body_parts.append(f'--{boundary}'.encode('utf-8'))
    body_parts.append(f'Content-Disposition: form-data; name="{name}"'.encode('utf-8'))
    body_parts.append(b'')
    body_parts.append(str(value).encode('utf-8'))

add_field('name', 'Documento de Teste para Signatários')
add_field('category', 'Contrato')
add_field('user_email', 'henrique.acduarte@gmail.com')
add_field('signers', json.dumps(['joao@gmail.com']))

body_parts.append(f'--{boundary}'.encode('utf-8'))
body_parts.append(f'Content-Disposition: form-data; name="file"; filename="{UPLOAD_PATH.name}"'.encode('utf-8'))
content_type = mimetypes.guess_type(UPLOAD_PATH.name)[0] or 'application/octet-stream'
body_parts.append(f'Content-Type: {content_type}'.encode('utf-8'))
body_parts.append(b'')
body_parts.append(UPLOAD_PATH.read_bytes())
body_parts.append(f'--{boundary}--'.encode('utf-8'))
body_parts.append(b'')

body = b'\r\n'.join(body_parts)
req = urllib.request.Request(
    f'{BASE_URL}/api/documents/upload',
    data=body,
    method='POST',
    headers={
        'Content-Type': f'multipart/form-data; boundary={boundary}',
        'Content-Length': str(len(body)),
    }
)

print('Sending upload request...')
try:
    with urllib.request.urlopen(req) as resp:
        result = resp.read().decode('utf-8')
        print('UPLOAD RESPONSE CODE:', resp.status)
        print(result)
except urllib.error.HTTPError as e:
    print('UPLOAD FAILED', e.code, e.reason)
    print(e.read().decode('utf-8'))
    sys.exit(1)

print('\nQuerying documents for joao@gmail.com...')
req = urllib.request.Request(f'{BASE_URL}/api/documents?email=joao@gmail.com')
with urllib.request.urlopen(req) as resp:
    data = json.load(resp)
    print('DOCUMENT COUNT FOR joao@gmail.com:', len(data))
    if data:
        print(json.dumps(data[0], indent=2, ensure_ascii=False))
