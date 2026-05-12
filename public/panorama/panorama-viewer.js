class PanoramaViewer {
    constructor(container, imageSrc) {
        this.container = container;
        this.imageSrc = imageSrc;

        this.scale = 1;
        this.minScale = 1;
        this.maxScale = 5;

        this.translateX = 0;
        this.translateY = 0;

        this.isDragging = false;

        this.startX = 0;
        this.startY = 0;

        this.init();
    }

    init() {
        this.container.innerHTML = "";

        this.wrapper = document.createElement("div");
        this.wrapper.className = "panorama-wrapper";

        this.image = document.createElement("img");
        this.image.className = "panorama-image";
        this.image.draggable = false;
        this.image.src = this.imageSrc;

        this.loader = document.createElement("div");
        this.loader.className = "panorama-loader";
        this.loader.innerHTML = "Загрузка...";

        this.wrapper.appendChild(this.image);
        this.container.appendChild(this.wrapper);
        this.container.appendChild(this.loader);

        this.image.onload = () => {
            this.loader.style.display = "none";
            this.updateTransform();
        };

        this.image.onerror = () => {
            this.loader.innerHTML = "Ошибка загрузки изображения";
        };

        this.bindEvents();
    }

    bindEvents() {
        this.container.addEventListener("wheel", (e) => {
            e.preventDefault();

            const rect = this.container.getBoundingClientRect();

            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const delta = e.deltaY > 0 ? -0.1 : 0.1;

            const prevScale = this.scale;

            this.scale += delta;
            this.scale = Math.max(this.minScale, Math.min(this.scale, this.maxScale));

            const scaleRatio = this.scale / prevScale;

            this.translateX =
                mouseX - (mouseX - this.translateX) * scaleRatio;

            this.translateY =
                mouseY - (mouseY - this.translateY) * scaleRatio;

            this.limitBounds();
            this.updateTransform();
        });

        this.container.addEventListener("mousedown", (e) => {
            this.isDragging = true;

            this.startX = e.clientX - this.translateX;
            this.startY = e.clientY - this.translateY;

            this.wrapper.style.cursor = "grabbing";
        });

        window.addEventListener("mousemove", (e) => {
            if (!this.isDragging) return;

            this.translateX = e.clientX - this.startX;
            this.translateY = e.clientY - this.startY;

            this.limitBounds();
            this.updateTransform();
        });

        window.addEventListener("mouseup", () => {
            this.isDragging = false;
            this.wrapper.style.cursor = "grab";
        });

        this.container.addEventListener("mouseleave", () => {
            this.isDragging = false;
            this.wrapper.style.cursor = "grab";
        });

        window.addEventListener("resize", () => {
            this.limitBounds();
            this.updateTransform();
        });
    }

    limitBounds() {
        const containerWidth = this.container.clientWidth;
        const containerHeight = this.container.clientHeight;

        const imageWidth = this.image.naturalWidth * this.scale;
        const imageHeight = this.image.naturalHeight * this.scale;

        const minX = Math.min(0, containerWidth - imageWidth);
        const minY = Math.min(0, containerHeight - imageHeight);

        const maxX = 0;
        const maxY = 0;

        this.translateX = Math.max(minX, Math.min(maxX, this.translateX));
        this.translateY = Math.max(minY, Math.min(maxY, this.translateY));

        if (imageWidth <= containerWidth) {
            this.translateX = (containerWidth - imageWidth) / 2;
        }

        if (imageHeight <= containerHeight) {
            this.translateY = (containerHeight - imageHeight) / 2;
        }
    }

    updateTransform() {
        this.image.style.transform = `
            translate(${this.translateX}px, ${this.translateY}px)
            scale(${this.scale})
        `;
    }
}

window.PanoramaViewer = PanoramaViewer;