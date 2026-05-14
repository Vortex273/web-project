class PanoramaViewer {
    constructor(container, frames = []) {
        this.container = container;
        this.frames = frames;

        this.currentFrame = 0;

        // Позиция изображения
        this.posX = 0;
        this.posY = 0;

        // Масштаб
        this.scale = 1;
        this.minScale = 1;
        this.maxScale = 6;

        // Drag
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

        this.wrapper.appendChild(this.image);
        this.container.appendChild(this.wrapper);

        this.render();
        this.bindEvents();
    }

    bindEvents() {
        // DRAG START
        this.wrapper.addEventListener("mousedown", (e) => {
            this.isDragging = true;

            this.startX = e.clientX;
            this.startY = e.clientY;

            this.startPosX = this.posX;
            this.startPosY = this.posY;

            this.wrapper.classList.add("dragging");
        });

        // DRAG END
        window.addEventListener("mouseup", () => {
            this.isDragging = false;
            this.wrapper.classList.remove("dragging");
        });

        // DRAG MOVE
        window.addEventListener("mousemove", (e) => {
            if (!this.isDragging) return;

            const dx = e.clientX - this.startX;
            const dy = e.clientY - this.startY;

            this.posX = this.startPosX + dx;
            this.posY = this.startPosY + dy;

            this.limitPosition();
            this.updateTransform();
        });

        // ZOOM
        this.wrapper.addEventListener(
            "wheel",
            (e) => {
                e.preventDefault();

                const rect = this.wrapper.getBoundingClientRect();

                // Координаты мыши внутри контейнера
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;

                // Старый масштаб
                const oldScale = this.scale;

                // Новый масштаб
                const zoomIntensity = 0.15;

                if (e.deltaY < 0) {
                    this.scale += zoomIntensity;
                } else {
                    this.scale -= zoomIntensity;
                }

                this.scale = Math.max(
                    this.minScale,
                    Math.min(this.maxScale, this.scale)
                );

                // Коэффициент изменения масштаба
                const scaleFactor = this.scale / oldScale;

                // ВАЖНО:
                // zoom происходит относительно текущего центра/курсора
                this.posX =
                    mouseX - (mouseX - this.posX) * scaleFactor;

                this.posY =
                    mouseY - (mouseY - this.posY) * scaleFactor;

                this.limitPosition();
                this.updateTransform();
            },
            { passive: false }
        );
    }

    limitPosition() {
    const wrapperWidth = this.wrapper.clientWidth;
    const wrapperHeight = this.wrapper.clientHeight;

    // РЕАЛЬНЫЕ размеры изображения
    const naturalWidth = this.image.naturalWidth;
    const naturalHeight = this.image.naturalHeight;

    // Масштаб под высоту контейнера
    const fitScale = wrapperHeight / naturalHeight;

    // ФАКТИЧЕСКИЕ размеры изображения на экране
    const imageWidth =
        naturalWidth * fitScale * this.scale;

    const imageHeight =
        naturalHeight * fitScale * this.scale;

    /*
        X ГРАНИЦЫ
    */

    // Если изображение уже контейнера —
    // центрируем и запрещаем двигать
    if (imageWidth <= wrapperWidth) {
        this.posX = (wrapperWidth - imageWidth) / 2;
    } else {
        // Левый край
        const maxX = 0;

        // Правый край
        const minX = wrapperWidth - imageWidth;

        this.posX = Math.min(
            maxX,
            Math.max(minX, this.posX)
        );
    }

    /*
        Y ГРАНИЦЫ
    */

    // Если изображение ниже контейнера
    if (imageHeight <= wrapperHeight) {
        this.posY = (wrapperHeight - imageHeight) / 2;
    } else {
        const maxY = 0;
        const minY = wrapperHeight - imageHeight;

        this.posY = Math.min(
            maxY,
            Math.max(minY, this.posY)
        );
    }
}

    updateTransform() {
    const wrapperHeight = this.wrapper.clientHeight;

    // Автомасштаб по высоте
    const fitScale =
        wrapperHeight / this.image.naturalHeight;

    const finalScale = fitScale * this.scale;

    this.image.style.transform = `
        translate(${this.posX}px, ${this.posY}px)
        scale(${finalScale})
    `;
}

    render() {
        if (!this.frames.length) return;

        this.image.src = this.frames[0];

        this.image.onload = () => {
            // СТАРТ:
            // показываем ЛЕВЫЙ край изображения
            this.posX = 0;
            this.posY = 0;
            this.scale = 1;

            this.updateTransform();
        };
    }
}

window.PanoramaViewer = PanoramaViewer;