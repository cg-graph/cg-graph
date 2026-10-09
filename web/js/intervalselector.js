export function MakeIntervalSelector(container) {
    const rangeDefinition = container.querySelector('input[type=range]');

    const interval = document.createElement("div");
    interval.classList.add("interval");
    interval.draggable = true;

    const sliders = [0, 1].map(end => {
        const slider = document.createElement('input');
        slider.type = "range";
        slider.min = rangeDefinition.min;
        slider.max = rangeDefinition.max;
        slider.value = rangeDefinition.value;
        slider.step = rangeDefinition.step;
        slider.onchange = (event) => {
            const clone = new Event('change');
            container.dispatchEvent(clone);
        }
        slider.oninput = (event) => {
            const clone = new Event('change');
            container.dispatchEvent(clone);
        }
        return slider;
    });
    container.replaceChildren(...sliders, interval);
    container.addEventListener("change", (event) => {
        const reference = container.querySelector('input[type=range]');
        const values = [...container.querySelectorAll("input[type=range]")].map(i => 100 * (i.value - reference.min) / (reference.max - reference.min));
        interval.style.left = `${Math.min(...values)}%`;
        interval.style.width = `${Math.max(...values) - Math.min(...values)}%`;
    });
    interval.addEventListener("dragstart", (event) => {
        event.preventDefault();
        interval.dragging = true;
        interval.start_values = [...container.querySelectorAll("input[type=range]")].map(i => parseInt(i.value));
        interval.start_x = event.clientX;
    });
    document.addEventListener("mousemove", (event) => {
        if (interval.dragging) {
            const reference = container.querySelector('input[type=range]');
            const dval = Math.trunc((event.clientX - interval.start_x) / container.clientWidth * (reference.max - reference.min));
            let changed = false;
            container.querySelectorAll("input[type=range]").forEach((obj, index) => {
                if (parseInt(obj.value) !== interval.start_values[index] + dval) {
                    obj.value = interval.start_values[index] + dval;
                    changed = true;
                }
            });
            if (changed) {
                const clone = new Event('change');
                container.dispatchEvent(clone);
            }
        }
    })
    document.addEventListener("mouseup", (event) => {
        interval.dragging = false;
    });
}

document.querySelectorAll(".intervalselector").forEach(MakeIntervalSelector);