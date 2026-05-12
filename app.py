# app.py


import json
import os
import re
import sqlite3
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / 'public'
DB_PATH = BASE_DIR / 'database.sqlite'
SERVER_JS_PATH = BASE_DIR / 'server.js'

app = Flask(__name__, static_folder=str(PUBLIC_DIR), static_url_path='')
CORS(app)

# ---------- Создание папок ----------
for folder in [
    PUBLIC_DIR / 'audio',
    PUBLIC_DIR / 'images' / 'avatars',
    PUBLIC_DIR / 'images' / 'maps',
]:
    folder.mkdir(parents=True, exist_ok=True)

# ---------- База данных ----------
def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_database():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        '''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            login TEXT UNIQUE,
            password TEXT,
            avatar TEXT DEFAULT 'default.png',
            total_xp INTEGER DEFAULT 0,
            current_level INTEGER DEFAULT 1
        )
        '''
    )

    cursor.execute(
        '''
        CREATE TABLE IF NOT EXISTS progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            route_id TEXT,
            route_name TEXT,
            progress_percent INTEGER,
            completion_awarded INTEGER DEFAULT 0,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
        '''
    )

    cursor.execute(
        '''
        CREATE TABLE IF NOT EXISTS favorites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            route_id TEXT,
            point_index INTEGER,
            point_title TEXT,
            point_panorama TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
        '''
    )

    conn.commit()
    conn.close()


# ---------- Константы ----------
XP_PER_LEVEL = 120
THEME_XP_MULTIPLIER = {
    'kazakhstan': 1.0,
    'georgia': 1.15,
    'silk': 1.25
}

DIFFICULTY_XP_MULTIPLIER = {
    'Лёгкий': 1.0,
    'Средний': 1.2,
    'Сложный': 1.4
}


# ---------- Загрузка THEMES и ROUTES из server.js ----------
# Поддерживает:
# const THEMES = ...
# let THEMES = ...
# var THEMES = ...
# export const THEMES = ...


def extract_js_block(content: str, variable_name: str):
    patterns = [
        rf'const\s+{variable_name}\s*=\s*',
        rf'let\s+{variable_name}\s*=\s*',
        rf'var\s+{variable_name}\s*=\s*',
        rf'export\s+const\s+{variable_name}\s*=\s*'
    ]

    match = None

    for pattern in patterns:
        match = re.search(pattern, content)
        if match:
            break

    if not match:
        raise RuntimeError(
            f'Не найден блок {variable_name}. Проверь название переменной в server.js'
        )

    start = match.end()

    while start < len(content) and content[start] not in '[{':
        start += 1

    if start >= len(content):
        raise RuntimeError(f'Ошибка чтения {variable_name}')

    opening = content[start]
    closing = ']' if opening == '[' else '}'

    depth = 0
    in_string = False
    string_char = ''
    escaped = False

    for index in range(start, len(content)):
        char = content[index]

        if in_string:
            if escaped:
                escaped = False
            elif char == '\\':
                escaped = True
            elif char == string_char:
                in_string = False
            continue

        if char in ['\"', "'"]:
            in_string = True
            string_char = char
            continue

        if char == opening:
            depth += 1
        elif char == closing:
            depth -= 1

            if depth == 0:
                return content[start:index + 1]

    raise RuntimeError(f'Не удалось разобрать {variable_name}')


# Используем Node.js только для парсинга JS-объектов.
def load_routes_and_themes():
    if not SERVER_JS_PATH.exists():
        raise RuntimeError('server.js не найден')

    server_content = SERVER_JS_PATH.read_text(encoding='utf-8')

    themes_raw = extract_js_block(server_content, 'THEMES')
    routes_raw = extract_js_block(server_content, 'ROUTES')

    temp_loader = BASE_DIR / '_tmp_loader.js'

    temp_loader.write_text(
        f'''
const THEMES = {themes_raw};
const ROUTES = {routes_raw};

console.log(JSON.stringify({{ THEMES, ROUTES }}));
''',
        encoding='utf-8'
    )

    import subprocess

    result = subprocess.run(
        ['node', str(temp_loader)],
        capture_output=True,
        text=True,
        encoding='utf-8'
    )

    temp_loader.unlink(missing_ok=True)

    if result.returncode != 0:
        raise RuntimeError(result.stderr)

    parsed = json.loads(result.stdout)
    return parsed['THEMES'], parsed['ROUTES']


THEMES, ROUTES = load_routes_and_themes()


# ---------- Helpers ----------
def db_get(query, params=()):
    conn = get_db_connection()
    row = conn.execute(query, params).fetchone()
    conn.close()
    return dict(row) if row else None



def db_all(query, params=()):
    conn = get_db_connection()
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(row) for row in rows]



def db_run(query, params=()):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(query, params)
    conn.commit()
    lastrowid = cursor.lastrowid
    conn.close()
    return lastrowid



