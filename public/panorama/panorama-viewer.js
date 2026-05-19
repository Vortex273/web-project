class PanoramaViewer {
    constructor(container, frames = [], options = {}) {
        this.container = container;
        this.frames = frames;

        this.currentFrame = 0;

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

        this.track = document.createElement("div");
        this.track.className = "panorama-track";

        this.imageA = document.createElement("img");
        this.imageB = document.createElement("img");

        this.imageA.className = "panorama-image";
        this.imageB.className = "panorama-image";

        this.imageA.draggable = false;
        this.imageB.draggable = false;

        this.track.appendChild(this.imageA);
        this.track.appendChild(this.imageB);

        this.wrapper.appendChild(this.track);

        this.container.appendChild(this.wrapper);

        this.bindEvents();

        if (this.frames.length > 0) {
            this.loadImage(this.frames[0]);
        }
    }

    bindEvents() {
        this.wrapper.addEventListener("mousedown", (e) => {
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

            const dx = e.clientX - this.startX;
const dy = e.clientY - this.startY;

this.posX = this.startPosX + dx;
this.posY = this.startPosY + dy;

            this.normalizeInfinitePosition();

            this.updateTransform();
        });

        this.wrapper.addEventListener("wheel", (e) => {
            e.preventDefault();

            if (e.deltaY < 0) {
                this.scale += 0.15;
            } else {
                this.scale -= 0.15;
            }

            this.scale = Math.max(
                this.minScale,
                Math.min(this.maxScale, this.scale)
            );

            this.normalizeInfinitePosition();

            this.updateTransform();
        }, { passive: false });

        window.addEventListener("resize", () => {
            this.updateTransform();
        });
    }

    loadImage(src) {
        this.imageA.src = src;
        this.imageB.src = src;

        this.imageA.onload = () => {
            this.updateTransform();
        };
    }

    getDisplaySize() {
        const wrapperHeight = this.wrapper.clientHeight;

        const naturalWidth = this.imageA.naturalWidth;
        const naturalHeight = this.imageA.naturalHeight;

        if (!naturalWidth || !naturalHeight) {
            return {
                width: 0,
                height: 0,
                fitScale: 1
            };
        }

        const fitScale = wrapperHeight / naturalHeight;

        const finalScale = fitScale * this.scale;

        return {
            width: naturalWidth * finalScale,
            height: naturalHeight * finalScale,
            fitScale
        };
    }

    normalizeInfinitePosition() {
    const wrapperWidth =
        this.wrapper.clientWidth;

    const wrapperHeight =
        this.wrapper.clientHeight;

    const naturalWidth =
        this.imageA.naturalWidth;

    const naturalHeight =
        this.imageA.naturalHeight;

    if (!naturalWidth || !naturalHeight) return;

    const fitScale =
        wrapperHeight / naturalHeight;

    const finalScale =
        fitScale * this.scale;

    const width =
        naturalWidth * finalScale;

    const height =
        naturalHeight * finalScale;

    while (this.posX <= -width) {
        this.posX += width;
    }

    while (this.posX >= 0) {
        this.posX -= width;
    }

    const minY =
        Math.min(0, wrapperHeight - height);

    const maxY = 0;

    this.posY =
        Math.max(minY,
        Math.min(maxY, this.posY));
}

    updateTransform() {
    const wrapperHeight = this.wrapper.clientHeight;

    const naturalWidth = this.imageA.naturalWidth;
    const naturalHeight = this.imageA.naturalHeight;

    if (!naturalWidth || !naturalHeight) return;

    const fitScale = wrapperHeight / naturalHeight;

    const finalScale = fitScale * this.scale;

    const scaledWidth =
        naturalWidth * finalScale;

    const scaledHeight =
        naturalHeight * finalScale;

    this.track.style.transform =
        `translate3d(${this.posX}px, ${this.posY}px, 0)`;

    this.imageA.style.width =
        `${scaledWidth}px`;

    this.imageA.style.height =
        `${scaledHeight}px`;

    this.imageB.style.width =
        `${scaledWidth}px`;

    this.imageB.style.height =
        `${scaledHeight}px`;

    this.imageA.style.left = `0px`;

    this.imageB.style.left =
        `${scaledWidth - 2}px`;
}
    setImage(src) {
        this.loadImage(src);
    }

    destroy() {
        this.container.innerHTML = "";
    }
}

window.PanoramaViewer = PanoramaViewer;
