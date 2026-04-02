import base64
import hashlib
import hmac as _hmac
import json
import traceback
from workers import Response
from urllib.parse import urlparse


_CORS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
}


def json_resp(data, status: int = 200):
    return Response(
        json.dumps(data),
        status=status,
        headers={"Content-Type": "application/json", **_CORS},
    )

def ok(data=None, msg: str = "OK"):
    body = {
        "success": True,
        "message": msg
    }
    if data is not None:
        body["data"] = data
    return json_resp(body, 200)

def err(msg: str, status: int = 400):
    return json_resp({"error": msg}, status)


async def api_home(request, env):
    return ok({
        "message": "Welcome Home, Hello world!"
    })


async def _dispatch(request, env):
    path = urlparse(request.url).path
    method = request.method.upper()

    if method == "OPTIONS":
        return Response("", status=204, headers=_CORS)
    
    if path == "/" and method == "GET":
        return await api_home(request, env)
    
async def on_fetch(request, env):
    try:
        return await _dispatch(request, env)
    except Exception as e:
        return err(f"Server error: {e}")