def find_route_meta(route_id):
    for theme_id, routes in ROUTES.items():
        for route in routes:
            if route.get('id') == route_id:
                return {
                    'route': route,
                    'themeId': theme_id
                }
    return None



def clamp_percent(value):
    try:
        number = round(float(value))
    except Exception:
        return 0

    return max(0, min(100, number))



def calc_route_xp(delta_percent, route, theme_id):
    theme_coef = THEME_XP_MULTIPLIER.get(theme_id, 1.0)
    difficulty_coef = DIFFICULTY_XP_MULTIPLIER.get(route.get('difficulty'), 1.0)
    points_coef = max(1, len(route.get('pointsData', [])) / 7)

    raw = delta_percent * 0.9 * theme_coef * difficulty_coef * points_coef
    return max(0, round(raw))


# ---------- API ----------
@app.route('/api/ping', methods=['GET'])
def ping():
    return jsonify({'status': 'ok'})


@app.route('/api/themes', methods=['GET'])
def get_themes():
    return jsonify(THEMES)


@app.route('/api/routes/<theme_id>', methods=['GET'])
def get_routes(theme_id):
    routes = ROUTES.get(theme_id, [])

    prepared = []


    for route in routes:
        prepared.append({
            'id': route.get('id'),
            'name': route.get('name'),
            'description': route.get('description'),
            'difficulty': route.get('difficulty'),
            'duration': route.get('duration'),
            'points': len(route.get('pointsData', []))
        })

    return jsonify(prepared)


@app.route('/api/route/<route_id>', methods=['GET'])
def get_route(route_id):
    route = None

    for routes in ROUTES.values():
        for item in routes:
            if item.get('id') == route_id:
                route = item
                break

    if not route:
        return jsonify({'error': 'Маршрут не найден'}), 404

    return jsonify(route)


@app.route('/api/auth', methods=['POST'])
def auth():
    data = request.get_json(force=True)

    login = data.get('login')
    password = data.get('password')

    try:
        user = db_get('SELECT * FROM users WHERE login = ?', (login,))

        if user:
            if user['password'] == password:
                return jsonify({
                    'success': True,
                    'message': 'С возвращением!',
                    'user': user
                })

            return jsonify({
                'success': False,
                'message': 'Неверный пароль'
            })

        db_run(
            'INSERT INTO users (login, password) VALUES (?, ?)',
            (login, password)
        )

        user = db_get('SELECT * FROM users WHERE login = ?', (login,))

        return jsonify({
            'success': True,
            'message': 'Новое имя в летописи!',
            'user': user
        })

    except Exception as error:
        return jsonify({'error': str(error)}), 500


@app.route('/api/progress/<int:user_id>', methods=['GET'])
def get_progress(user_id):
    try:
        rows = db_all(
            'SELECT route_id, route_name, progress_percent FROM progress WHERE user_id = ?',
            (user_id,)
        )

        return jsonify(rows)

    except Exception as error:
        return jsonify({'error': str(error)}), 500


