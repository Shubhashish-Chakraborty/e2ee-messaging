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

def verifyPassword(password: str, stored: str, username: str, pepper: str) -> bool:
    return HASH_PASSWORD(password, username, pepper) == stored


def createToken(uid: str, username: str, secret: str) -> str:
    payload = base64.b64encode(
        json.dumps({"id": uid, "username": username}).encode()
    ).decode("ascii")
    sig = _hmac.new(
        secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    return f"{payload}.{sig}"

def verifyToken(raw: str, secret: str):
    if not raw:
        return None
    try:
        token = raw.removeprefix("Bearer ").strip()
        dot   = token.rfind(".")
        if dot == -1:
            return None
        p, sig = token[:dot], token[dot + 1:]
        exp = _hmac.new(
            secret.encode("utf-8"), p.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        if not _hmac.compare_digest(sig, exp):
            return None
        padding = (4 - len(p) % 4) % 4
        return json.loads(base64.b64decode(p + "=" * padding).decode("utf-8"))
    except Exception:
        return None

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
    githubUrl = body.get("githubUrl")
    password = body.get("password")
    public_key = body.get("public_key")

    if not username or not githubUrl or not password or not public_key:
        return err("username, githubUrl, password, publicKey: Something is missing!")
    
    # github url validation:
    if not githubUrl.startswith("https://github.com"):
        return err("Invalid Github URL, it should start with: https://github.com")
    
    try:
        hashedPassword = HASH_PASSWORD(password, username, env.PEPPER)
        await env.DB.prepare(
            "INSERT INTO users (username, githubUrl, password_hash, public_key) VALUES (?, ?, ?, ?)"
        ).bind(username, githubUrl, hashedPassword, public_key).run()

    except Exception as e:
        if "UNIQUE" in str(e):
            return err("Username already exists in the database!", 409)
        return err(f"Something went wrong: {e}", 500)

    return ok(None, f"{username} Successfully Registered!")

async def api_login(req, env):
    body, badResponse = await parse_json_object(req)
    if badResponse:
        return badResponse

    username = body.get("username")
    password = body.get("password")
    if not username or not password:
        return err("username and password: something is wrong or missing")
    
    # check:
    res = await env.DB.prepare(
        "SELECT id, username, password_hash, public_key FROM users WHERE username=?"
    ).bind(username).first()

    if not res:
        return err("Invalid Credentials!", 401)
    
    row = res.to_py()
    
    if not verifyPassword(password, row["password_hash"], username, env.PEPPER):
        return err("Invalid credentials", 401)

    token = createToken(str(row["id"]), username, env.JWT_SECRET)
    return ok({
        "token": token,
        "user": {"id": row["id"], "username": username, "public_key": row["public_key"]}
    }, f"{username} Successfully Logged IN!")

async def api_get_users(req, env):
    try:
        res = await env.DB.prepare(
            "SELECT id, username, githubUrl, public_key FROM users"
        ).all()
        userData = res.results.to_py() if res.results else []
        return ok({
            "users": userData
        })
    
    except Exception as e:
        return err(f"something went wrong: {e}", 500)
    
async def api_delete_users_all(req, env):
    try:
        res = await env.DB.prepare(
            "DELETE FROM users"
        ).run()
        return ok({
            "message": "all users deleted!"
        })
    except Exception as e:
        return err(f"something went wrong: {e}", 500)

async def _dispatch(request, env):
    path = urlparse(request.url).path
    method = request.method.upper()

    if method == "OPTIONS":
        return Response("", status=204, headers=_CORS)
    
    if path == "/test" and method == "GET":
        return await api_home(request, env)
    
    if path == "/api/auth/signup" and method == "POST":
        return await api_signup(request, env)

    if path == "/api/auth/login" and method == "POST":
        return await api_login(request, env)
    
    if path == "/users" and method == "GET":
        return await api_get_users(request, env)
    
    if path == "/delete-all" and method == "DELETE":
        return await api_delete_users_all(request, env)

async def on_fetch(request, env):
    try:
        return await _dispatch(request, env)
    except Exception as e:
        return err(f"Server error: {e}")