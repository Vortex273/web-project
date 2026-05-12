class PanoramaViewer {
            this.dragging = false;
            this.wrapper.classList.remove("dragging");
        });

        window.addEventListener("mousemove", (e) => {
            if (!this.dragging) return;

            const diff = e.clientX - this.startX;

            if (Math.abs(diff) > 12) {
                if (diff > 0) {
                    this.prevFrame();
                } else {
                    this.nextFrame();
                }

                this.startX = e.clientX;
            }
        });

        this.wrapper.addEventListener(
            "wheel",
            (e) => {
                e.preventDefault();

                if (e.deltaY > 0) {
                    this.scale -= 0.1;
                } else {
                    this.scale += 0.1;
                }

                this.scale = Math.max(1, Math.min(4, this.scale));

                this.updateTransform();
            },
            { passive: false }
        );
    }

    prevFrame() {
        this.currentFrame--;

        if (this.currentFrame < 0) {
            this.currentFrame = this.frames.length - 1;
        }

        this.render();
    }

    nextFrame() {
        this.currentFrame++;

        if (this.currentFrame >= this.frames.length) {
            this.currentFrame = 0;
        }

        this.render();
    }

    updateTransform() {
    const scale = this.scale || 1;

    this.image.style.transform =
        `translate(-50%, -50%) scale(${scale})`;
}

    render() {
    if (!this.frames.length) {
        this.image.src = "";
        return;
    }

    const src = this.frames[this.currentFrame];

    console.log('LOAD:', src);

    this.image.onload = () => {
        console.log('IMAGE LOADED');
    };

    this.image.onerror = (e) => {
        console.error('IMAGE ERROR', e);
    };

    this.image.src = src;

    this.updateTransform();
}
}

window.PanoramaViewer = PanoramaViewer;