@app.route('/api/progress', methods=['POST'])
def save_progress():
    data = request.get_json(force=True)

    user_id = data.get('userId')
    route_id = data.get('routeId')
    safe_percent = clamp_percent(data.get('percent'))

    route_meta = find_route_meta(route_id)

    if not route_meta:
        return jsonify({
            'success': False,
            'error': 'Некорректный маршрут'
        }), 400

    route = route_meta['route']
    theme_id = route_meta['themeId']
    route_name = route.get('name')

    try:
        row = db_get(
            '''
            SELECT id, progress_percent, completion_awarded
            FROM progress
            WHERE user_id = ? AND route_id = ?
            ''',
            (user_id, route_id)
        )

        prev_percent = int(row['progress_percent']) if row else 0

        if safe_percent > prev_percent + 40:
            return jsonify({
                'success': False,
                'error': 'Подозрительный скачок прогресса'
            }), 400

        next_percent = max(prev_percent, safe_percent)
        delta_percent = max(0, next_percent - prev_percent)

        xp_gained = calc_route_xp(delta_percent, route, theme_id)

        completion_awarded = bool(row and int(row['completion_awarded']) == 1)

        completion_bonus = 0

        if not completion_awarded and next_percent == 100:
            completion_bonus = round(
                35 * THEME_XP_MULTIPLIER.get(theme_id, 1)
            )

        xp_gained += completion_bonus

        if row:
            db_run(
                '''
                UPDATE progress
                SET progress_percent = ?,
                    route_name = ?,
                    completion_awarded = ?
                WHERE id = ?
                ''',
                (
                    next_percent,
                    route_name,
                    1 if (completion_awarded or completion_bonus > 0) else 0,
                    row['id']
                )
            )
        else:
            db_run(
                '''
                INSERT INTO progress (
                    user_id,
                    route_id,
                    route_name,
                    progress_percent,
                    completion_awarded
                )
                VALUES (?, ?, ?, ?, ?)
                ''',
                (
                    user_id,
                    route_id,
                    route_name,
                    next_percent,
                    1 if completion_bonus > 0 else 0
                )
            )

        if xp_gained <= 0:
            return jsonify({
                'success': True,
                'xpGained': 0,
                'percent': next_percent
            })

        user = db_get(
            'SELECT total_xp FROM users WHERE id = ?',
            (user_id,)
        )

        if not user:
            return jsonify({
                'success': False,
                'error': 'Пользователь не найден'
            }), 500

        current_xp = int(user.get('total_xp', 0) or 0)
        new_total_xp = current_xp + xp_gained
        new_level = (new_total_xp // XP_PER_LEVEL) + 1

        db_run(
            '''
            UPDATE users
            SET total_xp = ?, current_level = ?
            WHERE id = ?
            ''',
            (new_total_xp, new_level, user_id)
        )

        return jsonify({
            'success': True,
            'xpGained': xp_gained,
            'percent': next_percent
        })

    except Exception as error:
        return jsonify({'error': str(error)}), 500


@app.route('/api/favorites/<int:user_id>', methods=['GET'])
def get_favorites(user_id):
    try:
        rows = db_all(
            'SELECT * FROM favorites WHERE user_id = ?',
            (user_id,)
        )

        return jsonify(rows)

    except Exception as error:
        return jsonify({'error': str(error)}), 500


@app.route('/api/favorites', methods=['POST'])
def toggle_favorites():
    data = request.get_json(force=True)

    user_id = data.get('userId')
    route_id = data.get('routeId')
    point_index = data.get('pointIndex')
    point_title = data.get('pointTitle')
    point_panorama = data.get('pointPanorama')

    try:
        row = db_get(
            '''
            SELECT id
            FROM favorites
            WHERE user_id = ?
              AND route_id = ?
              AND point_index = ?
            ''',
            (user_id, route_id, point_index)
        )

        if row:
            db_run(
                'DELETE FROM favorites WHERE id = ?',
                (row['id'],)
            )

            return jsonify({
                'success': True,
                'action': 'removed'
            })

        db_run(
            '''
            INSERT INTO favorites (
                user_id,
                route_id,
                point_index,
                point_title,
                point_panorama
            )
            VALUES (?, ?, ?, ?, ?)
            ''',
            (
                user_id,
                route_id,
                point_index,
                point_title,
                point_panorama
            )
        )

        return jsonify({
            'success': True,
            'action': 'added'
        })

    except Exception as error:
        return jsonify({'error': str(error)}), 500


@app.route('/api/avatar', methods=['POST'])
def update_avatar():
    data = request.get_json(force=True)

    try:
        db_run(
            'UPDATE users SET avatar = ? WHERE id = ?',
            (data.get('avatar'), data.get('userId'))
        )

        return jsonify({'success': True})

    except Exception as error:
        return jsonify({'error': str(error)}), 500


@app.route('/api/user/<int:user_id>', methods=['GET'])
def get_user(user_id):
    try:
        user = db_get(
            '''
            SELECT id, login, avatar, total_xp, current_level
            FROM users
            WHERE id = ?
            ''',
            (user_id,)
        )

        if user:
            user['total_xp'] = int(user.get('total_xp') or 0)
            user['current_level'] = int(user.get('current_level') or 1)

        return jsonify(user)

    except Exception as error:
        return jsonify({'error': str(error)}), 500


@app.route('/api/user/<int:user_id>/login', methods=['PATCH'])
def update_login(user_id):
    data = request.get_json(force=True)

    new_login = str(data.get('login', '')).strip()

    if not user_id:
        return jsonify({
            'success': False,
            'message': 'Некорректный пользователь'
        }), 400

    if len(new_login) < 3 or len(new_login) > 24:
        return jsonify({
            'success': False,
            'message': 'Ник должен быть от 3 до 24 символов'
        }), 400

    try:
        existing = db_get(
            'SELECT id FROM users WHERE login = ? AND id != ?',
            (new_login, user_id)
        )

        if existing:
            return jsonify({
                'success': False,
                'message': 'Такой ник уже занят'
            }), 409

        db_run(
            'UPDATE users SET login = ? WHERE id = ?',
            (new_login, user_id)
        )

        updated_user = db_get(
            '''
            SELECT id, login, avatar, total_xp, current_level
            FROM users
            WHERE id = ?
            ''',
            (user_id,)
        )

        return jsonify({
            'success': True,
            'message': 'Ник обновлён',
            'user': updated_user
        })

    except Exception as error:
        return jsonify({'error': str(error)}), 500


# ---------- Frontend ----------
@app.route('/')
def root():
    return send_from_directory(PUBLIC_DIR, 'index.html')


@app.route('/<path:path>')
def static_proxy(path):
    file_path = PUBLIC_DIR / path

    if file_path.exists() and file_path.is_file():
        return send_from_directory(PUBLIC_DIR, path)

    return send_from_directory(PUBLIC_DIR, 'index.html')


# ---------- Start ----------
if __name__ == '__main__':
    init_database()

    app.run(
        host='0.0.0.0',
        port=3000,
        debug=True
    )

