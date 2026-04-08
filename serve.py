#!/usr/bin/env python3
"""开发用的 HTTP 服务器，禁用缓存 + 给 ES Module import 路径加每次加载唯一的版本号"""
import http.server
import socketserver
import os
import re

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

# 匹配 import/export 语句里的相对 .js 路径
IMPORT_RE = re.compile(r"""(\bfrom\s+|\bimport\s*\(?\s*)(['"])(\.[^'"]+\.js)(['"])""")

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_GET(self):
        path = self.path.split('?')[0]
        # 只对 .js 文件做 import 路径重写：把版本号透传下去
        if path.endswith('.js'):
            file_path = self.translate_path(path)
            if os.path.isfile(file_path):
                # 取请求中的 ?v=xxx，没有就用 0
                query = self.path.split('?', 1)[1] if '?' in self.path else ''
                v_match = re.search(r'v=([^&]+)', query)
                version = v_match.group(1) if v_match else ''
                try:
                    with open(file_path, 'rb') as f:
                        content = f.read().decode('utf-8')
                    if version:
                        # 把内部 import 的路径都加上同一个 ?v=
                        content = IMPORT_RE.sub(
                            lambda m: f"{m.group(1)}{m.group(2)}{m.group(3)}?v={version}{m.group(4)}",
                            content
                        )
                    body = content.encode('utf-8')
                    self.send_response(200)
                    self.send_header('Content-Type', 'text/javascript; charset=utf-8')
                    self.send_header('Content-Length', str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                    return
                except Exception as e:
                    print(f"Error rewriting {file_path}: {e}")
        super().do_GET()

    def log_message(self, format, *args):
        pass

with socketserver.TCPServer(("127.0.0.1", PORT), NoCacheHandler) as httpd:
    print(f"Serving at http://127.0.0.1:{PORT}")
    httpd.allow_reuse_address = True
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
