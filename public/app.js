class SamaraApp {
    constructor() {
        this.apiBase = window.location.origin;
        this.user = JSON.parse(sessionStorage.getItem("samara_user")) || null;
        this.currentRoute = null;
        this.currentPointIndex = 0;
        this.showingMap = false;
        this.audio = document.getElementById("bg-audio");
        this.audioEnabled = false;
        this.quizState = { answered: 0, errors: 0, total: 0 };
        this.isOffline = !navigator.onLine;
        this.pingTimer = null;
        this.pageTransitionMs = 240;
        this.lastSavedPercent = -1;
        this.hasConnectionStateInitialized = false;
        this.toastHistory = new Map();
        this.toastQueue = [];
        this.activeToasts = new Map();
        this.maxVisibleToasts = 4;
        this.xpPerLevel = 120;
        this.isNicknameEditing = false;
        this.currentRouteAudioSrc = "";

        this.initDOM();
        this.bindEvents();
        this.setupConnectionManager();
        this.switchPage(this.user ? "page-main" : "page-auth", true);

        if (this.user) {
            this.updateUserUI();
            this.loadThemes();
        } else {
            this.els.header.classList.add("hidden");
        }
    }

    initDOM() {
        this.els = {
            pages: document.querySelectorAll(".page"),
            header: document.getElementById("main-header"),
            avatarHeader: document.getElementById("user-avatar"),
            avatarProfile: document.getElementById("profile-avatar"),
            themeSel: document.getElementById("select-theme"),
            routeSel: document.getElementById("select-route"),
            themeTrigger: document.getElementById("theme-trigger"),
            routeTrigger: document.getElementById("route-trigger"),
            themeMenu: document.getElementById("theme-menu"),
            routeMenu: document.getElementById("route-menu"),
            themeCustom: document.getElementById("theme-custom"),
            routeCustom: document.getElementById("route-custom"),
            btnStart: document.getElementById("btn-start-route"),
            routeMeta: document.getElementById("route-meta"),
            panoLayer: document.getElementById("panorama-layer"),
            mapLayer: document.getElementById("map-layer"),
            mapContainer: document.getElementById("map-container"),
            pointTitle: document.getElementById("point-title"),
            pointDesc: document.getElementById("point-desc"),
            pointSource: document.getElementById("point-source"),
            btnNext: document.getElementById("btn-next"),
            btnPrev: document.getElementById("btn-prev"),
            progressBar: document.getElementById("route-progress"),
            spinner: document.getElementById("loading-spinner"),
            levelInput: document.getElementById("prof-level"),
            rankInput: document.getElementById("prof-rank"),
            xpText: document.getElementById("xp-text"),
            xpFill: document.getElementById("xp-fill"),
            offlineOverlay: document.getElementById("offline-overlay"),
            btnEditLogin: document.getElementById("btn-edit-login"),
            btnSaveLogin: document.getElementById("btn-save-login"),
            btnCancelLogin: document.getElementById("btn-cancel-login"),
            selectionBlock: document.getElementById("selection-block"),
            routeBlock: document.getElementById("route-block"),
            quizBlock: document.getElementById("quiz-block"),
            descPanel: document.getElementById("description-panel")
        };
    }

    bindEvents() {
        document.getElementById("logo-home").onclick = () => this.handleLogoHomeClick();
        document.getElementById("btn-profile").onclick = () => {
            if (!this.user) return;
            this.switchPage("page-profile");
            this.loadProfileData();
        };
        document.getElementById("btn-login").onclick = () => this.auth();
        document.getElementById("btn-logout").onclick = () => this.logout();
        this.els.btnEditLogin.onclick = () => this.startNicknameEdit();
        this.els.btnSaveLogin.onclick = () => this.saveNickname();
        this.els.btnCancelLogin.onclick = () => this.cancelNicknameEdit();

        this.els.themeSel.onchange = (e) => this.loadRoutes(e.target.value);
        this.els.routeSel.onchange = (e) => this.showRouteMeta(e.target.value);
        this.setupCustomSelects();
        this.els.btnStart.onclick = () => this.startRoute();
        this.els.btnNext.onclick = () => this.handleNext();
        this.els.btnPrev.onclick = () => this.handlePrev();

        document.getElementById("btn-restart").onclick = () => this.restartRoute();
        document.getElementById("btn-main-menu").onclick = () => this.returnToMainMenu();
        document.getElementById("btn-favorite").onclick = () => this.toggleFavorite();

        document.getElementById("audio-toggle").onclick = (e) => {
            this.audioEnabled = !this.audioEnabled;
            const icon = e.currentTarget.querySelector("i");
            icon.className = this.audioEnabled ? "fas fa-volume-up" : "fas fa-volume-mute";
            if (this.audioEnabled) {
                this.audio.play().catch(() => {
                    this.audioEnabled = false;
                    icon.className = "fas fa-volume-mute";
                    this.toast("Сначала кликните по странице для запуска звука", "warning");
                });
            } else {
                this.audio.pause();
            }
        };

        this.audio.addEventListener("ended", () => {
            this.audio.currentTime = 0;
            this.audio.play().catch(() => {});
        });
    }

    setupCustomSelects() {
        const closeMenus = () => {
            this.els.themeMenu.classList.add("hidden");
            this.els.routeMenu.classList.add("hidden");
            this.els.themeCustom.classList.remove("open");
            this.els.routeCustom.classList.remove("open");
        };

        this.els.themeTrigger.onclick = (e) => {
            e.stopPropagation();
            if (this.els.themeMenu.classList.contains("hidden")) {
                closeMenus();
                this.els.themeMenu.classList.remove("hidden");
                this.els.themeCustom.classList.add("open");
            } else {
                closeMenus();
            }
        };

        this.els.routeTrigger.onclick = (e) => {
            e.stopPropagation();
            if (this.els.routeTrigger.disabled) return;
            if (this.els.routeMenu.classList.contains("hidden")) {
                closeMenus();
                this.els.routeMenu.classList.remove("hidden");
                this.els.routeCustom.classList.add("open");
            } else {
                closeMenus();
            }
        };

        document.addEventListener("click", closeMenus);
    }

    renderCustomMenu(type, items, placeholder) {
        const isTheme = type === "theme";
        const menu = isTheme ? this.els.themeMenu : this.els.routeMenu;
        const trigger = isTheme ? this.els.themeTrigger : this.els.routeTrigger;
        const select = isTheme ? this.els.themeSel : this.els.routeSel;

        menu.innerHTML = "";
        if (!items.length) {
            trigger.textContent = placeholder;
            return;
        }

        items.forEach((item) => {
            const option = document.createElement("button");
            option.type = "button";
            option.className = "custom-select-option";
            option.textContent = item.name;
            option.onclick = () => {
                trigger.textContent = item.name;
                select.value = item.id;
                if (isTheme) this.loadRoutes(item.id);
                else this.showRouteMeta(item.id);
                menu.classList.add("hidden");
                if (isTheme) this.els.themeCustom.classList.remove("open");
                else this.els.routeCustom.classList.remove("open");
            };
            menu.appendChild(option);
        });
    }

    setupConnectionManager() {
        window.addEventListener("offline", () => this.handleConnectionChange(false));
        window.addEventListener("online", () => this.checkConnection());
        this.handleConnectionChange(!this.isOffline, true);
        this.hasConnectionStateInitialized = true;

        this.pingTimer = setInterval(() => this.checkConnection(), 5000);
        this.checkConnection();
    }

    async checkConnection() {
        try {
            const res = await fetch(`${this.apiBase}/api/ping`, { cache: "no-store" });
            this.handleConnectionChange(res.ok, false);
        } catch {
            this.handleConnectionChange(false, false);
        }
    }

    handleConnectionChange(online, silent = false) {
        const newOffline = !online;
        if (newOffline === this.isOffline) return;

        this.isOffline = newOffline;
        if (!this.hasConnectionStateInitialized) {
            this.hasConnectionStateInitialized = true;
            return;
        }

        if (this.isOffline) {
            this.els.offlineOverlay.classList.remove("hidden");
            requestAnimationFrame(() => this.els.offlineOverlay.classList.add("active"));
            if (!silent) this.toast("Нет связи с сервером. Проверьте сеть.", "error");
        } else {
            this.els.offlineOverlay.classList.remove("active");
            setTimeout(() => this.els.offlineOverlay.classList.add("hidden"), 320);
            if (!silent) this.toast("Связь с сервером восстановлена", "success");
        }
    }

    async api(path, options = {}) {
        if (this.isOffline) throw new Error("offline");
        const response = await fetch(`${this.apiBase}${path}`, options);
        if (!response.ok) throw new Error(`http_${response.status}`);
        return response.json();
    }

    switchPage(pageId, immediate = false) {
        this.els.pages.forEach((p) => {
            if (p.id !== pageId) {
                p.classList.remove("active");
                p.classList.add("hidden");
            }
        });

        const target = document.getElementById(pageId);
        target.classList.remove("hidden");
        if (immediate) {
            target.classList.add("active");
        } else {
            requestAnimationFrame(() => target.classList.add("active"));
        }

        this.els.header.classList.toggle("hidden", pageId === "page-auth");
    }

    toast(msg, type = "info", options = {}) {
        const toastType = ["success", "error", "warning", "info"].includes(type) ? type : "info";
        const key = options.key || `${toastType}:${msg}`;
        const cooldown = Number(options.cooldownMs ?? 1200);
        const now = Date.now();
        const prevAt = this.toastHistory.get(key) || 0;

        const existing = this.activeToasts.get(key);
        if (existing) {
            existing.count += 1;
            const badge = existing.element.querySelector(".toast-count");
            if (badge) {
                badge.textContent = `x${existing.count}`;
                badge.classList.remove("hidden");
            }
            this.restartToastTimer(existing);
            return;
        }

        const inQueue = this.toastQueue.find((item) => item.key === key);
        if (inQueue) {
            inQueue.count += 1;
            return;
        }

        if (now - prevAt < cooldown && toastType !== "error") return;
        this.toastHistory.set(key, now);

        const payload = {
            key,
            msg,
            type: toastType,
            count: 1,
            duration: Number(options.durationMs || this.getToastDuration(toastType)),
            priority: Number(options.priority ?? this.getToastPriority(toastType)),
            persistent: Boolean(options.persistent)
        };
        this.toastQueue.push(payload);
        this.toastQueue.sort((a, b) => b.priority - a.priority);
        this.drainToastQueue();
    }

    getToastDuration(type) {
        if (type === "error") return 5600;
        if (type === "warning") return 4600;
        if (type === "success") return 3400;
        return 3000;
    }

    getToastPriority(type) {
        if (type === "error") return 3;
        if (type === "warning") return 2;
        if (type === "success") return 1;
        return 0;
    }

    drainToastQueue() {
        while (this.activeToasts.size < this.maxVisibleToasts && this.toastQueue.length > 0) {
            const payload = this.toastQueue.shift();
            this.mountToast(payload);
        }
    }

    mountToast(payload) {
        const container = document.getElementById("toast-container");
        const t = document.createElement("div");
        t.className = `toast toast-${payload.type}`;
        t.setAttribute("data-toast-key", payload.key);
        t.setAttribute("data-toast-priority", String(payload.priority));

        const icons = {
            success: "fa-check-circle",
            error: "fa-skull-crossbones",
            warning: "fa-exclamation-triangle",
            info: "fa-scroll"
        };

        t.innerHTML = `<div class="toast-icon"><i class="fas ${icons[payload.type]}"></i></div><div class="toast-content">${payload.msg}</div><div class="toast-count hidden">x1</div><div class="toast-progress"></div>`;
        container.appendChild(t);
        requestAnimationFrame(() => t.classList.add("show"));

        const toastData = {
            ...payload,
            element: t,
            timeoutId: null,
            startedAt: Date.now(),
            remainingMs: payload.duration
        };
        if (toastData.count > 1) {
            const badge = t.querySelector(".toast-count");
            if (badge) {
                badge.textContent = `x${toastData.count}`;
                badge.classList.remove("hidden");
            }
        }
        this.activeToasts.set(payload.key, toastData);
        this.bindToastHoverPause(toastData);
        this.restartToastTimer(toastData);
    }

    bindToastHoverPause(toastData) {
        const { element } = toastData;
        element.addEventListener("mouseenter", () => {
            if (toastData.timeoutId) clearTimeout(toastData.timeoutId);
            const elapsed = Date.now() - toastData.startedAt;
            toastData.remainingMs = Math.max(800, toastData.remainingMs - elapsed);
            element.classList.add("paused");
        });
        element.addEventListener("mouseleave", () => {
            element.classList.remove("paused");
            this.restartToastTimer(toastData, toastData.remainingMs);
        });
    }

    restartToastTimer(toastData, customDurationMs) {
        const duration = Math.max(800, Number(customDurationMs || toastData.duration));
        toastData.remainingMs = duration;
        toastData.startedAt = Date.now();
        if (toastData.timeoutId) clearTimeout(toastData.timeoutId);
        const progress = toastData.element.querySelector(".toast-progress");
        if (progress) {
            progress.style.animation = "none";
            progress.offsetHeight;
            progress.style.animation = `toastProgress ${duration}ms linear forwards`;
        }
        if (!toastData.persistent) {
            toastData.timeoutId = setTimeout(() => this.closeToast(toastData.key), duration);
        }
    }

    closeToast(key) {
        const toastData = this.activeToasts.get(key);
        if (!toastData) return;
        if (toastData.timeoutId) clearTimeout(toastData.timeoutId);
        toastData.element.classList.remove("show");
        setTimeout(() => {
            toastData.element.remove();
            this.activeToasts.delete(key);
            this.drainToastQueue();
        }, 320);
    }

    async handleLogoHomeClick() {
        if (!this.user) {
            this.toast("Сначала войдите в систему", "warning");
            return;
        }
        try {
            await this.checkConnection();
            if (this.isOffline) {
                this.toast("Нельзя вернуться в главное меню без связи с сервером", "error");
                return;
            }
            this.returnToMainMenu();
            this.switchPage("page-main");
        } catch {
            this.toast("Ошибка соединения", "error");
        }
    }

    async auth() {
        if (this.isOffline) return this.toast("Нет связи с сервером", "error");

        const login = document.getElementById("auth-login").value.trim();
        const pass = document.getElementById("auth-pass").value;
        if (!login || !pass) return this.toast("Введите логин и пароль", "warning");

        const btn = document.getElementById("btn-login");
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Проверка...';

        try {
            const data = await this.api("/api/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ login, password: pass })
            });
            if (!data.success) {
                this.toast(data.message, "error");
                return;
            }

            this.user = data.user;
            sessionStorage.setItem("samara_user", JSON.stringify(this.user));
            this.updateUserUI();
            this.switchPage("page-main");
            await this.loadThemes();
            this.toast(data.message, "success");
        } catch {
            this.handleConnectionChange(false);
        } finally {
            btn.disabled = false;
            btn.innerHTML = "В путь";
        }
    }

    logout() {
        sessionStorage.removeItem("samara_user");
        this.user = null;
        this.currentRoute = null;
        this.stopAudio();
        this.cancelNicknameEdit(true);
        this.switchPage("page-auth");
    }

    updateUserUI() {
        const avatarPath = this.user.avatar.includes("http") ? this.user.avatar : `images/avatars/${this.user.avatar}`;
        this.els.avatarHeader.src = avatarPath;
        this.els.avatarProfile.src = avatarPath;
        document.getElementById("prof-login").value = this.user.login;
        this.updateLevelAndRank(this.user.total_xp || 0, this.user.current_level || 1);
    }

    startNicknameEdit() {
        if (!this.user) return;
        this.isNicknameEditing = true;
        const input = document.getElementById("prof-login");
        input.readOnly = false;
        input.classList.add("editable-nick");
        input.focus();
        input.select();
        this.els.btnEditLogin.classList.add("hidden");
        this.els.btnSaveLogin.classList.remove("hidden");
        this.els.btnCancelLogin.classList.remove("hidden");
    }

    cancelNicknameEdit(silent = false) {
        this.isNicknameEditing = false;
        const input = document.getElementById("prof-login");
        input.readOnly = true;
        input.classList.remove("editable-nick");
        if (this.user) input.value = this.user.login;
        this.els.btnEditLogin.classList.remove("hidden");
        this.els.btnSaveLogin.classList.add("hidden");
        this.els.btnCancelLogin.classList.add("hidden");
        if (!silent) this.toast("Изменение ника отменено", "info", { key: "nick:cancel", cooldownMs: 800 });
    }

    async saveNickname() {
        if (this.isOffline) return this.toast("Нет связи с сервером", "error");
        const input = document.getElementById("prof-login");
        const newLogin = input.value.trim();
        if (newLogin.length < 3 || newLogin.length > 24) {
            return this.toast("Ник должен быть от 3 до 24 символов", "warning");
        }
        if (newLogin === this.user.login) return this.cancelNicknameEdit(true);

        this.els.btnSaveLogin.disabled = true;
        this.els.btnSaveLogin.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Сохраняем';
        try {
            const result = await this.api(`/api/user/${this.user.id}/login`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ login: newLogin })
            });
            this.user = { ...this.user, ...result.user };
            sessionStorage.setItem("samara_user", JSON.stringify(this.user));
            this.updateUserUI();
            this.cancelNicknameEdit(true);
            this.toast("Ник успешно обновлён", "success");
        } catch (error) {
            if (String(error.message || "").includes("409")) this.toast("Этот ник уже занят", "error");
            else this.toast("Не удалось обновить ник", "error");
        } finally {
            this.els.btnSaveLogin.disabled = false;
            this.els.btnSaveLogin.innerHTML = '<i class="fas fa-check"></i> Сохранить';
        }
    }

    updateLevelAndRank(totalXp, level) {
        const currentLevel = Number(level) || 1;
        const xpValue = Number(totalXp) || 0;
        const currentLevelXp = xpValue % this.xpPerLevel;
        const xpPercent = (currentLevelXp / this.xpPerLevel) * 100;
        this.els.levelInput.value = `${currentLevel} УР`;
        this.els.rankInput.value = this.getRankByLevel(currentLevel);
        this.els.xpText.innerText = `${currentLevelXp} / ${this.xpPerLevel} XP`;
        this.els.xpFill.style.width = `${xpPercent}%`;
    }

    getRankByLevel(level) {
        if (level >= 13) return "Легенда";
        if (level >= 11) return "Летописец";
        if (level >= 9) return "Хранитель";
        if (level >= 7) return "Следопыт";
        if (level >= 5) return "Исследователь";
        if (level >= 3) return "Путник";
        return "Новичок";
    }

    async loadThemes() {
        if (this.isOffline) return;
        this.els.selectionBlock.classList.remove("hidden");
        this.els.routeBlock.classList.add("hidden");
        this.els.quizBlock.classList.add("hidden");
        this.els.routeMeta.classList.add("hidden");
        this.els.btnStart.disabled = true;
        this.els.routeSel.disabled = true;
        this.els.routeSel.innerHTML = '<option value="" disabled selected>Сначала выберите тему</option>';
        this.els.themeTrigger.textContent = "Выберите тему";
        this.els.routeTrigger.textContent = "Сначала выберите тему";
        this.els.routeTrigger.disabled = true;
        this.els.routeCustom.classList.add("custom-select-disabled");
        this.renderCustomMenu("theme", [], "Выберите тему");
        this.renderCustomMenu("route", [], "Сначала выберите тему");

        try {
            const themes = await this.api("/api/themes");
            this.els.themeSel.innerHTML = '<option value="" disabled selected>Выберите тему</option>';
            themes.forEach((theme) => {
                this.els.themeSel.insertAdjacentHTML("beforeend", `<option value="${theme.id}">${theme.name}</option>`);
            });
            this.renderCustomMenu("theme", themes, "Выберите тему");
        } catch {
            this.handleConnectionChange(false);
        }
    }

    async loadRoutes(themeId) {
        if (this.isOffline) return;
        this.els.routeSel.innerHTML = '<option value="" disabled selected>Загрузка маршрутов...</option>';
        this.els.routeSel.disabled = true;
        this.els.btnStart.disabled = true;
        this.els.routeMeta.classList.add("hidden");
        this.currentRoute = null;

        try {
            const routes = await this.api(`/api/routes/${themeId}`);
            this.els.routeSel.innerHTML = '<option value="" disabled selected>Выберите маршрут</option>';
            routes.forEach((route) => {
                this.els.routeSel.insertAdjacentHTML("beforeend", `<option value="${route.id}">${route.name}</option>`);
            });
            this.els.routeSel.disabled = false;
            this.els.routeTrigger.disabled = false;
            this.els.routeCustom.classList.remove("custom-select-disabled");
            this.els.routeTrigger.textContent = "Выберите маршрут";
            this.renderCustomMenu("route", routes, "Выберите маршрут");
            if (routes.length) {
                this.toast(`Найдено маршрутов: ${routes.length}`, "info", { key: `routes:${themeId}`, cooldownMs: 1200 });
            }
        } catch {
            this.handleConnectionChange(false);
        }
    }

    async showRouteMeta(routeId) {
        if (this.isOffline) return;
        try {
            this.currentRoute = await this.api(`/api/route/${routeId}`);
            document.getElementById("meta-difficulty").innerText = this.currentRoute.difficulty;
            document.getElementById("meta-duration").innerText = this.currentRoute.duration;
            document.getElementById("meta-points").innerText = this.currentRoute.pointsData.length;
            this.els.routeMeta.classList.remove("hidden");
            this.els.btnStart.disabled = false;
            this.toast(`Маршрут выбран: ${this.currentRoute.name}`, "info", { key: `route:${routeId}`, cooldownMs: 1200 });
        } catch {
            this.handleConnectionChange(false);
        }
    }

    startRoute() {
        if (!this.currentRoute) return;
        this.els.selectionBlock.classList.add("hidden");
        this.els.routeBlock.classList.remove("hidden");
        this.els.quizBlock.classList.add("hidden");
        this.currentPointIndex = 0;
        this.showingMap = false;
        this.lastSavedPercent = -1;

        if (this.currentRoute.routeAudio) {
            this.setRouteAudio(this.currentRoute.routeAudio);
        } else {
            this.stopAudio();
        }
        this.toast(`Маршрут "${this.currentRoute.name}" начат`, "success", { key: `start:${this.currentRoute.id}`, cooldownMs: 1200 });
        this.renderPoint();
    }

    async openRouteFromFavorite(routeId) {
        if (this.isOffline) return this.toast("Нет связи с сервером", "error");
        try {
            this.currentRoute = await this.api(`/api/route/${routeId}`);
            this.switchPage("page-main");
            this.currentPointIndex = 0;
            this.showingMap = false;
            this.startRoute();
            this.toast(`Открыт маршрут: ${this.currentRoute.name}`, "success", { key: `favorite-open:${routeId}`, cooldownMs: 1000 });
        } catch {
            this.toast("Не удалось открыть маршрут из избранного", "error");
        }
    }

    setViewerSpinner(show) {
        this.els.spinner.classList.toggle("hidden", !show);
    }

    mountIframe(container, panoramaId) {
        return new Promise((resolve) => {
            this.setViewerSpinner(true);
            container.innerHTML = "";
            const iframe = document.createElement("iframe");
            iframe.width = "100%";
            iframe.height = "100%";
            iframe.allowFullscreen = true;
            iframe.style.border = "none";
            iframe.src = `https://panoraven.com/en/embed/${panoramaId}`;
            let done = false;

            const finish = () => {
                if (done) return;
                done = true;
                this.setViewerSpinner(false);
                resolve();
            };

            iframe.onload = finish;
            container.appendChild(iframe);
            setTimeout(() => {
                if (!done) {
                    this.setViewerSpinner(false);
                    if (!navigator.onLine || this.isOffline) {
                        this.toast("Сеть недоступна: панорама может не загрузиться", "warning");
                    }
                    done = true;
                    resolve();
                }
            }, 4000);
        });
    }

    async renderPoint() {
        const point = this.currentRoute.pointsData[this.currentPointIndex];
        const totalPoints = this.currentRoute.pointsData.length;
        const totalSteps = totalPoints * 2 - 1;
        const currentStep = this.currentPointIndex * 2 + (this.showingMap ? 1 : 0);
        const percent = Math.max(0, Math.round((currentStep / totalSteps) * 100));

        this.els.progressBar.style.width = `${percent}%`;
        if (percent !== this.lastSavedPercent) {
            this.lastSavedPercent = percent;
            this.saveProgress(percent, this.currentRoute.name);
        }

        if (!this.showingMap) {
            this.els.pointTitle.innerText = point.title;
            this.els.pointDesc.innerText = point.desc;
            this.els.pointSource.innerHTML = `<i class="fas fa-scroll"></i> Источник: ${point.source}`;
            this.els.mapLayer.classList.remove("active");
            this.els.panoLayer.classList.add("active");
            this.els.descPanel.style.opacity = "1";
            await this.mountIframe(this.els.panoLayer, point.panorama);
            this.checkFavoriteState();
        } else {
            this.els.panoLayer.classList.remove("active");
            this.els.mapLayer.classList.add("active");
            this.els.pointTitle.innerText = "Переход между точками";
            this.els.pointDesc.innerText = "Это карта перехода. Нажмите стрелку вправо, чтобы перейти к следующей локации.";
            this.els.pointSource.innerHTML = "";
            this.els.descPanel.style.opacity = "0.82";
            await this.mountIframe(this.els.mapContainer, point.nextMap);
        }

        this.els.btnPrev.classList.toggle("hidden", this.currentPointIndex === 0 && !this.showingMap);
        const isLastPoint = this.currentPointIndex === totalPoints - 1;
        const icon = this.els.btnNext.querySelector("i");
        if (isLastPoint && !this.showingMap) {
            icon.className = "fas fa-flag-checkered";
            this.els.btnNext.title = "Завершить маршрут";
        } else {
            icon.className = "fas fa-chevron-right";
            this.els.btnNext.title = "Далее";
        }
    }

    handleNext() {
        const point = this.currentRoute.pointsData[this.currentPointIndex];
        const isLastPoint = this.currentPointIndex === this.currentRoute.pointsData.length - 1;

        // Если сейчас не показывается карта и для точки задана карта перехода
        if (!this.showingMap && point.nextMap) {
            this.showingMap = true;
            this.renderPoint();
            return;
        }

        // Если сейчас показывается карта – просто переходим к следующей точке
        if (this.showingMap) {
            this.showingMap = false;
            this.currentPointIndex += 1;
            this.renderPoint();
            return;
        }

        // Если карта не нужна и это не последняя точка – идём дальше
        if (!this.showingMap && !point.nextMap && !isLastPoint) {
            this.currentPointIndex += 1;
            this.renderPoint();
            return;
        }

        // Последняя точка без карты -> викторина
        if (isLastPoint) this.startQuiz();
    }

    handlePrev() {
        if (this.showingMap) {
            this.showingMap = false;
            this.renderPoint();
            return;
        }
        if (this.currentPointIndex > 0) {
            this.currentPointIndex -= 1;
            this.showingMap = true;
            this.renderPoint();
        }
    }

    restartRoute() {
        this.currentPointIndex = 0;
        this.showingMap = false;
        this.renderPoint();
    }

    returnToMainMenu() {
        this.stopAudio();
        this.currentPointIndex = 0;
        this.showingMap = false;
        this.els.routeBlock.classList.add("hidden");
        this.els.quizBlock.classList.add("hidden");
        this.els.selectionBlock.classList.remove("hidden");
        this.loadThemes();
    }

    stopAudio() {
        this.audio.pause();
        this.audio.currentTime = 0;
    }

    setRouteAudio(src) {
        if (!src) return this.stopAudio();
        const wasDifferent = this.currentRouteAudioSrc !== src;
        this.audio.loop = true;
        this.audio.preload = "auto";
        if (wasDifferent) {
            this.currentRouteAudioSrc = src;
            this.audio.src = src;
            this.audio.load();
        }
        if (this.audioEnabled) {
            this.audio.play().catch(() => {});
        }
    }

    async saveProgress(percent, routeName) {
        if (this.isOffline || !this.user || !this.currentRoute) return;
        try {
            const progressResult = await this.api("/api/progress", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: this.user.id,
                    routeId: this.currentRoute.id,
                    routeName,
                    percent
                })
            });
            if (progressResult?.xpGained > 0) {
                this.toast(`+${progressResult.xpGained} XP`, "success", { key: `xp:${this.currentRoute.id}:${progressResult.percent}`, cooldownMs: 900 });
            }
            const updated = await this.api(`/api/user/${this.user.id}`);
            this.user.total_xp = Number(updated.total_xp) || 0;
            this.user.current_level = Number(updated.current_level) || 1;
            sessionStorage.setItem("samara_user", JSON.stringify(this.user));
            this.updateLevelAndRank(this.user.total_xp, this.user.current_level);
        } catch {
            this.handleConnectionChange(false);
        }
    }

    async checkFavoriteState() {
        if (this.isOffline || !this.user || this.showingMap) return;
        try {
            const favs = await this.api(`/api/favorites/${this.user.id}`);
            const btn = document.getElementById("btn-favorite");
            const icon = btn.querySelector("i");
            const isFav = favs.some((f) => f.route_id === this.currentRoute.id && f.point_index === this.currentPointIndex);
            icon.className = isFav ? "fas fa-heart" : "far fa-heart";
            btn.style.color = isFav ? "var(--primary)" : "var(--gold)";
        } catch {
            this.handleConnectionChange(false);
        }
    }

    async toggleFavorite() {
        if (this.isOffline) return this.toast("Нет связи с сервером", "error");
        if (this.showingMap) return this.toast("Избранное доступно только для точки маршрута", "warning");
        const point = this.currentRoute.pointsData[this.currentPointIndex];
        try {
            const data = await this.api("/api/favorites", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: this.user.id,
                    routeId: this.currentRoute.id,
                    pointIndex: this.currentPointIndex,
                    pointTitle: point.title,
                    pointPanorama: point.panorama
                })
            });
            this.toast(data.action === "added" ? "Добавлено в избранное" : "Удалено из избранного", "success");
            this.checkFavoriteState();
        } catch {
            this.handleConnectionChange(false);
        }
    }

    startQuiz() {
        this.stopAudio();
        this.els.routeBlock.classList.add("hidden");
        this.els.quizBlock.classList.remove("hidden");
        this.toast("Маршрут завершен, откройте викторину", "info", { key: "quiz:start", cooldownMs: 1200 });
        let html = "";
        this.currentRoute.quiz.forEach((q, i) => {
            html += `<div class="quiz-q" data-q="${i}"><h4>${i + 1}. ${q.q}</h4>`;
            q.options.forEach((opt, j) => {
                html += `<div class="quiz-option" onclick="app.answerQuiz(${i},${j},${q.ans})">${opt}</div>`;
            });
            html += "</div>";
        });
        document.getElementById("quiz-content").innerHTML = html;
        this.quizState = { answered: 0, errors: 0, total: this.currentRoute.quiz.length };
    }

    answerQuiz(qIdx, selected, correct) {
        const block = document.querySelector(`.quiz-q[data-q="${qIdx}"]`);
        if (block.dataset.answered) return;
        block.dataset.answered = "true";
        this.quizState.answered += 1;
        const options = block.querySelectorAll(".quiz-option");
        if (selected === correct) {
            options[selected].classList.add("correct");
        } else {
            options[selected].classList.add("incorrect");
            options[correct].classList.add("correct");
            this.quizState.errors += 1;
        }
    }

    finishQuiz() {
        if (this.quizState.answered < this.quizState.total) {
            this.toast("Ответьте на все вопросы викторины", "warning");
            return;
        }
        if (this.quizState.errors > this.quizState.total / 2) {
            this.toast(`Ошибок: ${this.quizState.errors}. Маршрут нужно пройти заново.`, "error");
            this.els.quizBlock.classList.add("hidden");
            this.els.routeBlock.classList.remove("hidden");
            this.currentPointIndex = 0;
            this.showingMap = false;
            this.renderPoint();
            return;
        }

        this.toast("Маршрут успешно завершен!", "success");
        this.saveProgress(100, this.currentRoute.name);
        this.returnToMainMenu();
    }

    async loadProfileData() {
        if (this.isOffline) return;

        document.querySelectorAll(".avatar-options img").forEach((img) => {
            img.onclick = async () => {
                if (this.isOffline) return this.toast("Нет связи с сервером", "error");
                const avatar = img.dataset.avatar;
                try {
                    await this.api("/api/avatar", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ userId: this.user.id, avatar })
                    });
                    this.user.avatar = avatar;
                    sessionStorage.setItem("samara_user", JSON.stringify(this.user));
                    this.updateUserUI();
                    this.toast("Аватар обновлен", "success");
                } catch {
                    this.handleConnectionChange(false);
                }
            };
        });

        try {
            const progress = await this.api(`/api/progress/${this.user.id}`);
            const routesList = document.getElementById("profile-routes-list");
            routesList.innerHTML = progress.length ? "" : '<p class="text-center mt-2" style="color:#888">Маршруты пока не пройдены</p>';
            progress.forEach((row) => {
                routesList.insertAdjacentHTML(
                    "beforeend",
                    `<div class="list-item"><div class="icon-box"><i class="fas fa-map-marked-alt"></i></div><div class="w-100"><h4 style="margin-bottom:8px">${row.route_name || row.route_id}</h4><div class="progress-bar-container" style="height:6px; margin:0"><div class="progress-bar" style="width:${row.progress_percent}%"></div></div><small style="color:#aaa; display:block; margin-top:5px">Прогресс: ${row.progress_percent}%</small></div></div>`
                );
            });

            const favorites = await this.api(`/api/favorites/${this.user.id}`);
            const favList = document.getElementById("profile-favorites-list");
            favList.innerHTML = favorites.length ? "" : '<p class="text-center mt-2" style="color:#888">Пока ничего не добавлено</p>';
            favorites.forEach((fav) => {
                favList.insertAdjacentHTML(
                    "beforeend",
                    `<button class="list-item list-item-action" type="button" data-route-id="${fav.route_id}"><div class="icon-box"><i class="fas fa-star text-gold"></i></div><div class="w-100"><h4>${fav.point_title}</h4><small style="color:#b8aa8d; display:block; margin-top:4px">Открыть маршрут с начала</small></div><i class="fas fa-arrow-right text-gold"></i></button>`
                );
            });
            favList.querySelectorAll(".list-item-action").forEach((item) => {
                item.onclick = () => this.openRouteFromFavorite(item.dataset.routeId);
            });

            const updated = await this.api(`/api/user/${this.user.id}`);
            this.user.total_xp = Number(updated.total_xp) || 0;
            this.user.current_level = Number(updated.current_level) || 1;
            sessionStorage.setItem("samara_user", JSON.stringify(this.user));
            this.updateLevelAndRank(this.user.total_xp, this.user.current_level);
            this.toast("Профиль и прогресс обновлены", "info", { key: "profile:loaded", cooldownMs: 1500 });
        } catch {
            this.handleConnectionChange(false);
        }
    }
}

const app = new SamaraApp();