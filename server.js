const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const app = express();

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

app.use(cors());

app.use(express.json());

app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});

app.use(express.static(path.join(__dirname, 'public'), {
    etag: false,
    lastModified: false,
    cacheControl: false,
    maxAge: 0
}));

// ---------- Создание папок ----------
const dirs = [
    'public/audio',
    'public/images/avatars',
    'public/images/maps'
];

dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// ---------- База данных ----------
let db = null;

const DB_PATH = path.join(__dirname, 'database.sqlite');

const ROUTES_FILE = path.join(
    __dirname,
    'public',
    'routes.json'
);

fs.watchFile(ROUTES_FILE, () => {
    console.log('🔄 routes.json обновлён');
});

// ---------- Загрузка routes.json ----------
function getRoutesData() {
    try {
        if (!fs.existsSync(ROUTES_FILE)) {
            return {
                THEMES: [],
                ROUTES: {}
            };
        }

        const raw = fs.readFileSync(ROUTES_FILE, {
            encoding: 'utf8',
            flag: 'r'
        });

        return JSON.parse(raw);

    } catch (err) {
        console.error('Ошибка чтения routes.json:', err);

        return {
            THEMES: [],
            ROUTES: {}
        };
    }
}

function dbAll(sql, params = []) {
    const stmt = db.prepare(sql);

    stmt.bind(params);

    const rows = [];

    while (stmt.step()) {
        const row = {};

        const cols = stmt.getColumnNames();
        const values = stmt.get();

        cols.forEach((col, i) => {
            row[col] = values[i];
        });

        rows.push(row);
    }

    stmt.free();

    return rows;
}

function dbGet(sql, params = []) {
    const rows = dbAll(sql, params);
    return rows.length > 0 ? rows[0] : null;
}

function dbRun(sql, params = []) {
    db.run(sql, params);
    saveDatabase();
}

function saveDatabase() {
    const data = db.export();
    const buffer = Buffer.from(data);

    fs.writeFileSync(DB_PATH, buffer);
}

