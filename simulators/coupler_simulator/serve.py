import http.server
import socketserver
import os
import sys

PORT = 8085
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class DualPathHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def translate_path(self, path):
        # /coupler_simulator/... へのアクセスをカレントディレクトリにマッピング
        if path.startswith('/coupler_simulator/'):
            path = '/' + path[len('/coupler_simulator/'):]
        elif path == '/coupler_simulator':
            path = '/'
        return super().translate_path(path)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

if __name__ == '__main__':
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), DualPathHandler) as httpd:
        print(f"Serving at http://localhost:{PORT}/ and http://localhost:{PORT}/coupler_simulator/index.html")
        sys.stdout.flush()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
