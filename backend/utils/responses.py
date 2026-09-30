from flask import jsonify


def success(data=None, status=200, **extra):
    body = {"success": True, "data": data}
    body.update(extra)
    return jsonify(body), status


def error(message, status=400, details=None):
    body = {"success": False, "error": {"message": message}}
    if details:
        body["error"]["details"] = details
    return jsonify(body), status
