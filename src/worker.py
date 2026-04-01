from workers import WorkerEntrypoint, Response
from urllib.parse import urlparse
import json

class Default(WorkerEntrypoint):
    async def on_fetch(self, request):
        url = urlparse(request.url)
        path = url.path
        method = request.method

        JWT_SECRET = self.env.JWT_SECRET

        headers = {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization"
        }

        if method == "OPTIONS":
            return Response("", status=204, headers=headers)
        
        def json_response(data, status=200):
            return Response(json.dumps(data), status=status, headers=headers)
        
        try:
            if path == "/test" and method == "GET":
                return json_response({
                    "message": "done working"
                })
            
            if path == "/" and method == "GET":
                return json_response({
                    "message": "home route working!"
                })
            
        except Exception as e:
            return json_response({
                "error": f"Server issues: {e}"
            }, 500)
        
        return json_response({"error": "Route Not Found"}, 404)