import httpx
import os

BACKEND = os.environ.get('AIPS_BACKEND', 'http://127.0.0.1:8000')

def main():
    print('Checking backend -> AI proxy (GET /api/ai/camera/list)')
    with httpx.Client() as c:
        r = c.get(f"{BACKEND}/api/ai/camera/list", timeout=10.0)
        print('status', r.status_code)
        try:
            print(r.json())
        except Exception:
            print(r.text[:500])

    sample = 'uploads/7054984770439.mp4'
    if os.path.exists(sample):
        print('Uploading sample file to AI service via proxy...')
        with httpx.Client() as c:
            with open(sample, 'rb') as fh:
                files = {'file': (os.path.basename(sample), fh, 'video/mp4')}
                r = c.post(f"{BACKEND}/api/ai/upload", files=files, timeout=60.0)
                print('upload status', r.status_code)
                try:
                    print(r.json())
                except Exception:
                    print(r.text[:500])
    else:
        print('No sample file found at', sample)

if __name__ == '__main__':
    main()