async function initDatabase() {
    const SQL = await initSqlJs();

    if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }

    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            login TEXT UNIQUE,
            password TEXT,
            avatar TEXT DEFAULT 'default.png',
            total_xp INTEGER DEFAULT 0,
            current_level INTEGER DEFAULT 1
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            route_id TEXT,
            route_name TEXT,
            progress_percent INTEGER,
            completion_awarded INTEGER DEFAULT 0,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS favorites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            route_id TEXT,
            point_index INTEGER,
            point_title TEXT,
            point_panorama TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    `);

    saveDatabase();
}

// ---------- Константы ----------
const XP_PER_LEVEL = 120;

const THEME_XP_MULTIPLIER = {
    kazakhstan: 1.0,
    georgia: 1.15,
    silk: 1.25
};

const DIFFICULTY_XP_MULTIPLIER = {
    'Лёгкий': 1.0,
    'Средний': 1.2,
    'Сложный': 1.4
};

function findRouteMeta(routeId) {
    const { ROUTES } = getRoutesData();

    for (const [themeId, routes] of Object.entries(ROUTES)) {
        const route = routes.find(item => item.id === routeId);

        if (route) {
            return {
                route,
                themeId
            };
        }
    }

    return null;
}

function clampPercent(value) {
    const n = Number(value);

    if (!Number.isFinite(n)) {
        return 0;
    }

    return Math.max(
        0,
        Math.min(100, Math.round(n))
    );
}

function calcRouteXp(deltaPercent, route, themeId) {
    const themeCoef =
        THEME_XP_MULTIPLIER[themeId] || 1.0;

    const difficultyCoef =
        DIFFICULTY_XP_MULTIPLIER[route.difficulty] || 1.0;

    const pointsCoef = Math.max(
        1,
        (route.pointsData?.length || 7) / 7
    );

    const raw =
        deltaPercent *
        0.9 *
        themeCoef *
        difficultyCoef *
        pointsCoef;

    return Math.max(0, Math.round(raw));
}

// ---------- API ----------
app.use('/api', (req, res, next) => {
    res.setHeader(
        'Content-Type',
        'application/json; charset=utf-8'
    );

    res.setHeader(
        'Cache-Control',
        'no-store'
    );

    next();
});

app.get('/api/ping', (req, res) => {
    res.json({
        status: 'ok'
    });
});

app.get('/api/themes', (req, res) => {
    const { THEMES } = getRoutesData();

    res.json(THEMES);
});

app.get('/api/routes/:themeId', (req, res) => {
    const { ROUTES } = getRoutesData();

    const routes =
        ROUTES[req.params.themeId] || [];

    res.json(
        routes.map(route => ({
            id: route.id,
            name: route.name,
            description: route.description,
            difficulty: route.difficulty,
            duration: route.duration,
            points: route.pointsData?.length || 0
        }))
    );
});

app.get('/api/route/:routeId', (req, res) => {
    const { ROUTES } = getRoutesData();

    const route = Object.values(ROUTES)
        .flat()
        .find(
            route => route.id === req.params.routeId
        );

    if (!route) {
        return res.status(404).json({
            error: 'Маршрут не найден'
        });
    }

    res.json(route);
});

app.post('/api/auth', (req, res) => {
    const { login, password } = req.body;

    try {
        let user = dbGet(
            'SELECT * FROM users WHERE login = ?',
            [login]
        );

        if (user) {
            if (user.password === password) {
                return res.json({
                    success: true,
                    message: 'С возвращением!',
                    user
                });
            }

            return res.json({
                success: false,
                message: 'Неверный пароль'
            });
        }

        dbRun(
            'INSERT INTO users (login, password) VALUES (?, ?)',
            [login, password]
        );

        user = dbGet(
            'SELECT * FROM users WHERE login = ?',
            [login]
        );

        res.json({
            success: true,
            message: 'Новое имя в летописи!',
            user
        });

    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
});

app.get('/api/progress/:userId', (req, res) => {
    try {
        const rows = dbAll(
            `
            SELECT route_id, route_name, progress_percent
            FROM progress
            WHERE user_id = ?
            `,
            [req.params.userId]
        );

        res.json(rows || []);

    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
});

app.post('/api/progress', (req, res) => {
    const { userId, routeId } = req.body;

    const safePercent =
        clampPercent(req.body.percent);

    const routeMeta =
        findRouteMeta(routeId);

    if (!routeMeta) {
        return res.status(400).json({
            success: false,
            error: 'Некорректный маршрут'
        });
    }

    const routeName = routeMeta.route.name;

    try {
        const row = dbGet(
            `
            SELECT
                id,
                progress_percent,
                completion_awarded
            FROM progress
            WHERE user_id = ?
              AND route_id = ?
            `,
            [userId, routeId]
        );

        const prevPercent =
            row ? Number(row.progress_percent) || 0 : 0;

        if (safePercent > prevPercent + 40) {
            return res.status(400).json({
                success: false,
                error: 'Подозрительный скачок прогресса'
            });
        }

        const nextPercent =
            Math.max(prevPercent, safePercent);

        const deltaPercent =
            Math.max(0, nextPercent - prevPercent);

        let xpGained = calcRouteXp(
            deltaPercent,
            routeMeta.route,
            routeMeta.themeId
        );

        const completionAlreadyAwarded =
            row
                ? Number(row.completion_awarded) === 1
                : false;

        const completionBonus =
            (!completionAlreadyAwarded &&
                nextPercent === 100)
                ? Math.round(
                    35 *
                    (
                        THEME_XP_MULTIPLIER[
                            routeMeta.themeId
                        ] || 1
                    )
                )
                : 0;

        xpGained += completionBonus;

        if (row) {
            dbRun(
                `
                UPDATE progress
                SET
                    progress_percent = ?,
                    route_name = ?,
                    completion_awarded = ?
                WHERE id = ?
                `,
                [
                    nextPercent,
                    routeName,
                    completionAlreadyAwarded ||
                    completionBonus > 0
                        ? 1
                        : 0,
                    row.id
                ]
            );
        } else {
            dbRun(
                `
                INSERT INTO progress (
                    user_id,
                    route_id,
                    route_name,
                    progress_percent,
                    completion_awarded
                )
                VALUES (?, ?, ?, ?, ?)
                `,
                [
                    userId,
                    routeId,
                    routeName,
                    nextPercent,
                    completionBonus > 0 ? 1 : 0
                ]
            );
        }

        if (xpGained <= 0) {
            return res.json({
                success: true,
                xpGained: 0,
                percent: nextPercent
            });
        }

        const user = dbGet(
            'SELECT total_xp FROM users WHERE id = ?',
            [userId]
        );

        if (!user) {
            return res.status(500).json({
                success: false,
                error: 'Пользователь не найден'
            });
        }

        const currentXp =
            Number(user.total_xp) || 0;

        const newTotalXp =
            currentXp + xpGained;

        const newLevel =
            Math.floor(newTotalXp / XP_PER_LEVEL) + 1;

        dbRun(
            `
            UPDATE users
            SET
                total_xp = ?,
                current_level = ?
            WHERE id = ?
            `,
            [
                newTotalXp,
                newLevel,
                userId
            ]
        );

        res.json({
            success: true,
            xpGained,
            percent: nextPercent
        });

    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
});

app.get('/api/favorites/:userId', (req, res) => {
    try {
        const rows = dbAll(
            'SELECT * FROM favorites WHERE user_id = ?',
            [req.params.userId]
        );

        res.json(rows || []);

    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
});

app.post('/api/favorites', (req, res) => {
    const {
        userId,
        routeId,
        pointIndex,
        pointTitle,
        pointPanorama
    } = req.body;

    try {
        const row = dbGet(
            `
            SELECT id
            FROM favorites
            WHERE user_id = ?
              AND route_id = ?
              AND point_index = ?
            `,
            [
                userId,
                routeId,
                pointIndex
            ]
        );

        if (row) {
            dbRun(
                'DELETE FROM favorites WHERE id = ?',
                [row.id]
            );

            return res.json({
                success: true,
                action: 'removed'
            });
        }

        dbRun(
            `
            INSERT INTO favorites (
                user_id,
                route_id,
                point_index,
                point_title,
                point_panorama
            )
            VALUES (?, ?, ?, ?, ?)
            `,
            [
                userId,
                routeId,
                pointIndex,
                pointTitle,
                pointPanorama
            ]
        );

        res.json({
            success: true,
            action: 'added'
        });

    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
});

app.post('/api/avatar', (req, res) => {
    try {
        dbRun(
            'UPDATE users SET avatar = ? WHERE id = ?',
            [
                req.body.avatar,
                req.body.userId
            ]
        );

        res.json({
            success: true
        });

    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
});

app.get('/api/user/:userId', (req, res) => {
    try {
        const user = dbGet(
            `
            SELECT
                id,
                login,
                avatar,
                total_xp,
                current_level
            FROM users
            WHERE id = ?
            `,
            [req.params.userId]
        );

        if (user) {
            user.total_xp =
                Number(user.total_xp) || 0;

            user.current_level =
                Number(user.current_level) || 1;
        }

        res.json(user);

    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
});

app.patch('/api/user/:userId/login', (req, res) => {
    const userId =
        Number(req.params.userId);

    const newLogin =
        String(req.body?.login || '')
            .trim();

    if (!userId) {
        return res.status(400).json({
            success: false,
            message: 'Некорректный пользователь'
        });
    }

    if (
        newLogin.length < 3 ||
        newLogin.length > 24
    ) {
        return res.status(400).json({
            success: false,
            message: 'Ник должен быть от 3 до 24 символов'
        });
    }

    try {
        const exists = dbGet(
            `
            SELECT id
            FROM users
            WHERE login = ?
              AND id != ?
            `,
            [newLogin, userId]
        );

        if (exists) {
            return res.status(409).json({
                success: false,
                message: 'Такой ник уже занят'
            });
        }

        dbRun(
            'UPDATE users SET login = ? WHERE id = ?',
            [newLogin, userId]
        );

        const updatedUser = dbGet(
            `
            SELECT
                id,
                login,
                avatar,
                total_xp,
                current_level
            FROM users
            WHERE id = ?
            `,
            [userId]
        );

        res.json({
            success: true,
            message: 'Ник обновлён',
            user: updatedUser
        });

    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
});

// ---------- Frontend ----------
app.get('*', (req, res) => {
    res.sendFile(
        path.join(__dirname, 'public', 'index.html')
    );
});

// ---------- Старт ----------
initDatabase()
    .then(() => {
        app.listen(PORT, HOST, () => {
            console.log(
                `🚀 Сервер запущен: http://localhost:${PORT}`
            );
        });
    })
    .catch(err => {
        console.error(
            'Ошибка инициализации БД:',
            err
        );

        process.exit(1);
    });