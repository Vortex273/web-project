class PanoramaViewer {
    /**
     * @param {HTMLElement} container - контейнер
     * @param {string[]} frames - массив URL изображений
     * @param {Object} options - настройки
     * @param {boolean} options.loop - горизонтальная бесконечная прокрутка (по умолч. true)
     * @param {number} options.preloadCount - количество предзагружаемых соседних кадров (по умолч. 1)
     */
    constructor(container, frames = [], options = {}) {
        this.container = container;
        this.frames = frames;
        this.loop = options.loop !== false;
        this.preloadCount = options.preloadCount ?? 1;

        this.currentFrame = 0;
        this.loadingFrame = null;
        this.imageCache = new Map();

        this.posX = 0;
        this.posY = 0;
        this.scale = 1;
        this.minScale = 1;
        this.maxScale = 6;

        this.isDragging = false;
        this.startX = 0;
        this.startY = 0;
        this.startPosX = 0;
        this.startPosY = 0;

        this.init();
    }

    init() {
        this.container.innerHTML = "";

        this.wrapper = document.createElement("div");
        this.wrapper.className = "panorama-wrapper";

        this.image = document.createElement("img");
        this.image.className = "panorama-image";
        this.image.draggable = false;

        this.loader = document.createElement("div");
        this.loader.className = "panorama-loader";
        this.loader.textContent = "Загрузка...";
        this.loader.style.display = "none";

        this.wrapper.appendChild(this.image);
        this.wrapper.appendChild(this.loader);
        this.container.appendChild(this.wrapper);

        this.bindEvents();
        this.preloadFrames(0);
        this.loadFrame(0);
    }

    bindEvents() {
        this.image.addEventListener("mousedown", (e) => {
            e.preventDefault();
            this.isDragging = true;
            this.startX = e.clientX;
            this.startY = e.clientY;
            this.startPosX = this.posX;
            this.startPosY = this.posY;
            this.wrapper.classList.add("dragging");
        });

        window.addEventListener("mouseup", () => {
            this.isDragging = false;
            this.wrapper.classList.remove("dragging");
        });

        window.addEventListener("mousemove", (e) => {
            if (!this.isDragging) return;
            let dx = e.clientX - this.startX;
            let dy = e.clientY - this.startY;
            let newPosX = this.startPosX + dx;
            let newPosY = this.startPosY + dy;

            // Пытаемся переключить кадр, если вышли за границу
            const switched = this.trySwitchFrameByPosition(newPosX);
            if (switched) {
                // Переключение произошло – корректируем начальные точки для плавного продолжения перетаскивания
                this.startPosX = this.posX;
                this.startX = e.clientX;
                newPosX = this.posX;
            } else {
                this.posX = newPosX;
            }

            this.posY = newPosY;
            this.limitPosition();
            this.updateTransform();
        });

        this.wrapper.addEventListener("wheel", (e) => {
            e.preventDefault();
            const rect = this.wrapper.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const oldScale = this.scale;
            const zoomIntensity = 0.15;
            if (e.deltaY < 0) this.scale += zoomIntensity;
            else this.scale -= zoomIntensity;
            this.scale = Math.max(this.minScale, Math.min(this.maxScale, this.scale));
            const scaleFactor = this.scale / oldScale;
            this.posX = mouseX - (mouseX - this.posX) * scaleFactor;
            this.posY = mouseY - (mouseY - this.posY) * scaleFactor;

            // После зума тоже проверяем выход за границы
            this.trySwitchFrameByPosition(this.posX);
            this.limitPosition();
            this.updateTransform();
        }, { passive: false });

        this.image.addEventListener("dragstart", (e) => e.preventDefault());
        window.addEventListener("resize", () => this.resize());
    }

    // Возвращает отображаемые размеры изображения с учётом масштаба и подгонки по высоте
    getDisplaySize() {
        const wrapperHeight = this.wrapper.clientHeight;
        const naturalWidth = this.image.naturalWidth;
        const naturalHeight = this.image.naturalHeight;
        const fitScale = wrapperHeight / naturalHeight;
        const finalScale = fitScale * this.scale;
        return {
            width: naturalWidth * finalScale,
            height: naturalHeight * finalScale,
            fitScale: fitScale
        };
    }

    // Нормализация позиции по горизонтали (только если loop выключен)
    normalizeHorizontalPosition() {
        if (!this.loop) return;
        const { width: imgWidth } = this.getDisplaySize();
        const wrapWidth = this.wrapper.clientWidth;
        if (imgWidth <= wrapWidth) return;
        const minX = wrapWidth - imgWidth;
        const maxX = 0;
        let newX = this.posX;
        if (newX > maxX) {
            const delta = Math.ceil((newX - maxX) / imgWidth) * imgWidth;
            newX -= delta;
            if (this.isDragging) {
                this.startPosX -= delta;
                this.startX -= delta;
            }
        } else if (newX < minX) {
            const delta = Math.ceil((minX - newX) / imgWidth) * imgWidth;
            newX += delta;
            if (this.isDragging) {
                this.startPosX += delta;
                this.startX += delta;
            }
        }
        this.posX = newX;
    }

    // Ограничение позиции по вертикали и горизонтали (без переключения кадров)
    limitPosition() {
        const wrapperWidth = this.wrapper.clientWidth;
        const wrapperHeight = this.wrapper.clientHeight;
        const { width: imgWidth, height: imgHeight } = this.getDisplaySize();

        if (!this.loop) {
            if (imgWidth <= wrapperWidth) {
                this.posX = (wrapperWidth - imgWidth) / 2;
            } else {
                this.posX = Math.min(0, Math.max(wrapperWidth - imgWidth, this.posX));
            }
        } else {
            if (imgWidth <= wrapperWidth) {
                this.posX = (wrapperWidth - imgWidth) / 2;
            }
        }

        if (imgHeight <= wrapperHeight) {
            this.posY = (wrapperHeight - imgHeight) / 2;
        } else {
            this.posY = Math.min(0, Math.max(wrapperHeight - imgHeight, this.posY));
        }
    }

    updateTransform() {
        const { fitScale } = this.getDisplaySize();
        const finalScale = fitScale * this.scale;
        this.image.style.transform = `translate(${this.posX}px, ${this.posY}px) scale(${finalScale})`;
    }

    // Пытается переключить кадр, если позиция вышла за границы текущего.
    // Возвращает true, если переключение произошло.
    trySwitchFrameByPosition(currentX) {
        if (!this.loop) return false;
        if (this.frames.length <= 1) return false;

        const { width: imgWidth } = this.getDisplaySize();
        const wrapWidth = this.wrapper.clientWidth;
        if (imgWidth <= wrapWidth) return false;

        const minX = wrapWidth - imgWidth;
        const maxX = 0;
        let newFrameIndex = -1;
        let deltaX = 0;

        if (currentX > maxX) {
            // Перетянули вправо – нужен предыдущий кадр
            newFrameIndex = this.currentFrame - 1;
            if (newFrameIndex < 0 && this.loop) newFrameIndex = this.frames.length - 1;
            if (newFrameIndex !== this.currentFrame && newFrameIndex >= 0 && newFrameIndex < this.frames.length) {
                deltaX = -imgWidth;
            } else {
                return false;
            }
        } else if (currentX < minX) {
            // Перетянули влево – нужен следующий кадр
            newFrameIndex = this.currentFrame + 1;
            if (newFrameIndex >= this.frames.length && this.loop) newFrameIndex = 0;
            if (newFrameIndex !== this.currentFrame && newFrameIndex >= 0 && newFrameIndex < this.frames.length) {
                deltaX = imgWidth;
            } else {
                return false;
            }
        } else {
            return false;
        }

        // Проверяем, загружен ли нужный кадр в кэш
        const cached = this.imageCache.get(newFrameIndex);
        if (cached && cached instanceof HTMLImageElement) {
            // Мгновенное переключение на уже загруженное изображение
            this.switchToFrameSynchronously(newFrameIndex, deltaX);
            return true;
        } else {
            // Кадр ещё не загружен – не переключаем, ограничиваем позицию текущей границей
            this.posX = Math.min(maxX, Math.max(minX, currentX));
            return false;
        }
    }

    // Синхронное переключение на кадр, который уже есть в кэше
    switchToFrameSynchronously(newIndex, deltaX) {
        const img = this.imageCache.get(newIndex);
        if (!img || !(img instanceof HTMLImageElement)) return;

        this.image.src = img.src;
        this.currentFrame = newIndex;
        this.posX += deltaX;

        this.limitPosition();
        this.updateTransform();

        // Корректируем начальные точки перетаскивания, если активен drag
        if (this.isDragging) {
            this.startPosX = this.posX;
            // startX не меняем – относительное движение мыши сохранится
        }
    }

    // === Загрузка и кэширование ===
    preloadFrames(centerIndex) {
        for (let i = -this.preloadCount; i <= this.preloadCount; i++) {
            const idx = centerIndex + i;
            if (idx === centerIndex) continue;
            if (idx >= 0 && idx < this.frames.length) {
                this.loadImageToCache(idx);
            }
        }
    }

    loadImageToCache(index) {
        if (this.imageCache.has(index)) {
            const cached = this.imageCache.get(index);
            if (cached instanceof HTMLImageElement) return Promise.resolve(cached);
            if (cached instanceof Promise) return cached;
        }
        const url = this.frames[index];
        if (!url) return Promise.reject("No URL");
        const img = new Image();
        img.crossOrigin = "Anonymous";
        const promise = new Promise((resolve, reject) => {
            img.onload = () => {
                this.imageCache.set(index, img);
                resolve(img);
            };
            img.onerror = reject;
            img.src = url;
        });
        this.imageCache.set(index, promise);
        return promise;
    }

    async loadFrame(index) {
        if (index === this.currentFrame && this.image.src !== "") return;
        if (index < 0 || index >= this.frames.length) return;

        this.loader.style.display = "flex";
        this.loadingFrame = index;

        try {
            let cached = this.imageCache.get(index);
            if (cached && cached instanceof HTMLImageElement) {
                this.applyImage(cached, index);
            } else {
                const img = await this.loadImageToCache(index);
                this.applyImage(img, index);
            }
        } catch (err) {
            console.error("Ошибка загрузки кадра", index, err);
        } finally {
            this.loader.style.display = "none";
            this.loadingFrame = null;
        }

        this.preloadFrames(index);
    }

    applyImage(img, index) {
        const oldWidth = this.image.naturalWidth;
        const oldHeight = this.image.naturalHeight;

        this.image.src = img.src;
        this.currentFrame = index;

        this.image.onload = () => {
            if (oldWidth && this.loop) {
                const wrapWidth = this.wrapper.clientWidth;
                const oldDisplayWidth = oldWidth * (this.wrapper.clientHeight / oldHeight) * this.scale;
                const newDisplayWidth = this.image.naturalWidth * (this.wrapper.clientHeight / this.image.naturalHeight) * this.scale;
                if (oldDisplayWidth > 0 && newDisplayWidth > 0) {
                    let relativeX = (wrapWidth - this.posX) / oldDisplayWidth;
                    this.posX = wrapWidth - relativeX * newDisplayWidth;
                    // После смены кадра проверяем, не нужно ли дополнительное переключение
                    this.trySwitchFrameByPosition(this.posX);
                }
            }
            this.limitPosition();
            this.updateTransform();
        };
        if (this.image.complete) {
            this.image.onload();
        }
    }

    // Публичные методы
    nextFrame() {
        let next = this.currentFrame + 1;
        if (next >= this.frames.length) {
            if (this.loop) next = 0;
            else return;
        }
        this.loadFrame(next);
        this.posX = 0;
        this.limitPosition();
        this.updateTransform();
    }

    prevFrame() {
        let prev = this.currentFrame - 1;
        if (prev < 0) {
            if (this.loop) prev = this.frames.length - 1;
            else return;
        }
        this.loadFrame(prev);
        this.posX = 0;
        this.limitPosition();
        this.updateTransform();
    }

    setFrame(index) {
        if (index >= 0 && index < this.frames.length) {
            this.loadFrame(index);
            this.posX = 0;
            this.limitPosition();
            this.updateTransform();
        }
    }

    setFrames(frames) {
        this.frames = frames;
        this.imageCache.clear();
        this.currentFrame = 0;
        this.preloadFrames(0);
        this.loadFrame(0);
        this.posX = 0;
        this.posY = 0;
        this.limitPosition();
        this.updateTransform();
    }

    resize() {
        this.limitPosition();
        this.updateTransform();
    }

    destroy() {
    // Удаляем обработчики событий с window
    window.removeEventListener("mouseup", this._boundMouseUp);
    window.removeEventListener("mousemove", this._boundMouseMove);
    this.wrapper.removeEventListener("wheel", this._boundWheel);
    this.image.removeEventListener("mousedown", this._boundMouseDown);
    this.image.removeEventListener("dragstart", this._boundDragStart);
    window.removeEventListener("resize", this._boundResize);
    
    // Очищаем DOM
    if (this.wrapper && this.wrapper.parentNode) {
        this.wrapper.parentNode.removeChild(this.wrapper);
    }
}

    }

window.PanoramaViewer = PanoramaViewer;