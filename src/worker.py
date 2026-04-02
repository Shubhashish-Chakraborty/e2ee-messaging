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

async def parse_json_object(req):
    try:
        text = await req.text()
        body = json.loads(text)
    except Exception:
        return None, err("Invalid JSON body")

    if not isinstance(body, dict):
        return None, err("JSON body must be an object", 400)

    return body, None

_PBKDF2_IT = 100_000

def _user_salt(username: str, pepper: str) -> bytes:
    """Per-user PBKDF2 salt = SHA-256(pepper || username)."""
    return hashlib.sha256(pepper.encode("utf-8") + username.encode("utf-8")).digest()

def HASH_PASSWORD(password: str, username: str, pepper: str) -> str:
    # PBKDF2-SHA256 with per-user derived salt
    dk = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), _user_salt(username, pepper), _PBKDF2_IT
    )
    return base64.b64encode(dk).decode("ascii")

########

async def api_home(request, env):
    return ok({
        "message": "Welcome Home, Hello world!"
    })

async def api_signup(req, env):
    body, badResponse = await parse_json_object(req)
    if badResponse:
        return badResponse
    
    username = body.get("username")
    email = body.get("email")
    password = body.get("password")
    public_key = body.get("public_key")

    if not username or not email or not password or not public_key:
        return err("username, email, password, publicKey: Something is missing!")
    
    try:
        hashedPassword = HASH_PASSWORD(password, username, env.PEPPER)
        await env.DB.prepare(
            "INSERT INTO users (username, email, password_hash, public_key) VALUES (?, ?, ?, ?)"
        ).bind(username, email, hashedPassword, public_key).run()

    except Exception as e:
        if "UNIQUE" in str(e):
            return err("Username already exists in the database!", 409)
        return err(f"Something went wrong!: {e}", 500)

    return ok(None, f"{username} Successfully Registered!")

async def api_get_users(req, env):
    try:
        res = await env.DB.prepare(
            "SELECT id, username, email, public_key FROM users"
        ).all()
        userData = res.results.to_py() if res.results else []
        return ok({
            "users": userData
        })
    
    except Exception as e:
        return err(f"something went wrong! {e}", 500)

async def _dispatch(request, env):
    path = urlparse(request.url).path
    method = request.method.upper()

    if method == "OPTIONS":
        return Response("", status=204, headers=_CORS)
    
    if path == "/test" and method == "GET":
        return await api_home(request, env)
    
    if path == "/api/auth/signup" and method == "POST":
        return await api_signup(request, env)
    
    if path == "/users" and method == "GET":
        return await api_get_users(request, env)
    
async def on_fetch(request, env):
    try:
        return await _dispatch(request, env)
    except Exception as e:
        return err(f"Server error: {e}")